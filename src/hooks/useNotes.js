import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

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
    fetchNotes();

    const channel = supabase
      .channel('notes-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notes' }, fetchNotes)
      .subscribe();

    return () => supabase.removeChannel(channel);
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
    return data;
  };

  const deleteNote = async (id) => {
    const { error } = await supabase.from('notes').delete().eq('id', id);
    if (error) throw new Error(error.message);
    setNotes(prev => prev.filter(n => n.id !== id));
  };

  return { notes, isLoading, addNote, deleteNote };
}
