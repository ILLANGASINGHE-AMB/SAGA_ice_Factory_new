import React from 'react';
import { ChevronUp, ChevronDown, Inbox } from 'lucide-react';
import { Skeleton } from './Skeleton';

export function Table({
  headers = [], // Array of { key, label, sortable }
  data = [],
  isLoading = false,
  emptyMessage = "No records found.",
  sortKey = "",
  sortDirection = "asc", // 'asc' | 'desc'
  onSort, // callback (key) => void
  renderRow // function (item, index) => ReactNode
}) {
  return (
    <div className="w-full overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 shadow-sm">
      <table className="w-full border-collapse text-left text-sm text-slate-500 dark:text-slate-400">
        <thead className="bg-slate-50 dark:bg-slate-900 text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
          <tr>
            {headers.map((header) => {
              const isSorted = sortKey === header.key;
              return (
                <th
                  key={header.key}
                  scope="col"
                  className={`px-6 py-4 font-semibold ${
                    header.sortable ? 'cursor-pointer select-none hover:text-slate-900 dark:hover:text-slate-100' : ''
                  }`}
                  onClick={() => header.sortable && onSort && onSort(header.key)}
                >
                  <div className="flex items-center space-x-1">
                    <span>{header.label}</span>
                    {header.sortable && (
                      <span className="text-slate-400">
                        {isSorted ? (
                          sortDirection === 'asc' ? (
                            <ChevronUp size={14} className="text-navy-500" />
                          ) : (
                            <ChevronDown size={14} className="text-navy-500" />
                          )
                        ) : (
                          <ChevronDown size={14} className="opacity-0 hover:opacity-100 transition-opacity" />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-sans">
          {isLoading ? (
            // Render 5 Skeleton Rows
            Array.from({ length: 5 }).map((_, idx) => (
              <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10">
                {headers.map((h, hidx) => (
                  <td key={hidx} className="px-6 py-4">
                    <Skeleton className="h-4 w-3/4 rounded" />
                  </td>
                ))}
              </tr>
            ))
          ) : data.length === 0 ? (
            // Render Empty State
            <tr>
              <td colSpan={headers.length} className="px-6 py-12 text-center">
                <div className="flex flex-col items-center justify-center space-y-3">
                  <div className="p-3 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 rounded-2xl">
                    <Inbox size={40} className="stroke-[1.5]" />
                  </div>
                  <h4 className="text-base font-semibold text-slate-800 dark:text-slate-200">
                    Empty Stockroom
                  </h4>
                  <p className="text-xs text-slate-400 dark:text-slate-500 max-w-xs mx-auto">
                    {emptyMessage}
                  </p>
                </div>
              </td>
            </tr>
          ) : (
            // Render Data Rows
            data.map((item, index) => renderRow(item, index))
          )}
        </tbody>
      </table>
    </div>
  );
}
