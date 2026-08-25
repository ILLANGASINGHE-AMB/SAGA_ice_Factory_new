import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { coalesceRefetch } from '../lib/realtimeRefetch';
import { logActivity, currentActor } from '../lib/activityLog';

export function useNotes() {
  const [notes, setNotes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchNotes = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error) setNotes(data || []);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const refetchNotes = coalesceRefetch(fetchNotes);
    fetchNotes();

    const channel = supabase
      .channel('notes-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notes' }, refetchNotes)
      .subscribe();

    return () => {
      refetchNotes.cancel();
      supabase.removeChannel(channel);
    };
  }, [fetchNotes]);

  const addNote = async (noteText, createdBy) => {
    if (!noteText || !noteText.trim()) throw new Error('Note text is required');
    const { data, error } = await supabase
      .from('notes')
      .insert({ note_text: noteText.trim(), created_by: createdBy || 'Operator' })
      .select()
      .single();
    if (error) throw new Error(error.message);
    setNotes(prev => [data, ...prev]);
    logActivity({ action: 'create', entityType: 'note', entityId: data.id, description: `Added a note`, performedBy: createdBy });
    return data;
  };

  const deleteNote = async (id) => {
    const { performedBy, performedByRole } = currentActor();
    const { error } = await supabase.rpc('soft_delete_row', {
      p_table: 'notes',
      p_id: id,
      p_deleted_by: performedBy,
      p_deleted_by_role: performedByRole
    });
    if (error) throw new Error(error.message);
    setNotes(prev => prev.filter(n => n.id !== id));
  };

  return { notes, isLoading, addNote, deleteNote };
}
