import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { coalesceRefetch } from '../lib/realtimeRefetch';
import { logActivity } from '../lib/activityLog';

export function useInventory() {
  const [inventory, setInventory] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchInventory = async () => {
    try {
      const { data, error } = await supabase
        .from('inventory')
        .select('*')
        .order('id', { ascending: true });
      if (error) throw error;
      setInventory(data || []);
    } catch (err) {
      console.error("Failed to fetch inventory:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchTransactions = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('inventory_transactions')
        .select('*, inventory(*)')
        .order('created_at', { ascending: false });

      if (!error && data) {
        setTransactions(data);
        localStorage.setItem('saga_inventory_transactions', JSON.stringify(data));
      } else {
        const saved = localStorage.getItem('saga_inventory_transactions');
        setTransactions(saved ? JSON.parse(saved) : []);
      }
    } catch (err) {
      const saved = localStorage.getItem('saga_inventory_transactions');
      setTransactions(saved ? JSON.parse(saved) : []);
    }
  }, []);

  useEffect(() => {
    const refetchInventory = coalesceRefetch(fetchInventory);
    const refetchTransactions = coalesceRefetch(fetchTransactions);
    fetchInventory();
    fetchTransactions();

    const channel = supabase
      .channel(`inventory-realtime-${Math.random()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventory' },
        refetchInventory
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventory_transactions' },
        refetchTransactions
      )
      .subscribe();

    return () => {
      refetchInventory.cancel();
      refetchTransactions.cancel();
      supabase.removeChannel(channel);
    };
  }, [fetchTransactions]);

  const addStock = async (id, amount, createdBy = 'Operator') => {
    if (!amount || amount <= 0) throw new Error("Amount must be a positive number");
    
    // Call atomic PostgreSQL RPC function
    const { error: rpcErr } = await supabase.rpc('add_inventory_stock', {
      p_id: id,
      p_amount: amount,
      p_created_by: createdBy
    });

    if (rpcErr) {
      // Only fall back to the unlocked read-then-write below when the RPC
      // genuinely doesn't exist yet (Postgres 42883 = undefined_function).
      // Any other error (insufficient stock, RLS denial, etc.) is the RPC's
      // own correct, atomic validation — propagate it directly rather than
      // retrying with a path that can lose updates under concurrent stock
      // changes (two adds reading the same starting quantity).
      if (rpcErr.code !== '42883') {
        throw new Error(rpcErr.message);
      }

      const { data: item, error: getErr } = await supabase
        .from('inventory')
        .select('*')
        .eq('id', id)
        .single();

      if (getErr || !item) throw new Error("Item not found");

      const prevQty = item.quantity;
      const newQty = prevQty + amount;

      const { error: updateErr } = await supabase
        .from('inventory')
        .update({
          quantity: newQty,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (updateErr) throw new Error(updateErr.message);

      // Record transaction log
      const txnRecord = {
        inventory_id: id,
        transaction_type: 'add',
        quantity_change: amount,
        previous_quantity: prevQty,
        new_quantity: newQty,
        reference_code: 'STOCK_ADD',
        created_by: createdBy,
        created_at: new Date().toISOString()
      };

      try {
        await supabase.from('inventory_transactions').insert([txnRecord]);
      } catch (e) {
        console.warn("Txn log insert fallback:", e);
      }

      const updatedTxns = [{ ...txnRecord, id: Date.now(), inventory: item }, ...transactions];
      setTransactions(updatedTxns);
      localStorage.setItem('saga_inventory_transactions', JSON.stringify(updatedTxns));
    } else {
      fetchTransactions();
    }
    logActivity({ action: 'create', entityType: 'inventory', entityId: id, description: `Added ${amount} units of stock`, performedBy: createdBy });
  };

  const removeStock = async (id, amount, createdBy = 'Operator') => {
    if (!amount || amount <= 0) throw new Error("Amount must be a positive number");

    // Call atomic PostgreSQL RPC function with row locking
    const { error: rpcErr } = await supabase.rpc('deduct_inventory_stock', {
      p_id: id,
      p_amount: amount,
      p_created_by: createdBy
    });

    if (rpcErr) {
      // Same reasoning as addStock above: only fall back when the RPC is
      // genuinely missing, never on a real validation error, and never
      // silently — this fallback's unlocked check-then-write can otherwise
      // let two concurrent removals both pass the stock check and drive
      // quantity negative.
      if (rpcErr.code !== '42883') {
        throw new Error(rpcErr.message);
      }

      const { data: item, error: getErr } = await supabase
        .from('inventory')
        .select('*')
        .eq('id', id)
        .single();

      if (getErr || !item) throw new Error("Item not found");
      if (item.quantity - amount < 0) throw new Error("Insufficient stock");

      const prevQty = item.quantity;
      const newQty = prevQty - amount;

      const { error: updateErr } = await supabase
        .from('inventory')
        .update({
          quantity: newQty,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (updateErr) throw new Error(updateErr.message);

      // Record transaction log
      const txnRecord = {
        inventory_id: id,
        transaction_type: 'manual_removal',
        quantity_change: -amount,
        previous_quantity: prevQty,
        new_quantity: newQty,
        reference_code: 'MANUAL_REMOVE',
        created_by: createdBy,
        created_at: new Date().toISOString()
      };

      try {
        await supabase.from('inventory_transactions').insert([txnRecord]);
      } catch (e) {
        console.warn("Txn log insert fallback:", e);
      }

      const updatedTxns = [{ ...txnRecord, id: Date.now(), inventory: item }, ...transactions];
      setTransactions(updatedTxns);
      localStorage.setItem('saga_inventory_transactions', JSON.stringify(updatedTxns));
    } else {
      fetchTransactions();
    }
    logActivity({ action: 'update', entityType: 'inventory', entityId: id, description: `Removed ${amount} units of stock`, performedBy: createdBy });
  };

  const updatePrice = async (id, price) => {
    if (price === null || price === undefined || price <= 0) {
      throw new Error("Price must be a positive decimal value");
    }

    // Call atomic PostgreSQL RPC function
    const { error: rpcErr } = await supabase.rpc('update_inventory_price', {
      p_id: id,
      p_price: price
    });

    if (rpcErr) {
      // Fallback if RPC not created yet
      const { error: updateErr } = await supabase
        .from('inventory')
        .update({
          price_per_cube: price,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (updateErr) throw new Error(updateErr.message);
    }
    logActivity({ action: 'update', entityType: 'inventory', entityId: id, description: `Updated price per cube to LKR ${Number(price).toLocaleString()}` });
  };

  return {
    inventory,
    transactions,
    isLoading,
    addStock,
    removeStock,
    updatePrice,
    refreshTransactions: fetchTransactions
  };
}
