import React, { useState } from 'react';
import { ChevronUp, ChevronDown, Inbox, ChevronLeft, ChevronRight } from 'lucide-react';
import { Skeleton } from './Skeleton';

export function Table({
  headers = [], // Array of { key, label, sortable }
  data = [],
  isLoading = false,
  emptyMessage = "No records found.",
  sortKey = "",
  sortDirection = "asc", // 'asc' | 'desc'
  onSort, // callback (key) => void
  renderRow, // function (item, index) => ReactNode
  enablePagination = true,
  defaultPageSize = 10,
  compact = false,
  footerRow // optional <tr> of totals, rendered in a <tfoot> beneath the data rows
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  // Pagination calculations
  const totalRecords = data.length;
  const totalPages = Math.ceil(totalRecords / pageSize) || 1;
  const safePage = Math.min(Math.max(currentPage, 1), totalPages);

  const startIndex = (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalRecords);
  const paginatedData = enablePagination ? data.slice(startIndex, endIndex) : data;

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  const handlePageSizeChange = (e) => {
    const newSize = parseInt(e.target.value, 10);
    setPageSize(newSize);
    setCurrentPage(1);
  };

  return (
    <div className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm flex flex-col overflow-hidden backdrop-blur-md">
      <div className="w-full overflow-x-auto touch-scroll">
        <table className="w-full border-collapse text-left text-xs sm:text-sm text-slate-500 dark:text-slate-400 min-w-full">
          <thead className="bg-slate-50 dark:bg-slate-900/90 text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10">
            <tr>
              {headers.map((header) => {
                const isSorted = sortKey === header.key;
                return (
                  <th
                    key={header.key}
                    scope="col"
                    className={`${compact ? 'px-2.5 sm:px-4 py-2.5 sm:py-3' : 'px-3.5 sm:px-6 py-3 sm:py-3.5'} font-semibold whitespace-nowrap ${
                      header.sortable ? 'cursor-pointer select-none hover:text-slate-900 dark:hover:text-slate-100 transition-colors' : ''
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
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800/80 font-sans">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10">
                  {headers.map((h, hidx) => (
                    <td key={hidx} className={compact ? 'px-2.5 sm:px-4 py-2.5 sm:py-3' : 'px-3.5 sm:px-6 py-3 sm:py-3.5'}>
                      <Skeleton className="h-4 w-3/4 rounded" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={headers.length} className="px-4 sm:px-6 py-10 sm:py-12 text-center">
                  <div className="flex flex-col items-center justify-center space-y-3">
                    <div className="p-3 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 rounded-2xl">
                      <Inbox size={36} className="stroke-[1.5]" />
                    </div>
                    <h4 className="text-sm sm:text-base font-semibold text-slate-800 dark:text-slate-200">
                      Empty Stockroom
                    </h4>
                    <p className="text-xs text-slate-400 dark:text-slate-500 max-w-xs mx-auto">
                      {emptyMessage}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              paginatedData.map((item, index) => renderRow(item, startIndex + index))
            )}
          </tbody>
          {footerRow && !isLoading && data.length > 0 && (
            <tfoot className="bg-slate-50 dark:bg-slate-900/90 border-t-2 border-slate-200 dark:border-slate-800 font-sans">
              {footerRow}
            </tfoot>
          )}
        </table>
      </div>

      {/* Pagination Footer */}
      {enablePagination && !isLoading && data.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between px-4 sm:px-6 py-2.5 sm:py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 text-xs text-slate-500 dark:text-slate-400 gap-2.5 sm:gap-3 select-none">
          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
            <span className="text-[11px] sm:text-xs">Rows:</span>
            <select
              value={pageSize}
              onChange={handlePageSizeChange}
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 focus:outline-none text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span className="ml-1 text-[11px] sm:text-xs font-medium">
              <span className="font-semibold text-slate-700 dark:text-slate-300">{startIndex + 1}</span>-
              <span className="font-semibold text-slate-700 dark:text-slate-300">{endIndex}</span> of{' '}
              <span className="font-semibold text-slate-700 dark:text-slate-300">{totalRecords}</span>
            </span>
          </div>

          <div className="flex items-center space-x-1.5">
            <button
              onClick={() => handlePageChange(safePage - 1)}
              disabled={safePage <= 1}
              className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition min-w-[32px] min-h-[32px] flex items-center justify-center"
              title="Previous Page"
              aria-label="Previous Page"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="px-2 font-semibold text-slate-700 dark:text-slate-300 text-[11px] sm:text-xs">
              Page {safePage} / {totalPages}
            </span>
            <button
              onClick={() => handlePageChange(safePage + 1)}
              disabled={safePage >= totalPages}
              className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition min-w-[32px] min-h-[32px] flex items-center justify-center"
              title="Next Page"
              aria-label="Next Page"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


