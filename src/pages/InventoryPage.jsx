import React, { useState, useMemo } from 'react';
import { useInventory } from '../hooks/useInventory';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { Input, Select } from '../components/FormFields';
import { Plus, Minus, Edit, TrendingUp, AlertTriangle, History, Calendar, Clock, Filter, Search } from 'lucide-react';

export function InventoryPage() {
  const { inventory, transactions, isLoading, addStock, removeStock, updatePrice } = useInventory();
  const { user, isAdmin } = useAuth();
  const toast = useToast();

  // Modal control states
  const [activeModal, setActiveModal] = useState(null); // 'add' | 'remove' | 'editPrice' | 'history' | null
  const [selectedItem, setSelectedItem] = useState(null);
  
  // Input states
  const [quantityInput, setQuantityInput] = useState('');
  const [priceInput, setPriceInput] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // History Modal States
  const [historyFilterType, setHistoryFilterType] = useState('daily'); // 'daily' | 'monthly' | 'yearly'
  const [historyDate, setHistoryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [historyMonth, setHistoryMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [historyYear, setHistoryYear] = useState(() => new Date().getFullYear().toString());
  const [historyCubeType, setHistoryCubeType] = useState('all'); // 'all' | 'manufactured' | 'resell' | 'waste'

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
    if (qty > selectedItem.quantity) {
      toast.error(`Cannot remove more than available stock (${selectedItem.quantity})`);
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
    if (isNaN(price) || price < 0) {
      toast.error("Please enter a valid price");
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

  // Filtered transactions for History Modal
  const filteredTransactions = useMemo(() => {
    if (!transactions) return [];

    return transactions.filter(txn => {
      const txnDate = new Date(txn.created_at);
      
      // Date filter match
      let dateMatch = true;
      if (historyFilterType === 'daily') {
        const target = historyDate;
        const txnStr = txnDate.toISOString().slice(0, 10);
        dateMatch = txnStr === target;
      } else if (historyFilterType === 'monthly') {
        const targetMonth = historyMonth; // YYYY-MM
        const txnMonthStr = txnDate.toISOString().slice(0, 7);
        dateMatch = txnMonthStr === targetMonth;
      } else if (historyFilterType === 'yearly') {
        const targetYear = historyYear; // YYYY
        dateMatch = txnDate.getFullYear().toString() === targetYear;
      }

      // Cube Type match
      let cubeMatch = true;
      if (historyCubeType !== 'all') {
        const itemType = txn.inventory?.type;
        cubeMatch = itemType === historyCubeType;
      }

      return dateMatch && cubeMatch;
    });
  }, [transactions, historyFilterType, historyDate, historyMonth, historyYear, historyCubeType]);

  // Summary stats for filtered history
  const historyStats = useMemo(() => {
    let added = 0;
    let deducted = 0;
    filteredTransactions.forEach(t => {
      const change = Number(t.quantity_change) || 0;
      if (change > 0) added += change;
      else deducted += Math.abs(change);
    });
    return { added, deducted, net: added - deducted };
  }, [filteredTransactions]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="animate-pulse bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 h-60" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Top Bar with History Trigger */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs">
        <div>
          <h2 className="text-xl font-bold font-heading text-slate-900 dark:text-slate-100">
            Inventory & Stock Control
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Real-time stock balances for Manufactured, Resell, and Brine Cubes.
          </p>
        </div>

        <Button 
          variant="secondary" 
          onClick={() => setActiveModal('history')}
          className="flex items-center space-x-2 border border-slate-300 dark:border-slate-700"
        >
          <History size={16} className="text-navy-600 dark:text-sky-400" />
          <span>Stock History</span>
        </Button>
      </div>

      {/* Stock Cards Layout */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {inventory.map((item) => {
          const isWst = item.type === 'waste';
          
          return (
            <div 
              key={item.id} 
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6 flex flex-col justify-between hover:shadow-md transition-shadow relative overflow-hidden"
            >
              {/* Badge Overlay */}
              <div className="absolute top-4 right-4">
                <Badge type={item.code.split('-')[0]} />
              </div>

              {/* Card Body */}
              <div className="space-y-4">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold tracking-wider uppercase">
                    {item.code}
                  </span>
                  <h3 className="text-lg font-bold font-heading text-slate-800 dark:text-slate-100 capitalize mt-0.5">
                    {item.type === 'waste' ? 'Brine' : item.type} Cubes
                  </h3>
                </div>

                <div className="py-2 border-y border-slate-100 dark:border-slate-800 flex justify-between items-baseline">
                  <div>
                    <span className="text-xs text-slate-400 block mb-1">Available Qty</span>
                    <span className="text-3xl font-extrabold font-heading text-slate-900 dark:text-slate-50">
                      {item.quantity.toLocaleString()}
                    </span>
                  </div>
                  
                  {!isWst && (
                    <div className="text-right">
                      <span className="text-xs text-slate-400 block mb-1">Price per Cube</span>
                      {item.price_per_cube !== null && item.price_per_cube !== undefined ? (
                        <span className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400">
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
              <div className="mt-6 grid grid-cols-3 gap-2">
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

                {/* Edit Price admin only, hidden/disabled for WST */}
                {!isWst ? (
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
                  <div className="bg-slate-50 dark:bg-slate-800/20 border border-slate-100 dark:border-slate-800 rounded-lg flex items-center justify-center text-[10px] text-slate-400 font-semibold uppercase">
                    No Price
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

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

      {/* 4. Stock Movement History Modal */}
      <Modal
        isOpen={activeModal === 'history'}
        onClose={closeModal}
        title="Stock Movement History"
        size="lg"
      >
        <div className="space-y-5">
          {/* Filter Controls Bar */}
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

            {/* Time Filter Selector */}
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
                  <option value="2026">2026</option>
                  <option value="2025">2025</option>
                  <option value="2027">2027</option>
                </select>
              )}

              {/* Cube Type Filter */}
              <select
                value={historyCubeType}
                onChange={(e) => setHistoryCubeType(e.target.value)}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none"
              >
                <option value="all">All Cube Types</option>
                <option value="manufactured">Manufactured (MFC)</option>
                <option value="resell">Resell (RSC)</option>
                <option value="waste">Brine (WST)</option>
              </select>
            </div>
          </div>

          {/* History KPI Scorecard */}
          <div className="grid grid-cols-3 gap-3 text-xs">
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

            <div className="p-3 bg-navy-50 dark:bg-navy-950/40 border border-navy-200 dark:border-navy-900/50 rounded-xl">
              <span className="text-[10px] text-navy-700 dark:text-sky-300 font-bold uppercase">Net Movement</span>
              <p className="font-bold text-base text-navy-700 dark:text-sky-300 mt-0.5">
                {historyStats.net >= 0 ? `+${historyStats.net.toLocaleString()}` : historyStats.net.toLocaleString()} cubes
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
                    const typeLabel = txn.inventory?.type === 'waste' ? 'Brine' : txn.inventory?.type || 'Cube';

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
                                : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                          }`}>
                            {txn.transaction_type.replace('_', ' ')}
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
      </Modal>

    </div>
  );
}
