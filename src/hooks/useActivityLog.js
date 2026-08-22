import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

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
    fetchEntries();

    const channel = supabase
      .channel('activity-log-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_log' }, fetchEntries)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [fetchEntries]);

  return { entries, isLoading, refresh: fetchEntries };
}
