import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { coalesceRefetch } from '../lib/realtimeRefetch';

// Debt settlements for a single customer — this is the app's "payments"
// concept (see useDebts.js); there is no separate payments table.
//
// Settlements are resolved two ways and merged:
//   1. debt_settlements.customer_id — how settle_debt_transaction stamps them.
//   2. the customer's own debts, matched by debt_id — a fallback for rows
//      where customer_id was never populated (the column is nullable, and
//      rows written before it was stamped consistently have it NULL). Relying
//      on customer_id alone made Payment History come back empty for those
//      customers even though their settlements existed.
export function useCustomerPayments(customerId) {
  const [payments, setPayments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchPayments = useCallback(async () => {
    if (!customerId) {
      setPayments([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);

    const select = '*, debt:debts(*, sale:sales(*))';

    const [byCustomer, custDebts] = await Promise.all([
      supabase.from('debt_settlements').select(select).eq('customer_id', customerId),
      supabase.from('debts').select('id').eq('customer_id', customerId)
    ]);

    if (byCustomer.error) {
      console.error("Failed to fetch payment history:", byCustomer.error);
      setError(byCustomer.error.message);
      setPayments([]);
      setIsLoading(false);
      return;
    }

    const rowsById = new Map((byCustomer.data || []).map(p => [p.id, p]));

    const debtIds = (custDebts.data || []).map(d => d.id);
    if (debtIds.length > 0) {
      const { data: byDebt, error: byDebtErr } = await supabase
        .from('debt_settlements')
        .select(select)
        .in('debt_id', debtIds);

      if (byDebtErr) {
        console.error("Failed to fetch payment history by debt:", byDebtErr);
      } else {
        (byDebt || []).forEach(p => rowsById.set(p.id, p));
      }
    }

    const merged = Array.from(rowsById.values())
      .sort((a, b) => new Date(b.settlement_date) - new Date(a.settlement_date));

    setError(null);
    setPayments(merged);
    setIsLoading(false);
  }, [customerId]);

  useEffect(() => {
    const refetchPayments = coalesceRefetch(fetchPayments);
    // This effect's job is to subscribe to an external system (Supabase:
    // an initial fetch plus a realtime channel) and push what it reports
    // back into React state — the case the rule explicitly allows for. It
    // is not derived state being patched in after a render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPayments();

    if (!customerId) return;

    const channel = supabase
      .channel(`customer-payments-realtime-${customerId}-${Math.random()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'debt_settlements' },
        refetchPayments
      )
      .subscribe();

    return () => {
      refetchPayments.cancel();
      supabase.removeChannel(channel);
    };
  }, [customerId, fetchPayments]);

  return { payments, isLoading, error };
}
