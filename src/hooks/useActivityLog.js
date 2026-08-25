import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { coalesceRefetch } from '../lib/realtimeRefetch';

export function useActivityLog() {
  const [entries, setEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchEntries = useCallback(async () => {
    const { data, error } = await supabase
      .from('activity_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    if (!error) setEntries(data || []);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const refetchEntries = coalesceRefetch(fetchEntries);
    // This effect's job is to subscribe to an external system (Supabase:
    // an initial fetch plus a realtime channel) and push what it reports
    // back into React state — the case the rule explicitly allows for. It
    // is not derived state being patched in after a render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchEntries();

    const channel = supabase
      .channel('activity-log-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_log' }, refetchEntries)
      .subscribe();

    return () => {
      refetchEntries.cancel();
      supabase.removeChannel(channel);
    };
  }, [fetchEntries]);

  return { entries, isLoading, refresh: fetchEntries };
}
