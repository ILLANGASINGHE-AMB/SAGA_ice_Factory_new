import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Input, TextArea } from './FormFields';
import { useAuth } from '../context/AuthContext';

export function NoteFormModal({ isOpen, onClose, addNote, onSaved }) {
  const { user } = useAuth();
  const [noteText, setNoteText] = useState('');
  const [now, setNow] = useState(new Date());
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setNoteText('');
      setNow(new Date());
      setError('');
    }
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!noteText.trim()) {
      setError('Note text is required');
      return;
    }

    setIsSubmitting(true);
    try {
      await addNote(noteText, user?.fullName);
      onSaved({ mode: 'add' });
      onClose();
    } catch (err) {
      onSaved({ mode: 'error', error: err.message || 'Failed to add note' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Note" size="md">
      <form onSubmit={handleSubmit} className="space-y-3">
        <Input
          label="Date and Time"
          name="created_at"
          value={now.toLocaleString()}
          disabled
          readOnly
          className="opacity-70"
        />

        <TextArea
          label="Note"
          name="note_text"
          required
          rows={4}
          placeholder="Write a note or message for staff..."
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
        />

        <Input
          label="User Account"
          name="created_by"
          value={user?.fullName || 'Staff Operator'}
          disabled
          readOnly
          className="opacity-70"
        />

        {error && (
          <p className="text-xs text-red-500 font-medium">{error}</p>
        )}

        <div className="flex justify-end space-x-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={isSubmitting}>
            Save Note
          </Button>
        </div>
      </form>
    </Modal>
  );
}
