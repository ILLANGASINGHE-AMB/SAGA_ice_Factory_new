import React, { useState } from 'react';
import { useNotes } from '../hooks/useNotes';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { Table } from '../components/Table';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { NoteFormModal } from '../components/NoteFormModal';
import { Plus, Trash2 } from 'lucide-react';

export function NotesPage() {
  const { notes, isLoading, addNote, deleteNote } = useNotes();
  const { isAdmin } = useAuth();
  const toast = useToast();

  const [formModalOpen, setFormModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleSaved = ({ mode, error }) => {
    if (mode === 'error') {
      toast.error(error);
    } else {
      toast.success('Note added successfully');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteNote(deleteTarget.id);
      toast.success('Note deleted');
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err.message || 'Failed to delete note');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">

      {/* Action Bar */}
      <div className="flex justify-end">
        <Button
          variant="primary"
          onClick={() => setFormModalOpen(true)}
          className="flex items-center justify-center space-x-1.5 px-4 py-2 rounded-xl"
        >
          <Plus size={16} />
          <span>Add Note</span>
        </Button>
      </div>

      <Table
        headers={[
          { key: 'created_at', label: 'Date and Time' },
          { key: 'note_text', label: 'Note' },
          { key: 'created_by', label: 'User Account' },
          ...(isAdmin ? [{ key: 'actions', label: 'Actions', sortable: false }] : [])
        ]}
        data={notes}
        isLoading={isLoading}
        emptyMessage="No notes or messages have been added yet."
        renderRow={(note) => (
          <tr key={note.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 border-b border-slate-100 dark:border-slate-800 align-top">
            <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 whitespace-nowrap text-slate-500 dark:text-slate-400">
              {new Date(note.created_at).toLocaleString()}
            </td>
            <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 font-medium text-slate-900 dark:text-slate-100 whitespace-pre-wrap break-words max-w-md">
              {note.note_text}
            </td>
            <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 font-semibold text-navy-600 dark:text-navy-400 whitespace-nowrap">
              {note.created_by}
            </td>
            {isAdmin && (
              <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5">
                <button
                  onClick={() => setDeleteTarget(note)}
                  className="p-1.5 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition cursor-pointer"
                  title="Delete Note"
                >
                  <Trash2 size={14} />
                </button>
              </td>
            )}
          </tr>
        )}
      />

      {/* Add Note Modal */}
      <NoteFormModal
        isOpen={formModalOpen}
        onClose={() => setFormModalOpen(false)}
        addNote={addNote}
        onSaved={handleSaved}
      />

      {/* Delete Note Confirm Dialog */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Delete Note?"
        message="This will permanently remove this note. This action cannot be undone."
        isLoading={isDeleting}
      />

    </div>
  );
}
