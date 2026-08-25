import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { coalesceRefetch } from '../lib/realtimeRefetch';
import { logActivity, currentActor } from '../lib/activityLog';

// Per-customer custom cube prices — one row per (customer, cube_type). The
// New Order wizard resolves a rate for the selected customer here first,
// falling back to the live inventory price when no override exists.
export function useCustomerPrices() {
  const [customerPrices, setCustomerPrices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCustomerPrices = async () => {
    try {
      const { data, error } = await supabase
        .from('customer_cube_prices')
        .select('*');
      if (error) throw error;
      setCustomerPrices(data || []);
    } catch (err) {
      console.error("Failed to fetch customer cube prices:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const refetchCustomerPrices = coalesceRefetch(fetchCustomerPrices);
    // This effect's job is to subscribe to an external system (Supabase:
    // an initial fetch plus a realtime channel) and push what it reports
    // back into React state — the case the rule explicitly allows for. It
    // is not derived state being patched in after a render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchCustomerPrices();

    const channel = supabase
      .channel(`customer-cube-prices-realtime-${Math.random()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'customer_cube_prices' },
        refetchCustomerPrices
      )
      .subscribe();

    return () => {
      refetchCustomerPrices.cancel();
      supabase.removeChannel(channel);
    };
  }, []);

  const setCustomPrice = async (customerId, cubeType, price) => {
    if (!price || Number(price) <= 0) {
      throw new Error("Price must be a positive number");
    }

    const { error } = await supabase
      .from('customer_cube_prices')
      .upsert(
        {
          customer_id: customerId,
          cube_type: cubeType,
          price_per_cube: Number(price),
          updated_at: new Date().toISOString()
        },
        { onConflict: 'customer_id,cube_type' }
      );

    if (error) throw new Error(error.message);
    logActivity({ action: 'update', entityType: 'customer_price', entityId: customerId, description: `Set custom ${cubeType} price for customer #${customerId} to LKR ${Number(price).toLocaleString()}` });
  };

  const clearCustomPrice = async (customerId, cubeType) => {
    const { data: existing, error: findErr } = await supabase
      .from('customer_cube_prices')
      .select('id')
      .eq('customer_id', customerId)
      .eq('cube_type', cubeType)
      .maybeSingle();
    if (findErr) throw new Error(findErr.message);
    if (!existing) return;

    const { performedBy, performedByRole } = currentActor();
    const { error } = await supabase.rpc('soft_delete_row', {
      p_table: 'customer_cube_prices',
      p_id: existing.id,
      p_deleted_by: performedBy,
      p_deleted_by_role: performedByRole
    });

    if (error) throw new Error(error.message);
  };

  return {
    customerPrices,
    isLoading,
    setCustomPrice,
    clearCustomPrice
  };
}
