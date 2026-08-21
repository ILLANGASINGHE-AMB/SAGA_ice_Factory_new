import React, { useState, useMemo } from 'react';
import { Receipt } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { Select } from './FormFields';

const GRAPH_COLOR = '#3b82f6';

function isWithinRange(dateStr, from, to) {
  if (!dateStr) return false;
  const d = dateStr.slice(0, 10);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

function formatDateDisplay(value) {
  if (!value) return '—';
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function ExpenseCategoryView({ categories, items, categoryViewRows, isLoading }) {
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [expenseNameFilter, setExpenseNameFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const expenseNameOptions = useMemo(() => {
    const scoped = categoryFilter === 'all'
      ? items
      : items.filter(i => String(i.category_id) === String(categoryFilter));
    return scoped;
  }, [items, categoryFilter]);

  const filteredRows = useMemo(() => {
    return categoryViewRows.filter(row => {
      if (categoryFilter !== 'all' && String(row.category_id) !== String(categoryFilter)) return false;
      if (expenseNameFilter !== 'all' && String(row.expense_item_id) !== String(expenseNameFilter)) return false;
      if (!isWithinRange(row.entry_date, dateFrom, dateTo)) return false;
      return true;
    });
  }, [categoryViewRows, categoryFilter, expenseNameFilter, dateFrom, dateTo]);

  const totalAmount = useMemo(
    () => filteredRows.reduce((sum, r) => sum + r.amount, 0),
    [filteredRows]
  );

  const graphData = useMemo(() => {
    const buckets = new Map();
    for (const row of filteredRows) {
      if (!row.entry_date) continue;
      const key = row.entry_date.slice(0, 10);
      if (!buckets.has(key)) {
        buckets.set(key, {
          key,
          label: new Date(`${key}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          amount: 0
        });
      }
      buckets.get(key).amount += row.amount;
    }
    return Array.from(buckets.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [filteredRows]);

  const handleCategoryChange = (value) => {
    setCategoryFilter(value);
    setExpenseNameFilter('all');
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <Select
          className="sm:w-52"
          value={categoryFilter}
          onChange={(e) => handleCategoryChange(e.target.value)}
          options={[
            { value: 'all', label: 'All Categories' },
            ...categories.map(c => ({ value: String(c.id), label: c.name }))
          ]}
        />
        <Select
          className="sm:w-52"
          value={expenseNameFilter}
          onChange={(e) => setExpenseNameFilter(e.target.value)}
          options={[
            { value: 'all', label: 'All Expense Names' },
            ...expenseNameOptions.map(i => ({ value: String(i.id), label: i.name }))
          ]}
        />
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-navy-500"
          />
          <span className="text-xs text-slate-400">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-navy-500"
          />
        </div>
      </div>

      {/* Flat Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="max-h-[28rem] overflow-auto touch-scroll">
          <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300 border-collapse">
            <thead className="bg-slate-50 dark:bg-slate-800/50 uppercase text-[10px] font-bold text-slate-500">
              <tr>
                <th className="sticky top-0 z-[2] bg-slate-50 dark:bg-slate-800/50 py-3 px-4 border-b border-slate-200 dark:border-slate-800">Expense Name ID</th>
                <th className="sticky top-0 z-[2] bg-slate-50 dark:bg-slate-800/50 py-3 px-4 border-b border-slate-200 dark:border-slate-800">Category</th>
                <th className="sticky top-0 z-[2] bg-slate-50 dark:bg-slate-800/50 py-3 px-4 border-b border-slate-200 dark:border-slate-800">Expense Name</th>
                <th className="sticky top-0 z-[2] bg-slate-50 dark:bg-slate-800/50 py-3 px-4 border-b border-slate-200 dark:border-slate-800">Date</th>
                <th className="sticky top-0 z-[2] bg-slate-50 dark:bg-slate-800/50 py-3 px-4 border-b border-slate-200 dark:border-slate-800">Description</th>
                <th className="sticky top-0 z-[2] bg-slate-50 dark:bg-slate-800/50 py-3 px-4 border-b border-slate-200 dark:border-slate-800 text-right">Amount (LKR)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {isLoading ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">Loading expenses...</td></tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <Receipt size={32} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                    <p className="text-xs text-slate-400">No expenses match the selected filters.</p>
                  </td>
                </tr>
              ) : (
                filteredRows.map(row => (
                  <tr key={row.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                    <td className="py-3 px-4 font-mono font-semibold text-navy-600 dark:text-navy-400">{row.expense_code}</td>
                    <td className="py-3 px-4">{row.category_name}</td>
                    <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200">{row.expense_name}</td>
                    <td className="py-3 px-4 whitespace-nowrap">{formatDateDisplay(row.entry_date)}</td>
                    <td className="py-3 px-4">{row.description || '—'}</td>
                    <td className="py-3 px-4 text-right font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                      {row.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {filteredRows.length > 0 && (
              <tfoot>
                <tr className="sticky bottom-0 bg-slate-50 dark:bg-slate-900 font-bold text-slate-900 dark:text-slate-100 border-t border-slate-200 dark:border-slate-800">
                  <td colSpan={5} className="py-3 px-4 text-right">Total</td>
                  <td className="py-3 px-4 text-right tabular-nums">
                    LKR {totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Trend Graph */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
        <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 font-heading">
          Expense Trend (Amount vs Days)
        </h3>
        {graphData.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-16">No data to chart for the current filters.</p>
        ) : (
          <div className="h-64 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={graphData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" className="dark:hidden" />
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" className="hidden dark:block" />
                <XAxis dataKey="label" stroke="#94a3b8" fontSize={9} tickLine={false} />
                <YAxis
                  stroke="#94a3b8"
                  fontSize={9}
                  tickLine={false}
                  label={{ value: 'Amount (LKR)', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#94a3b8' }}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)', fontSize: '11px' }}
                  formatter={(value) => [`LKR ${Number(value).toLocaleString()}`, 'Amount']}
                />
                <Line
                  type="monotone"
                  dataKey="amount"
                  stroke={GRAPH_COLOR}
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: GRAPH_COLOR, strokeWidth: 0 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
