import { useState, useEffect } from 'react';
import { Plus, Save, Pencil, Trash2, GripVertical, Inbox } from 'lucide-react';
import { ConfirmDialog } from './ConfirmDialog';
import { useToast } from './Toast';

function todayInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateDisplay(value) {
  if (!value) return '—';
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatAmount(value) {
  const n = Number(value) || 0;
  if (n === 0) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2 });
}

function rowTotal(amounts) {
  return Object.values(amounts || {}).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
}

let tempIdCounter = 0;
function nextTempId() {
  tempIdCounter += 1;
  return `temp-${Date.now()}-${tempIdCounter}`;
}

const headCellBase = 'px-3 py-2.5 whitespace-nowrap border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900';
const cellBase = 'px-3 py-2.5 whitespace-nowrap';
const stickyCellBase = `${cellBase} sticky bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/40 transition-colors z-[1]`;
const inputBase = 'w-full px-2 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-navy-500 focus:border-navy-500';
const HEADER_ROW1_HEIGHT = 'top-[42px]';

export function ExpenseCashBookGrid({
  categoriesWithItems,
  gridRows,
  columnTotals,
  grandTotal,
  isLoading,
  saveLedgerRow,
  deleteLedgerRow,
  reorderCategories,
  reorderExpenseItems,
  onDeleteCategory,
  onDeleteExpenseItem,
  canManageColumns = false
}) {
  const toast = useToast();
  const [localRows, setLocalRows] = useState([]);
  const [editingIds, setEditingIds] = useState(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (editingIds.size > 0) return;
    // This effect's job is to subscribe to an external system (Supabase:
    // an initial fetch plus a realtime channel) and push what it reports
    // back into React state — the case the rule explicitly allows for. It
    // is not derived state being patched in after a render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalRows(gridRows.map(r => ({
      id: r.id,
      entry_date: r.entry_date,
      description: r.description,
      amounts: Object.fromEntries(r.amounts.entries()),
      _isNew: false
    })));
  }, [gridRows, editingIds.size]);

  const totalColumns = categoriesWithItems.reduce((sum, c) => sum + c.items.length, 0);

  const handleAddRow = () => {
    const id = nextTempId();
    const draft = { id, entry_date: todayInput(), description: '', amounts: {}, _isNew: true };
    setLocalRows(prev => [draft, ...prev]);
    setEditingIds(prev => new Set(prev).add(id));
  };

  const handleEditRow = (id) => setEditingIds(prev => new Set(prev).add(id));

  const handleFieldChange = (id, field, value) => {
    setLocalRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const handleAmountChange = (id, itemId, value) => {
    setLocalRows(prev => prev.map(r => (r.id === id ? { ...r, amounts: { ...r.amounts, [itemId]: value } } : r)));
  };

  const handleDeleteRow = (row) => {
    if (row._isNew) {
      setLocalRows(prev => prev.filter(r => r.id !== row.id));
      setEditingIds(prev => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
      return;
    }
    setDeleteTarget(row);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteLedgerRow(deleteTarget.id);
      setLocalRows(prev => prev.filter(r => r.id !== deleteTarget.id));
      toast.success("Row deleted");
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err.message || "Failed to delete row");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSaveChanges = async () => {
    if (editingIds.size === 0) return;
    setIsSaving(true);

    const editedRows = localRows.filter(r => editingIds.has(r.id));
    const missingDate = editedRows.find(r => !r.entry_date);
    if (missingDate) {
      toast.error("Date is required for every row");
      setIsSaving(false);
      return;
    }

    // Rows are saved independently and each result is applied immediately.
    // Previously one failure aborted the whole loop and cleared nothing, so
    // the already-saved rows kept their `temp-` ids and the next Save
    // re-inserted them as new — one duplicate ledger row per retry.
    const savedIds = [];
    const idRemap = new Map();
    const failures = [];

    for (const row of editedRows) {
      try {
        const realId = await saveLedgerRow({
          id: row.id,
          entry_date: row.entry_date,
          description: row.description,
          amounts: row.amounts
        });
        savedIds.push(row.id);
        if (realId && realId !== row.id) idRemap.set(row.id, realId);
      } catch (err) {
        // saveLedgerRow attaches the real row id when the ledger row landed
        // but a cell didn't, so the retry updates that row rather than
        // creating a second one.
        if (err.rowId && err.rowId !== row.id) idRemap.set(row.id, err.rowId);
        failures.push(`${row.description || row.entry_date}: ${err.message || 'save failed'}`);
      }
    }

    if (idRemap.size > 0) {
      setLocalRows(prev => prev.map(r => (idRemap.has(r.id) ? { ...r, id: idRemap.get(r.id), _isNew: false } : r)));
    }

    setEditingIds(prev => {
      const next = new Set(prev);
      for (const savedId of savedIds) next.delete(savedId);
      // A row that half-saved keeps editing, but under its real id.
      for (const [tempId, realId] of idRemap.entries()) {
        if (next.delete(tempId) && !savedIds.includes(tempId)) next.add(realId);
      }
      return next;
    });

    setIsSaving(false);

    if (failures.length === 0) {
      toast.success("Changes saved successfully");
    } else {
      toast.error(`${failures.length} row(s) failed to save — ${failures.join('; ')}`);
    }
  };

  // Native HTML5 drag-and-drop — no dnd-kit/react-beautiful-dnd installed in
  // this project, and reordering a handful of header cells doesn't warrant
  // adding one. Item drops across a different category are silently ignored
  // by reorderExpenseItems itself (columns can only move inside their own
  // category block, per spec).
  const handleDragStart = (e, type, id) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ type, id }));
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  const handleDropOnCategory = async (e, targetId) => {
    e.preventDefault();
    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain') || '{}');
      if (data.type !== 'category' || !data.id) return;
      await reorderCategories(data.id, targetId);
    } catch (err) {
      toast.error(err.message || "Failed to reorder categories");
    }
  };
  const handleDropOnItem = async (e, targetId) => {
    e.preventDefault();
    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain') || '{}');
      if (data.type !== 'item' || !data.id) return;
      await reorderExpenseItems(data.id, targetId);
    } catch (err) {
      toast.error(err.message || "Failed to reorder expenses");
    }
  };

  const hasChanges = editingIds.size > 0;

  if (!isLoading && categoriesWithItems.length === 0) {
    return (
      <div className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm p-12 text-center">
        <Inbox size={32} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">No Expense Categories Yet</h3>
        <p className="text-xs text-slate-400 mt-1">Use "Add Category" above to start building the Cash Book.</p>
      </div>
    );
  }

  return (
    <div className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={handleAddRow}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-navy-600 dark:text-navy-400 hover:bg-navy-50 dark:hover:bg-navy-950/30 transition cursor-pointer"
        >
          <Plus size={14} />
          <span>Add Row</span>
        </button>
        <button
          onClick={handleSaveChanges}
          disabled={!hasChanges || isSaving}
          className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-navy-600 hover:bg-navy-700 text-white shadow-xs transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          <Save size={14} />
          <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
        </button>
      </div>

      <div className="w-full max-h-[36rem] overflow-auto touch-scroll">
        <table className="w-full border-collapse text-left text-xs text-slate-600 dark:text-slate-300">
          <thead className="text-[11px] font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            <tr>
              <th rowSpan={2} className={`${headCellBase} sticky top-0 left-0 z-[3] border-r w-28`}>Date</th>
              <th rowSpan={2} className={`${headCellBase} sticky top-0 left-28 z-[3] border-r w-44`}>Description</th>
              {categoriesWithItems.map(cat => (
                <th
                  key={cat.id}
                  colSpan={Math.max(cat.items.length, 1)}
                  draggable
                  onDragStart={(e) => handleDragStart(e, 'category', cat.id)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDropOnCategory(e, cat.id)}
                  className={`${headCellBase} sticky top-0 z-[2] text-center cursor-grab active:cursor-grabbing border-r border-l border-slate-200 dark:border-slate-800`}
                  title="Drag to reorder category"
                >
                  <span className="inline-flex items-center gap-1 justify-center">
                    <GripVertical size={11} className="opacity-50" />
                    {cat.name}
                    {canManageColumns && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onDeleteCategory?.(cat); }}
                        onDragStart={(e) => e.preventDefault()}
                        className="ml-0.5 p-0.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition cursor-pointer"
                        title={`Delete category "${cat.name}" and all of its expenses`}
                        aria-label={`Delete category ${cat.name}`}
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </span>
                </th>
              ))}
              <th rowSpan={2} className={`${headCellBase} sticky top-0 right-0 z-[3] border-l text-right`}>Total</th>
            </tr>
            <tr>
              {categoriesWithItems.map(cat => (
                cat.items.length === 0 ? (
                  <th key={`${cat.id}-empty`} className={`${headCellBase} ${HEADER_ROW1_HEIGHT} sticky z-[2] text-slate-400 font-normal normal-case`}>
                    No expenses yet
                  </th>
                ) : cat.items.map(item => (
                  <th
                    key={item.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, 'item', item.id)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDropOnItem(e, item.id)}
                    className={`${headCellBase} ${HEADER_ROW1_HEIGHT} sticky z-[2] cursor-grab active:cursor-grabbing`}
                    title="Drag to reorder within this category"
                  >
                    <span className="inline-flex items-center gap-1">
                      <GripVertical size={10} className="opacity-40" />
                      {item.name}
                      {canManageColumns && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onDeleteExpenseItem?.(item); }}
                          onDragStart={(e) => e.preventDefault()}
                          className="ml-0.5 p-0.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition cursor-pointer"
                          title={`Delete expense "${item.name}"`}
                          aria-label={`Delete expense ${item.name}`}
                        >
                          <Trash2 size={10} />
                        </button>
                      )}
                    </span>
                  </th>
                ))
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {isLoading ? (
              <tr>
                <td colSpan={3 + totalColumns} className="px-4 py-10 text-center text-slate-400">Loading Cash Book...</td>
              </tr>
            ) : localRows.length === 0 ? (
              <tr>
                <td colSpan={3 + totalColumns} className="px-4 py-12 text-center">
                  <div className="flex flex-col items-center justify-center space-y-3">
                    <div className="p-3 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 rounded-2xl">
                      <Inbox size={32} className="stroke-[1.5]" />
                    </div>
                    <p className="text-xs text-slate-400 dark:text-slate-500">No rows yet. Use "Add Row" to log an expense.</p>
                  </div>
                </td>
              </tr>
            ) : (
              localRows.map(row => {
                const isEditing = editingIds.has(row.id);
                const total = rowTotal(row.amounts);
                return (
                  <tr key={row.id} className="group">
                    <td className={`${stickyCellBase} left-0 border-r border-slate-100 dark:border-slate-800`}>
                      {isEditing ? (
                        <input
                          type="date"
                          className={inputBase}
                          value={row.entry_date}
                          onChange={(e) => handleFieldChange(row.id, 'entry_date', e.target.value)}
                        />
                      ) : formatDateDisplay(row.entry_date)}
                    </td>
                    <td className={`${stickyCellBase} left-28 border-r border-slate-100 dark:border-slate-800 whitespace-normal`}>
                      {isEditing ? (
                        <input
                          type="text"
                          className={inputBase}
                          placeholder="Description"
                          value={row.description || ''}
                          onChange={(e) => handleFieldChange(row.id, 'description', e.target.value)}
                        />
                      ) : (
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                            {row.description || '—'}
                          </span>
                        {/* A touch screen never hovers, so these row actions
                            were both invisible and unreachable on the tablet;
                            `touch-always-visible` pins them open there. */}
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 touch-always-visible transition-opacity shrink-0">
                            <button
                              type="button"
                              onClick={() => handleEditRow(row.id)}
                              className="touch-target p-1.5 rounded-lg text-navy-600 dark:text-navy-400 hover:bg-navy-50 dark:hover:bg-navy-950/30 active:scale-95 transition cursor-pointer flex items-center justify-center"
                              aria-label="Edit row"
                              title="Edit row"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteRow(row)}
                              className="touch-target p-1.5 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 active:scale-95 transition cursor-pointer flex items-center justify-center"
                              aria-label="Delete row"
                              title="Delete row"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      )}
                    </td>
                    {categoriesWithItems.map(cat => (
                      cat.items.length === 0
                        ? <td key={`${row.id}-${cat.id}-empty`} className={cellBase}>—</td>
                        : cat.items.map(item => (
                          <td key={`${row.id}-${item.id}`} className={cellBase}>
                            {isEditing ? (
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                className={`${inputBase} text-right`}
                                placeholder="0.00"
                                value={row.amounts[item.id] ?? ''}
                                onChange={(e) => handleAmountChange(row.id, item.id, e.target.value)}
                              />
                            ) : (
                              <span className="tabular-nums">{formatAmount(row.amounts[item.id])}</span>
                            )}
                          </td>
                        ))
                    ))}
                    <td className={`${stickyCellBase} right-0 border-l border-slate-100 dark:border-slate-800 text-right font-bold text-slate-900 dark:text-slate-100`}>
                      {formatAmount(total)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          <tfoot>
            <tr className="font-bold text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-900">
              <td colSpan={2} className="sticky bottom-0 left-0 z-[3] bg-slate-50 dark:bg-slate-900 px-3 py-2.5 border-t border-slate-200 dark:border-slate-800">
                Total
              </td>
              {categoriesWithItems.map(cat => (
                cat.items.length === 0
                  ? <td key={`${cat.id}-total-empty`} className="sticky bottom-0 z-[2] bg-slate-50 dark:bg-slate-900 px-3 py-2.5 border-t border-slate-200 dark:border-slate-800">—</td>
                  : cat.items.map(item => (
                    <td key={`${item.id}-total`} className="sticky bottom-0 z-[2] bg-slate-50 dark:bg-slate-900 px-3 py-2.5 border-t border-slate-200 dark:border-slate-800 text-right tabular-nums">
                      {formatAmount(columnTotals.get(item.id))}
                    </td>
                  ))
              ))}
              <td className="sticky bottom-0 right-0 z-[3] bg-slate-50 dark:bg-slate-900 px-3 py-2.5 border-t border-l border-slate-200 dark:border-slate-800 text-right">
                {formatAmount(grandTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Delete Cash Book Row?"
        message="This row and all its logged amounts will be permanently removed. This action cannot be undone."
        isLoading={isDeleting}
      />
    </div>
  );
}
