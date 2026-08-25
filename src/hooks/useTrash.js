import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { coalesceRefetch } from '../lib/realtimeRefetch';
import { currentActor } from '../lib/activityLog';

export function useTrash() {
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchTrash = useCallback(async () => {
    // Sweep anything past its 7-day window before showing the list — this
    // project has no scheduled server-side job, so the Trash page opening
    // is what triggers the purge.
    await supabase.rpc('purge_expired_trash');

    const { data, error } = await supabase
      .from('trash')
      .select('*')
      .order('deleted_at', { ascending: false });
    if (!error) setItems(data || []);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const refetchTrash = coalesceRefetch(fetchTrash);
    // This effect's job is to subscribe to an external system (Supabase:
    // an initial fetch plus a realtime channel) and push what it reports
    // back into React state — the case the rule explicitly allows for. It
    // is not derived state being patched in after a render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchTrash();

    const channel = supabase
      .channel('trash-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trash' }, refetchTrash)
      .subscribe();

    return () => {
      refetchTrash.cancel();
      supabase.removeChannel(channel);
    };
  }, [fetchTrash]);

  const restoreItem = async (trashId) => {
    const { performedBy } = currentActor();
    const { error } = await supabase.rpc('restore_trash_item', {
      p_trash_id: trashId,
      p_performed_by: performedBy
    });
    if (error) throw new Error(error.message);
    setItems(prev => prev.filter(i => i.id !== trashId));
  };

  const permanentlyDelete = async (trashId) => {
    const { performedBy } = currentActor();
    const { error } = await supabase.rpc('purge_trash_item', {
      p_trash_id: trashId,
      p_performed_by: performedBy
    });
    if (error) throw new Error(error.message);
    setItems(prev => prev.filter(i => i.id !== trashId));
  };

  return { items, isLoading, restoreItem, permanentlyDelete };
}
