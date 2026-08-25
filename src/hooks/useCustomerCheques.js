import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { coalesceRefetch } from '../lib/realtimeRefetch';

// Cheques received from one customer. cheque_records.customer_id is the link
// added so a cheque taken at the counter shows up against the account it
// belongs to, instead of living only in Cash & Bank as a free-text payer name.
export function useCustomerCheques(customerId) {
  const [cheques, setCheques] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCheques = useCallback(async () => {
    if (!customerId) {
      setCheques([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);

    const { data, error } = await supabase
      .from('cheque_records')
      .select('*')
      .eq('customer_id', customerId)
      .order('received_at', { ascending: false });

    if (error) {
      console.error("Failed to fetch customer cheques:", error);
    }
    setCheques(data || []);
    setIsLoading(false);
  }, [customerId]);

  useEffect(() => {
    const refetchCheques = coalesceRefetch(fetchCheques);
    // This effect's job is to subscribe to an external system (Supabase:
    // an initial fetch plus a realtime channel) and push what it reports
    // back into React state — the case the rule explicitly allows for. It
    // is not derived state being patched in after a render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchCheques();

    if (!customerId) return;

    const channel = supabase
      .channel(`customer-cheques-realtime-${customerId}-${Math.random()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cheque_records' }, refetchCheques)
      .subscribe();

    return () => {
      refetchCheques.cancel();
      supabase.removeChannel(channel);
    };
  }, [customerId, fetchCheques]);

  return { cheques, isLoading };
}
