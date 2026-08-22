import React, { useMemo, useState } from 'react';
import { useActivityLog } from '../hooks/useActivityLog';
import { Table } from '../components/Table';

const ACTION_STYLES = {
  create: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
  update: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
  delete: 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400',
  restore: 'bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-400'
};

export function RecentActionsPage() {
  const { entries, isLoading } = useActivityLog();
  const [search, setSearch] = useState('');

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
        headers={[
          { key: 'created_at', label: 'Date and Time' },
          { key: 'description', label: 'Action Performed' },
          { key: 'performed_by', label: 'By Whom' }
        ]}
        data={filtered}
        isLoading={isLoading}
        emptyMessage="No actions have been recorded yet."
        renderRow={(entry) => (
          <tr key={entry.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 border-b border-slate-100 dark:border-slate-800 align-top">
            <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 whitespace-nowrap text-slate-500 dark:text-slate-400">
              {new Date(entry.created_at).toLocaleString()}
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
          </tr>
        )}
      />
    </div>
  );
}
