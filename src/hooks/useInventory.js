import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export function useInventory() {
  const [inventory, setInventory] = useState([]);
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

  useEffect(() => {
    fetchInventory();

    const channel = supabase
      .channel(`inventory-realtime-${Math.random()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventory' },
        () => {
          fetchInventory();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const addStock = async (id, amount) => {
    if (!amount || amount <= 0) throw new Error("Amount must be a positive number");
    
    // Call atomic PostgreSQL RPC function
    const { error: rpcErr } = await supabase.rpc('add_inventory_stock', {
      p_id: id,
      p_amount: amount
    });

    if (rpcErr) {
      // Fallback if RPC not created yet
      const { data: item, error: getErr } = await supabase
        .from('inventory')
        .select('*')
        .eq('id', id)
        .single();
      
      if (getErr || !item) throw new Error("Item not found");

      const { error: updateErr } = await supabase
        .from('inventory')
        .update({
          quantity: item.quantity + amount,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (updateErr) throw new Error(updateErr.message);
    }
  };

  const removeStock = async (id, amount) => {
    if (!amount || amount <= 0) throw new Error("Amount must be a positive number");

    // Call atomic PostgreSQL RPC function with row locking
    const { error: rpcErr } = await supabase.rpc('deduct_inventory_stock', {
      p_id: id,
      p_amount: amount
    });

    if (rpcErr) {
      // Fallback if RPC not created yet
      const { data: item, error: getErr } = await supabase
        .from('inventory')
        .select('*')
        .eq('id', id)
        .single();

      if (getErr || !item) throw new Error("Item not found");
      if (item.quantity - amount < 0) throw new Error("Insufficient stock");

      const { error: updateErr } = await supabase
        .from('inventory')
        .update({
          quantity: item.quantity - amount,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (updateErr) throw new Error(updateErr.message);
    }
  };

  const updatePrice = async (id, price) => {
    if (price === null || price === undefined || price < 0) {
      throw new Error("Price must be a non-negative decimal value");
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
  };

  return {
    inventory,
    isLoading,
    addStock,
    removeStock,
    updatePrice
  };
}
