import React, { useState, useMemo } from 'react';
import { useInventory } from '../hooks/useInventory';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { Input, Select } from '../components/FormFields';
import { Plus, Minus, Edit, AlertTriangle, Table2, LineChart as LineChartIcon } from 'lucide-react';
import { toLocalDateStr, toLocalMonthStr, todayStr, thisMonthStr, thisYearStr } from '../utils/date';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

// Colors kept consistent with Badge.jsx (MFC/RSC/BNC) and the Dashboard chart palette
const GRAPH_COLORS = {
  manufactured: '#22c55e', // Production - green
  resell: '#0ea5e9',       // Resell - light blue
  waste: '#f97316',        // Brine - light orange
  damaged: '#f43f5e'       // Damaged - rose
};

const CUBE_TYPE_LABELS = { manufactured: 'Production', resell: 'Resell', waste: 'Brine', damaged: 'Damaged' };

// Card heading per inventory type. Brine and Damaged are stock counts with no
// price and are never sold — they are excluded from Total Cubes below.
const CUBE_CARD_TITLES = { manufactured: 'Production', resell: 'Purchases', waste: 'Brine', damaged: 'Damaged' };

// The two pools that can actually be sold. Everything that adds up to a
// sellable "Total Cubes" figure comes from these.
const SELLABLE_TYPES = ['manufactured', 'resell'];

// Year filter options, derived from the current year rather than hardcoded so
// the list never goes stale.
const YEAR_OPTIONS = (() => {
  const current = new Date().getFullYear();
  return [current + 1, current, current - 1, current - 2].map(String);
})();

