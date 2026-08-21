import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

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
    fetchCustomerPrices();

    const channel = supabase
      .channel(`customer-cube-prices-realtime-${Math.random()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'customer_cube_prices' },
        () => {
          fetchCustomerPrices();
        }
      )
      .subscribe();

    return () => {
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
  };

  const clearCustomPrice = async (customerId, cubeType) => {
    const { error } = await supabase
      .from('customer_cube_prices')
      .delete()
      .eq('customer_id', customerId)
      .eq('cube_type', cubeType);

    if (error) throw new Error(error.message);
  };

  return {
    customerPrices,
    isLoading,
    setCustomPrice,
    clearCustomPrice
  };
}
