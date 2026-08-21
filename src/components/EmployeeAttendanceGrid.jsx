import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Save, Pencil, Trash2, Inbox } from 'lucide-react';
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

function formatTimeDisplay(value) {
  if (!value) return '—';
  const [h, m] = value.split(':');
  const hour = Number(h);
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = ((hour + 11) % 12) + 1;
  return `${displayHour}:${m} ${period}`;
}

let tempIdCounter = 0;
function nextTempId() {
  tempIdCounter += 1;
  return `temp-${Date.now()}-${tempIdCounter}`;
}

const cellBase = 'px-3 sm:px-4 py-2.5 whitespace-nowrap';
const stickyCellBase = `${cellBase} sticky bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/40 transition-colors z-[1]`;
const inputBase = 'w-full px-2 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-navy-500 focus:border-navy-500';

export function EmployeeAttendanceGrid({ employees, rows, isLoading, addAttendance, updateAttendance, deleteAttendance }) {
  const toast = useToast();
  const [localRows, setLocalRows] = useState([]);
  const [editingIds, setEditingIds] = useState(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const employeeById = useMemo(() => new Map(employees.map(e => [Number(e.id), e])), [employees]);

  // Only re-sync from the server-backed `rows` prop while nothing is being
  // edited locally, so an in-flight edit is never silently clobbered by a
  // realtime refresh from elsewhere.
  useEffect(() => {
    if (editingIds.size > 0) return;
    setLocalRows(rows.map(r => ({ ...r, _isNew: false })));
  }, [rows, editingIds.size]);

  const handleAddRow = () => {
    if (employees.length === 0) {
      toast.error("Add an employee first before logging attendance");
      return;
    }
    const id = nextTempId();
    const draft = {
      id,
      employee_id: '',
      attendance_date: todayInput(),
      start_time: '',
      end_time: '',
      description: '',
      _isNew: true
    };
    setLocalRows(prev => [draft, ...prev]);
    setEditingIds(prev => new Set(prev).add(id));
  };

  const handleEditRow = (id) => {
    setEditingIds(prev => new Set(prev).add(id));
  };

  const handleFieldChange = (id, field, value) => {
    setLocalRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } : r)));
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
      await deleteAttendance(deleteTarget.id);
      setLocalRows(prev => prev.filter(r => r.id !== deleteTarget.id));
      toast.success("Attendance record deleted");
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err.message || "Failed to delete record");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSaveChanges = async () => {
    if (editingIds.size === 0) return;
    setIsSaving(true);
    try {
      const editedRows = localRows.filter(r => editingIds.has(r.id));

      for (const row of editedRows) {
        if (!row.employee_id) {
          throw new Error("Select an employee for every row before saving");
        }
        if (!row.attendance_date) {
          throw new Error("Date is required for every row");
        }
      }

      for (const row of editedRows) {
        const payload = {
          employee_id: row.employee_id,
          attendance_date: row.attendance_date,
          start_time: row.start_time,
          end_time: row.end_time,
          description: row.description
        };
        if (row._isNew) {
          await addAttendance(payload);
        } else {
          await updateAttendance(row.id, payload);
        }
      }

      setEditingIds(new Set());
      toast.success("Changes saved successfully");
    } catch (err) {
      toast.error(err.message || "Failed to save changes");
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges = editingIds.size > 0;

  return (
    <div className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm overflow-hidden">
      <div className="w-full max-h-[32rem] overflow-auto touch-scroll">
        <table className="w-full border-collapse text-left text-xs text-slate-600 dark:text-slate-300">
          <thead className="text-[11px] font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            <tr>
              <th className={`${cellBase} sticky top-0 left-0 z-[3] bg-slate-50 dark:bg-slate-900 border-b border-r border-slate-200 dark:border-slate-800 w-28`}>
                Employee ID
              </th>
              <th className={`${cellBase} sticky top-0 left-28 z-[3] bg-slate-50 dark:bg-slate-900 border-b border-r border-slate-200 dark:border-slate-800 w-44`}>
                Name
              </th>
              <th className={`${cellBase} sticky top-0 z-[2] bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800`}>
                Date
              </th>
              <th className={`${cellBase} sticky top-0 z-[2] bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800`}>
                Start Time
              </th>
              <th className={`${cellBase} sticky top-0 z-[2] bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800`}>
                End Time
              </th>
              <th className={`${cellBase} sticky top-0 z-[2] bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800`}>
                Description (optional)
              </th>
              <th className={`${cellBase} sticky top-0 z-[2] bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-right`}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400">Loading attendance records...</td>
              </tr>
            ) : localRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center">
                  <div className="flex flex-col items-center justify-center space-y-3">
                    <div className="p-3 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 rounded-2xl">
                      <Inbox size={32} className="stroke-[1.5]" />
                    </div>
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      No attendance records yet. Use the + icon below to add one.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              localRows.map((row) => {
                const isEditing = editingIds.has(row.id);
                const employee = employeeById.get(Number(row.employee_id));

                return (
                  <tr key={row.id} className="group">
                    <td className={`${stickyCellBase} left-0 border-r border-slate-100 dark:border-slate-800 font-mono font-medium text-navy-600 dark:text-navy-400`}>
                      {employee?.employee_code || '—'}
                    </td>
                    <td className={`${stickyCellBase} left-28 border-r border-slate-100 dark:border-slate-800`}>
                      {isEditing ? (
                        <select
                          className={inputBase}
                          value={row.employee_id}
                          onChange={(e) => handleFieldChange(row.id, 'employee_id', e.target.value)}
                        >
                          <option value="">Select employee...</option>
                          {employees.map(e => (
                            <option key={e.id} value={e.id}>{e.employee_code} — {e.name}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="font-semibold text-slate-900 dark:text-slate-100">{employee?.name || '—'}</span>
                      )}
                    </td>
                    <td className={cellBase}>
                      {isEditing ? (
                        <input
                          type="date"
                          className={inputBase}
                          value={row.attendance_date}
                          onChange={(e) => handleFieldChange(row.id, 'attendance_date', e.target.value)}
                        />
                      ) : formatDateDisplay(row.attendance_date)}
                    </td>
                    <td className={cellBase}>
                      {isEditing ? (
                        <input
                          type="time"
                          className={inputBase}
                          value={row.start_time || ''}
                          onChange={(e) => handleFieldChange(row.id, 'start_time', e.target.value)}
                        />
                      ) : formatTimeDisplay(row.start_time)}
                    </td>
                    <td className={cellBase}>
                      {isEditing ? (
                        <input
                          type="time"
                          className={inputBase}
                          value={row.end_time || ''}
                          onChange={(e) => handleFieldChange(row.id, 'end_time', e.target.value)}
                        />
                      ) : formatTimeDisplay(row.end_time)}
                    </td>
                    <td className={`${cellBase} whitespace-normal max-w-xs`}>
                      {isEditing ? (
                        <input
                          type="text"
                          className={inputBase}
                          placeholder="Optional"
                          value={row.description || ''}
                          onChange={(e) => handleFieldChange(row.id, 'description', e.target.value)}
                        />
                      ) : (row.description || '—')}
                    </td>
                    <td className={`${cellBase} text-right`}>
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {!isEditing && (
                          <button
                            onClick={() => handleEditRow(row.id)}
                            className="p-1.5 rounded-lg text-navy-600 dark:text-navy-400 hover:bg-navy-50 dark:hover:bg-navy-950/30 transition cursor-pointer"
                            title="Edit row"
                          >
                            <Pencil size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteRow(row)}
                          className="p-1.5 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition cursor-pointer"
                          title="Delete row"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={7} className="sticky bottom-0 z-[3] bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-3 sm:px-4 py-2.5">
                <div className="flex items-center justify-between">
                  <button
                    onClick={handleAddRow}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-navy-600 dark:text-navy-400 hover:bg-navy-50 dark:hover:bg-navy-950/30 transition cursor-pointer"
                    title="Add new row"
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
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Delete Attendance Record?"
        message="This attendance entry will be permanently removed. This action cannot be undone."
        isLoading={isDeleting}
      />
    </div>
  );
}
