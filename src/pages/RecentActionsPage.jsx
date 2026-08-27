import { useMemo, useState } from 'react';
import { useActivityLog } from '../hooks/useActivityLog';
import { useTrash } from '../hooks/useTrash';
import { useSettings } from '../hooks/useSettings';
import { useToast } from '../components/Toast';
import { Table } from '../components/Table';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Undo2 } from 'lucide-react';
import { toLocalDateTimeStr } from '../utils/date';

const ACTION_STYLES = {
  create: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
  update: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
  delete: 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400',
  restore: 'bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-400'
};

// activity_log and trash are written by the same soft_delete_row call with the
// same table name and id, so this key joins them exactly.
const entityKey = (table, id) => `${table}::${id}`;

export function RecentActionsPage() {
  const { entries, isLoading } = useActivityLog();
  const { items: trashItems, restoreItem } = useTrash();
  const { settings } = useSettings();
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [undoTarget, setUndoTarget] = useState(null);
  const [undoLoading, setUndoLoading] = useState(false);

  // Settings → Feature Visibility → "Undo Button in Recent Actions".
  const undoEnabled = settings?.undo_enabled === true;

  // Live Trash snapshots, keyed for O(1) lookup per row.
  const trashByEntity = useMemo(() => {
    const map = new Map();
    (trashItems || []).forEach(t => map.set(entityKey(t.entity_table, t.entity_id), t));
    return map;
  }, [trashItems]);

  // Which entities have been restored since a given point, so an old delete
  // whose row is already back can say so rather than just "unavailable".
  const restoredAt = useMemo(() => {
    const map = new Map();
    (entries || []).forEach(e => {
      if (e.action !== 'restore' || !e.entity_id) return;
      const key = entityKey(e.entity_type, e.entity_id);
      const at = new Date(e.created_at).getTime();
      if (!map.has(key) || at > map.get(key)) map.set(key, at);
    });
    return map;
  }, [entries]);

  // What Undo can do for one log row.
  //
  // Only deletions are reversible: activity_log stores a description, not a
  // before-state, so a create or an edit has nothing to roll back to. A
  // deletion does — soft_delete_row parks a full snapshot in Trash, and
  // restore_trash_item puts it back along with its children. Anything else
  // gets a disabled button explaining why, which is far less confusing than
  // an Undo that silently does nothing.
  const undoStateFor = (entry) => {
    if (entry.action !== 'delete' || !entry.entity_id) {
      return { canUndo: false, reason: 'Only deletions can be undone' };
    }

    const key = entityKey(entry.entity_type, entry.entity_id);
    const trashRow = trashByEntity.get(key);
    if (trashRow) return { canUndo: true, trashRow };

    const restored = restoredAt.get(key);
    if (restored && restored > new Date(entry.created_at).getTime()) {
      return { canUndo: false, reason: 'Already restored' };
    }
    // Trash purges after 7 days, and "Clear All Data" empties it outright.
    return { canUndo: false, reason: 'Snapshot no longer in Trash' };
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(e =>
      (e.description || '').toLowerCase().includes(q) ||
      (e.performed_by || '').toLowerCase().includes(q) ||
      (e.entity_label || '').toLowerCase().includes(q) ||
      (e.entity_type || '').toLowerCase().includes(q)
    );
  }, [entries, search]);

  const handleUndo = async () => {
    if (!undoTarget) return;
    setUndoLoading(true);
    try {
      await restoreItem(undoTarget.trashRow.id);
      toast.success(`Restored ${undoTarget.entry.entity_label || undoTarget.entry.entity_type}`);
      setUndoTarget(null);
    } catch (err) {
      toast.error(err.message || 'Failed to undo this action');
    } finally {
      setUndoLoading(false);
    }
  };

  const headers = [
    { key: 'created_at', label: 'Date and Time' },
    { key: 'description', label: 'Action Performed' },
    { key: 'performed_by', label: 'By Whom' },
    ...(undoEnabled ? [{ key: 'undo', label: 'Undo' }] : [])
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search actions, users, IDs..."
          className="w-full sm:w-72 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-navy-400"
        />
      </div>

      <Table
        headers={headers}
        data={filtered}
        isLoading={isLoading}
        emptyMessage="No actions have been recorded yet."
        renderRow={(entry) => {
          const undoState = undoEnabled ? undoStateFor(entry) : null;
          return (
            <tr key={entry.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 border-b border-slate-100 dark:border-slate-800 align-top">
              <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 whitespace-nowrap font-mono text-slate-500 dark:text-slate-400">
                {toLocalDateTimeStr(entry.created_at) || '—'}
              </td>
              <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 max-w-lg">
                <div className="flex items-center flex-wrap gap-2">
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0 ${ACTION_STYLES[entry.action] || 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                    {entry.action}
                  </span>
                  <span className="font-medium text-slate-900 dark:text-slate-100 break-words">
                    {entry.description}
                  </span>
                  {entry.entity_label && (
                    <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                      {entry.entity_label}
                    </span>
                  )}
                </div>
              </td>
              <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 whitespace-nowrap">
                <div className="font-semibold text-navy-600 dark:text-navy-400">{entry.performed_by}</div>
                {entry.performed_by_role && (
                  <div className="text-[10px] uppercase text-slate-400 font-medium">{entry.performed_by_role}</div>
                )}
              </td>
              {undoEnabled && (
                <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 whitespace-nowrap">
                  {undoState.canUndo ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setUndoTarget({ entry, trashRow: undoState.trashRow })}
                      className="flex items-center space-x-1"
                    >
                      <Undo2 size={13} />
                      <span>Undo</span>
                    </Button>
                  ) : (
                    <span className="text-[11px] text-slate-400 dark:text-slate-500" title={undoState.reason}>
                      {undoState.reason}
                    </span>
                  )}
                </td>
              )}
            </tr>
          );
        }}
      />

      <ConfirmDialog
        isOpen={!!undoTarget}
        onClose={() => setUndoTarget(null)}
        onConfirm={handleUndo}
        title="Undo this deletion?"
        message={
          undoTarget
            ? `This restores ${undoTarget.entry.entity_label || undoTarget.entry.entity_id} to ${undoTarget.entry.entity_type}, along with any records that were removed with it. It will reappear everywhere it was before.`
            : ''
        }
        confirmLabel="Undo Deletion"
        variant="primary"
        isLoading={undoLoading}
      />
    </div>
  );
}
