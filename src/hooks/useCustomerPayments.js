import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// Debt settlements for a single customer — this is the app's "payments"
// concept (see useDebts.js); there is no separate payments table.
export function useCustomerPayments(customerId) {
  const [payments, setPayments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!customerId) {
      setPayments([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const fetchPayments = async () => {
      const { data, error } = await supabase
        .from('debt_settlements')
        .select('*, debt:debts(*, sale:sales(*))')
        .eq('customer_id', customerId)
        .order('settlement_date', { ascending: false });

      if (cancelled) return;
      if (error) {
        console.error("Failed to fetch payment history:", error);
      }
      setPayments(data || []);
      setIsLoading(false);
    };

    fetchPayments();

    const channel = supabase
      .channel(`customer-payments-realtime-${customerId}-${Math.random()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'debt_settlements', filter: `customer_id=eq.${customerId}` },
        () => fetchPayments()
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [customerId]);

  return { payments, isLoading };
}