export function InventoryPage() {
  const { inventory, transactions, isLoading, addStock, removeStock, updatePrice } = useInventory();
  const { user, isAdmin } = useAuth();
  const toast = useToast();

  // Modal control states
  const [activeModal, setActiveModal] = useState(null); // 'add' | 'remove' | 'editPrice' | null
  const [selectedItem, setSelectedItem] = useState(null);
  
  // Input states
  const [quantityInput, setQuantityInput] = useState('');
  const [priceInput, setPriceInput] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Production History section states
  const [historyViewMode, setHistoryViewMode] = useState('table'); // 'table' | 'graph'
  const [historyFilterType, setHistoryFilterType] = useState('daily'); // 'daily' | 'monthly' | 'yearly'
  const [historyDate, setHistoryDate] = useState(todayStr);
  const [historyMonth, setHistoryMonth] = useState(thisMonthStr);
  const [historyYear, setHistoryYear] = useState(thisYearStr);
  const [historyCubeType, setHistoryCubeType] = useState('all'); // 'all' | 'manufactured' | 'resell' | 'waste' | 'damaged'

  // Total Cubes = Production + Resell. Brine and Damaged are counted and shown
  // on their own cards but never added in — they aren't sellable stock.
  const totalSellableCubes = useMemo(
    () => (inventory || [])
      .filter(i => SELLABLE_TYPES.includes(i.type))
      .reduce((sum, i) => sum + (Number(i.quantity) || 0), 0),
    [inventory]
  );

  const openModal = (type, item) => {
    setSelectedItem(item);
    setActiveModal(type);
    setQuantityInput('');
    setPriceInput(item?.price_per_cube !== null && item?.price_per_cube !== undefined ? item.price_per_cube.toString() : '');
  };

  const closeModal = () => {
    setActiveModal(null);
    setSelectedItem(null);
    setQuantityInput('');
    setPriceInput('');
  };

  const handleAddStock = async (e) => {
    e.preventDefault();
    const qty = parseInt(quantityInput, 10);
    if (isNaN(qty) || qty <= 0) {
      toast.error("Please enter a valid positive quantity");
      return;
    }

    setActionLoading(true);
    try {
      await addStock(selectedItem.id, qty, user?.fullName || 'Operator');
      toast.success(`Successfully added ${qty} cubes to ${selectedItem.code}`);
      closeModal();
    } catch (err) {
      toast.error(err.message || "Failed to add stock");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveStock = async (e) => {
    e.preventDefault();
    const qty = parseInt(quantityInput, 10);
    if (isNaN(qty) || qty <= 0) {
      toast.error("Please enter a valid positive quantity");
      return;
    }
    // Re-derive from the live inventory list rather than the snapshot taken
    // when the modal opened — another operator may have changed stock while
    // this modal was open. The server-side RPC re-validates under lock
    // regardless, but checking against current data here avoids a confusing
    // "it let me try, then the server said no" round trip.
    const liveItem = inventory.find(i => i.id === selectedItem.id) || selectedItem;
    if (qty > liveItem.quantity) {
      toast.error(`Cannot remove more than available stock (${liveItem.quantity})`);
      return;
    }

    setActionLoading(true);
    try {
      await removeStock(selectedItem.id, qty, user?.fullName || 'Operator');
      toast.success(`Successfully removed ${qty} cubes from ${selectedItem.code}`);
      closeModal();
    } catch (err) {
      toast.error(err.message || "Failed to remove stock");
    } finally {
      setActionLoading(false);
    }
  };

  const handleEditPrice = async (e) => {
    e.preventDefault();
    const price = parseFloat(priceInput);
    if (isNaN(price) || price <= 0) {
      toast.error("Please enter a price greater than zero");
      return;
    }

    setActionLoading(true);
    try {
      await updatePrice(selectedItem.id, price);
      toast.success(`Updated price for ${selectedItem.code} to LKR ${price.toFixed(2)}`);
      closeModal();
    } catch (err) {
      toast.error(err.message || "Failed to update price");
    } finally {
      setActionLoading(false);
    }
  };

  // Transactions matching the selected Daily/Monthly/Yearly period, regardless of cube type
  const dateFilteredTransactions = useMemo(() => {
    if (!transactions) return [];

    return transactions.filter(txn => {
      const txnDate = new Date(txn.created_at);

      if (historyFilterType === 'daily') {
        return toLocalDateStr(txnDate) === historyDate;
      } else if (historyFilterType === 'monthly') {
        return toLocalMonthStr(txnDate) === historyMonth; // YYYY-MM
      } else if (historyFilterType === 'yearly') {
        return txnDate.getFullYear().toString() === historyYear;
      }
      return true;
    });
  }, [transactions, historyFilterType, historyDate, historyMonth, historyYear]);

  // Production History table: also narrowed by the Cube Type filter
  const filteredTransactions = useMemo(() => {
    if (historyCubeType === 'all') return dateFilteredTransactions;
    return dateFilteredTransactions.filter(txn => txn.inventory?.type === historyCubeType);
  }, [dateFilteredTransactions, historyCubeType]);

  // Summary stats for filtered history — Brine (waste) and Damaged are
  // view-only everywhere in the system and must never be folded into a
  // combined total, so the 'all' aggregate excludes both (an explicit
  // Brine-only or Damaged-only filter still shows its own isolated figures).
  const historyStats = useMemo(() => {
    let added = 0;
    let deducted = 0;
    filteredTransactions.forEach(t => {
      if (historyCubeType === 'all' && !SELLABLE_TYPES.includes(t.inventory?.type)) return;
      const change = Number(t.quantity_change) || 0;
      if (change > 0) added += change;
      else deducted += Math.abs(change);
    });
    return { added, deducted, net: added - deducted };
  }, [filteredTransactions, historyCubeType]);

  // Cube types the graph should draw a line for. The Cube Type filter applies
  // here exactly as it does to the table below — picking "Production (MFC)"
  // previously narrowed the table but left the graph showing all three series,
  // which read as the filter being broken in Graph View.
  const graphSeries = useMemo(() => {
    if (historyCubeType === 'all') return ['Production', 'Resell', 'Brine', 'Damaged'];
    return [CUBE_TYPE_LABELS[historyCubeType]];
  }, [historyCubeType]);

  // Graph View: net cube movement per cube type, bucketed across the time axis
  // implied by the selected filter (hours for a day, days for a month, months for a year).
  const graphData = useMemo(() => {
    let buckets;
    if (historyFilterType === 'daily') {
      buckets = Array.from({ length: 24 }, (_, h) => ({
        label: `${h.toString().padStart(2, '0')}:00`, Production: 0, Resell: 0, Brine: 0, Damaged: 0
      }));
    } else if (historyFilterType === 'monthly') {
      const [y, m] = historyMonth.split('-').map(Number);
      const daysInMonth = new Date(y, m, 0).getDate();
      buckets = Array.from({ length: daysInMonth }, (_, d) => ({
        label: `${d + 1}`, Production: 0, Resell: 0, Brine: 0, Damaged: 0
      }));
    } else {
      buckets = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        .map(label => ({ label, Production: 0, Resell: 0, Brine: 0, Damaged: 0 }));
    }

    dateFilteredTransactions.forEach(txn => {
      const txnDate = new Date(txn.created_at);
      const idx = historyFilterType === 'daily' ? txnDate.getHours()
        : historyFilterType === 'monthly' ? txnDate.getDate() - 1
        : txnDate.getMonth();

      const bucket = buckets[idx];
      const seriesKey = CUBE_TYPE_LABELS[txn.inventory?.type];
      if (!bucket || !seriesKey) return;
      if (!graphSeries.includes(seriesKey)) return;
      bucket[seriesKey] += Number(txn.quantity_change) || 0;
    });

    return buckets;
  }, [dateFilteredTransactions, historyFilterType, historyMonth, graphSeries]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="animate-pulse bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 h-60" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Top Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs">
        <h2 className="text-base sm:text-lg font-bold font-heading text-slate-900 dark:text-slate-100">
          Inventory & Stock Control
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Real-time stock balances for Production, Purchases, Brine and Damaged Cubes.
        </p>
      </div>

      {/* Total Cubes — Production + Resell only. Brine and Damaged are stock
          counts of cubes that can't be sold, so folding them in would
          overstate what the factory actually has available to sell. */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
            Total Cubes
          </span>
          <span className="text-[11px] text-slate-400 block mt-0.5 truncate">
            Production + Resell — available to sell
          </span>
        </div>
        <div className="text-right shrink-0">
          <span className="text-xl sm:text-2xl md:text-3xl font-extrabold font-heading text-navy-600 dark:text-sky-400 block leading-none">
            {totalSellableCubes.toLocaleString()}
          </span>
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Cubes</span>
        </div>
      </div>

      {/* Stock Cards Layout - 4-Column Landscape Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 landscape:grid-cols-4 gap-3 sm:gap-5">
        {inventory.map((item) => {
          // Brine and Damaged are stock-only lines: no price, nothing to sell.
          const isStockOnly = !SELLABLE_TYPES.includes(item.type);
          
          return (
            <div 
              key={item.id} 
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs p-4 sm:p-5 flex flex-col justify-between hover:shadow-md transition-shadow relative overflow-hidden"
            >
              {/* Badge Overlay */}
              <div className="absolute top-3.5 right-3.5">
                <Badge type={item.code.split('-')[0]} />
              </div>

              {/* Card Body */}
              <div className="space-y-3">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold tracking-wider uppercase">
                    {item.code}
                  </span>
                  <h3 className="text-sm sm:text-base font-bold font-heading text-slate-800 dark:text-slate-100 capitalize mt-0.5">
                    {CUBE_CARD_TITLES[item.type] || item.type} Cubes
                  </h3>
                </div>

                <div className="py-2 border-y border-slate-100 dark:border-slate-800 flex justify-between items-baseline">
                  <div>
                    <span className="text-[11px] text-slate-400 block mb-0.5">Available Qty</span>
                    <span className="text-xl sm:text-2xl font-extrabold font-heading text-slate-900 dark:text-slate-50">
                      {item.quantity.toLocaleString()}
                    </span>
                  </div>
                  
                  {!isStockOnly && (
                    <div className="text-right">
                      <span className="text-[11px] text-slate-400 block mb-0.5">Price / Cube</span>
                      {item.price_per_cube !== null && item.price_per_cube !== undefined ? (
                        <span className="text-sm sm:text-base font-bold font-mono text-emerald-600 dark:text-emerald-400">
                          LKR {item.price_per_cube.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-xs font-semibold text-rose-500 bg-rose-50 dark:bg-rose-950/20 px-2 py-0.5 rounded border border-rose-200 dark:border-rose-900/50 flex items-center">
                          <AlertTriangle size={12} className="mr-1" /> Unset
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Card Actions */}
              <div className="mt-4 grid grid-cols-3 gap-1.5 sm:gap-2">
                {/* Add button visible to all */}
                <Button 
                  variant="secondary" 
                  size="sm"
                  onClick={() => openModal('add', item)}
                  className="flex items-center justify-center space-x-1"
                >
                  <Plus size={14} />
                  <span>Add</span>
                </Button>

                {/* Remove stock button admin only */}
                {isAdmin ? (
                  <Button 
                    variant="secondary" 
                    size="sm"
                    disabled={item.quantity === 0}
                    onClick={() => openModal('remove', item)}
                    className="flex items-center justify-center space-x-1 border border-slate-300 dark:border-slate-700"
                  >
                    <Minus size={14} />
                    <span>Remove</span>
                  </Button>
                ) : (
                  <Button 
                    variant="secondary" 
                    size="sm"
                    disabled
                    className="flex items-center justify-center space-x-1 opacity-40 cursor-not-allowed border border-slate-200 dark:border-slate-800"
                    title="Admin privilege required"
                  >
                    <Minus size={14} />
                    <span>Remove</span>
                  </Button>
                )}

                {/* Edit Price admin only — Brine and Damaged have no price */}
                {!isStockOnly ? (
                  isAdmin ? (
                    <Button 
                      variant="primary" 
                      size="sm"
                      onClick={() => openModal('editPrice', item)}
                      className="flex items-center justify-center space-x-1"
                    >
                      <Edit size={14} />
                      <span>Price</span>
                    </Button>
                  ) : (
                    <Button 
                      variant="primary" 
                      size="sm"
                      disabled
                      className="flex items-center justify-center space-x-1 opacity-40 cursor-not-allowed bg-slate-300 text-slate-500 border-none hover:bg-slate-300"
                      title="Admin privilege required"
                    >
                      <Edit size={14} />
                      <span>Price</span>
                    </Button>
                  )
                ) : (
                  <div />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Filter Options Bar */}
      <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col md:flex-row items-center justify-between gap-3">

        {/* View Mode Tabs (Daily / Monthly / Yearly) */}
        <div className="flex items-center space-x-1 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setHistoryFilterType('daily')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              historyFilterType === 'daily'
                ? 'bg-navy-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Daily
          </button>
          <button
            onClick={() => setHistoryFilterType('monthly')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              historyFilterType === 'monthly'
                ? 'bg-navy-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setHistoryFilterType('yearly')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              historyFilterType === 'yearly'
                ? 'bg-navy-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Yearly
          </button>
        </div>

        {/* Date Range Selector for the chosen method */}
        <div className="flex items-center space-x-3 w-full md:w-auto">
          {historyFilterType === 'daily' && (
            <input
              type="date"
              value={historyDate}
              onChange={(e) => setHistoryDate(e.target.value)}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none"
            />
          )}

          {historyFilterType === 'monthly' && (
            <input
              type="month"
              value={historyMonth}
              onChange={(e) => setHistoryMonth(e.target.value)}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none"
            />
          )}

          {historyFilterType === 'yearly' && (
            <select
              value={historyYear}
              onChange={(e) => setHistoryYear(e.target.value)}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none"
            >
              {YEAR_OPTIONS.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          )}

          {/* Cube Type Filter */}
          <select
            value={historyCubeType}
            onChange={(e) => setHistoryCubeType(e.target.value)}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none"
          >
            <option value="all">All Cube Types</option>
            <option value="manufactured">Production (MFC)</option>
            <option value="resell">Resell (RSC)</option>
            <option value="waste">Brine Cubes (BNC)</option>
            <option value="damaged">Damaged Cubes (DGC)</option>
          </select>
        </div>
      </div>

      {/* Production History / Graph View Toggle */}
      <div className="flex items-center space-x-1 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700 w-fit">
        <button
          onClick={() => setHistoryViewMode('table')}
          className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
            historyViewMode === 'table'
              ? 'bg-navy-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <Table2 size={14} />
          <span>Production History</span>
        </button>
        <button
          onClick={() => setHistoryViewMode('graph')}
          className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
            historyViewMode === 'graph'
              ? 'bg-navy-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <LineChartIcon size={14} />
          <span>Graph View</span>
        </button>
      </div>

      {historyViewMode === 'table' ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs p-4 sm:p-5 space-y-5">
          {/* History KPI Scorecard */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 rounded-xl">
              <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold uppercase">Total Added (+)</span>
              <p className="font-bold text-base text-emerald-600 dark:text-emerald-400 mt-0.5">
                +{historyStats.added.toLocaleString()} cubes
              </p>
            </div>

            <div className="p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50 rounded-xl">
              <span className="text-[10px] text-rose-700 dark:text-rose-400 font-bold uppercase">Total Deducted (-)</span>
              <p className="font-bold text-base text-rose-600 dark:text-rose-400 mt-0.5">
                -{historyStats.deducted.toLocaleString()} cubes
              </p>
            </div>
          </div>

          {/* Itemized Transactions Table */}
          {filteredTransactions.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              No inventory stock transactions recorded for the selected filter.
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[50vh] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-slate-500 uppercase text-[10px]">
                  <tr>
                    <th className="py-2.5 px-3">Date & Time</th>
                    <th className="py-2.5 px-3">Cube Type</th>
                    <th className="py-2.5 px-3">Event Type</th>
                    <th className="py-2.5 px-3 text-right">Qty Change</th>
                    <th className="py-2.5 px-3 text-right">Prev Stock</th>
                    <th className="py-2.5 px-3 text-right">New Stock</th>
                    <th className="py-2.5 px-3">Operator</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredTransactions.map((txn, idx) => {
                    const change = Number(txn.quantity_change) || 0;
                    const isPositive = change > 0;
                    const typeLabel = CUBE_TYPE_LABELS[txn.inventory?.type] || txn.inventory?.type || 'Cube';

                    return (
                      <tr key={txn.id || idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 px-3 font-mono text-slate-500">
                          {new Date(txn.created_at).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 font-bold uppercase text-slate-700 dark:text-slate-300">
                          {typeLabel}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            txn.transaction_type === 'add'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : txn.transaction_type === 'sale_deduction'
                                ? 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300'
                                : txn.transaction_type === 'free_issue'
                                  ? 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300'
                                  : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                          }`}>
                            {txn.transaction_type.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className={`py-2.5 px-3 text-right font-mono font-bold ${
                          isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                        }`}>
                          {isPositive ? `+${change}` : change}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-400">
                          {txn.previous_quantity}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold">
                          {txn.new_quantity}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500">
                          {txn.created_by || 'Operator'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs sm:text-sm font-bold font-heading text-slate-800 dark:text-slate-100">
              Cube Movement Trend
            </h3>
            <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 capitalize">
              {historyFilterType} view · {historyCubeType === 'all' ? 'All cube types' : CUBE_TYPE_LABELS[historyCubeType]}
            </span>
          </div>
          <div className="h-64 sm:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={graphData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" className="dark:hidden" />
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" className="hidden dark:block" />
                <XAxis dataKey="label" stroke="#94a3b8" fontSize={9} tickLine={false} />
                <YAxis
                  stroke="#94a3b8"
                  fontSize={9}
                  tickLine={false}
                  label={{ value: 'Cubes', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#94a3b8' }}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)', fontSize: '11px' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                {graphSeries.includes('Production') && (
                  <Line type="monotone" dataKey="Production" stroke={GRAPH_COLORS.manufactured} strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
                )}
                {graphSeries.includes('Resell') && (
                  <Line type="monotone" dataKey="Resell" stroke={GRAPH_COLORS.resell} strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
                )}
                {graphSeries.includes('Damaged') && (
                  <Line type="monotone" dataKey="Damaged" stroke={GRAPH_COLORS.damaged} strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
                )}
                {graphSeries.includes('Brine') && (
                  <Line type="monotone" dataKey="Brine" stroke={GRAPH_COLORS.waste} strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* --- Modals --- */}

      {/* 1. Add Stock Modal */}
      <Modal 
        isOpen={activeModal === 'add'} 
        onClose={closeModal} 
        title={`Add Cubes: ${selectedItem?.code}`}
        size="sm"
      >
        <form onSubmit={handleAddStock} className="space-y-4">
          <Input
            label="Quantity to Add"
            name="qty"
            type="number"
            min="1"
            placeholder="e.g. 500"
            value={quantityInput}
            onChange={(e) => setQuantityInput(e.target.value)}
            required
          />
          <div className="flex justify-end space-x-3 pt-2">
            <Button type="button" variant="secondary" onClick={closeModal}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={actionLoading}>
              {actionLoading ? 'Adding...' : 'Confirm Add'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* 2. Remove Stock Modal */}
      <Modal 
        isOpen={activeModal === 'remove'} 
        onClose={closeModal} 
        title={`Remove Cubes: ${selectedItem?.code}`}
        size="sm"
      >
        <form onSubmit={handleRemoveStock} className="space-y-4">
          <Input
            label="Quantity to Remove"
            name="qty"
            type="number"
            min="1"
            max={selectedItem?.quantity || 0}
            placeholder={`Max: ${selectedItem?.quantity || 0}`}
            value={quantityInput}
            onChange={(e) => setQuantityInput(e.target.value)}
            required
          />
          <div className="flex justify-end space-x-3 pt-2">
            <Button type="button" variant="secondary" onClick={closeModal}>Cancel</Button>
            <Button type="submit" variant="danger" disabled={actionLoading}>
              {actionLoading ? 'Removing...' : 'Confirm Remove'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* 3. Edit Price Modal */}
      <Modal 
        isOpen={activeModal === 'editPrice'} 
        onClose={closeModal} 
        title={`Set Price per Cube: ${selectedItem?.code}`}
        size="sm"
      >
        <form onSubmit={handleEditPrice} className="space-y-4">
          <Input
            label="Price per Cube (LKR)"
            name="price"
            type="number"
            step="0.01"
            min="0"
            placeholder="e.g. 12.50"
            value={priceInput}
            onChange={(e) => setPriceInput(e.target.value)}
            required
          />
          <div className="flex justify-end space-x-3 pt-2">
            <Button type="button" variant="secondary" onClick={closeModal}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={actionLoading}>
              {actionLoading ? 'Updating...' : 'Save Price'}
            </Button>
          </div>
        </form>
      </Modal>

    </div>
  );
}
