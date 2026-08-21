import React, { useState } from 'react';
import { useExpenses } from '../hooks/useExpenses';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { Skeleton } from '../components/Skeleton';
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  PieChart as PieIcon, 
  Plus, 
  Search, 
  Trash2, 
  Receipt,
  Zap,
  Flame,
  Wrench,
  Users,
  Package,
  CircleDollarSign
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell, 
  PieChart, 
  Pie 
} from 'recharts';

export function ExpenseLedgerPage() {
  const { expenses, isLoading, addExpense, deleteExpense, pnlMetrics } = useExpenses();
  const { isAdmin } = useAuth();
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);

  // Form State
  const [category, setCategory] = useState('electricity');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('bank_transfer');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddExpense = async (e) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      const newExp = await addExpense({
        category,
        description,
        amount,
        payment_method: paymentMethod
      });
      toast.success(`Expense ${newExp.expense_code} logged successfully!`);
      setIsAddExpenseOpen(false);
      resetForm();
    } catch (err) {
      toast.error(err.message || "Failed to log expense");
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setCategory('electricity');
    setDescription('');
    setAmount('');
    setPaymentMethod('bank_transfer');
  };

  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to delete this expense log?")) {
      try {
        await deleteExpense(id);
        toast.info("Expense log removed.");
      } catch (err) {
        toast.error(err.message || "Failed to delete expense");
      }
    }
  };

  // Filtered Expenses
  const filteredExpenses = expenses.filter(e => {
    const matchesSearch = e.description.toLowerCase().includes(search.toLowerCase()) ||
                          e.expense_code.toLowerCase().includes(search.toLowerCase());
    const matchesCat = selectedCategory === 'all' || e.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  // Recharts Data Prep
  const pnlChartData = [
    { name: 'Sales Revenue', value: pnlMetrics.totalSalesRevenue, fill: '#10b981' },
    { name: 'Operational Costs', value: pnlMetrics.totalCosts, fill: '#ef4444' },
    { name: 'Net Profit', value: Math.max(0, pnlMetrics.netProfit), fill: '#3b82f6' }
  ];

  const categoryPieData = Object.entries(pnlMetrics.categoryBreakdown).map(([cat, val]) => {
    return { name: cat.replace('_', ' ').toUpperCase(), value: val };
  });

  const COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#64748b', '#06b6d4'];

  const getCategoryIcon = (cat) => {
    switch (cat) {
      case 'electricity': return <Zap size={14} className="text-amber-500" />;
      case 'diesel': return <Flame size={14} className="text-orange-500" />;
      case 'maintenance': return <Wrench size={14} className="text-blue-500" />;
      case 'salaries': return <Users size={14} className="text-purple-500" />;
      case 'packaging': return <Package size={14} className="text-emerald-500" />;
      default: return <Receipt size={14} className="text-slate-500" />;
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h1 className="text-xl font-bold font-heading text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <CircleDollarSign className="text-emerald-500" size={24} />
            Operating Expense Ledger & P&L Analytics
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Track factory overheads, energy bills, salaries, and calculate Net Profit margin.
          </p>
        </div>

        <Button variant="primary" onClick={() => setIsAddExpenseOpen(true)} className="text-xs">
          <Plus size={16} className="mr-1.5" />
          Log Operating Expense
        </Button>
      </div>

      {/* P&L Executive KPI Summary Cards - 4-Column Landscape Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 landscape:grid-cols-4 gap-2.5 sm:gap-4">
        
        {/* Total Sales Revenue */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 shrink-0">
            <TrendingUp size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 uppercase tracking-wider block truncate">Gross Sales</span>
            <h3 className="text-sm sm:text-base md:text-lg font-bold text-slate-900 dark:text-slate-100 font-heading truncate">
              LKR {pnlMetrics.totalSalesRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </h3>
          </div>
        </div>

        {/* Total Operational Costs */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 shrink-0">
            <TrendingDown size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 uppercase tracking-wider block truncate">Total Costs</span>
            <h3 className="text-sm sm:text-base md:text-lg font-bold text-slate-900 dark:text-slate-100 font-heading truncate">
              LKR {pnlMetrics.totalCosts.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </h3>
          </div>
        </div>

        {/* Net Profit */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center space-x-3">
          <div className={`p-2.5 rounded-xl shrink-0 ${pnlMetrics.netProfit >= 0 ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400' : 'bg-red-50 text-red-600'}`}>
            <DollarSign size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 uppercase tracking-wider block truncate">Net Profit</span>
            <h3 className={`text-sm sm:text-base md:text-lg font-bold font-heading truncate ${pnlMetrics.netProfit >= 0 ? 'text-blue-600 dark:text-sky-400' : 'text-red-600'}`}>
              LKR {pnlMetrics.netProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </h3>
          </div>
        </div>

        {/* Profit Margin % */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 shrink-0">
            <PieIcon size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 uppercase tracking-wider block truncate">Margin</span>
            <h3 className="text-sm sm:text-base md:text-lg font-bold text-slate-900 dark:text-slate-100 font-heading truncate">
              {pnlMetrics.netProfitMargin}%
            </h3>
          </div>
        </div>

      </div>

      {/* P&L Visual Analytics Section - Side by Side in Landscape */}
      <div className="grid grid-cols-1 lg:grid-cols-2 landscape:grid-cols-2 gap-4 sm:gap-6">
        
        {/* P&L Comparison Bar Chart */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
          <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 font-heading">
            P&L Overview (Revenue vs Costs vs Profit)
          </h3>
          <div className="h-48 sm:h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pnlChartData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} />
                <Tooltip formatter={(value) => `LKR ${Number(value).toLocaleString()}`} />
                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                  {pnlChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Expense Category Distribution Pie Chart */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
          <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 font-heading">
            Cost Breakdown by Category
          </h3>
          <div className="h-48 sm:h-56 w-full flex items-center justify-center">
            {categoryPieData.length === 0 ? (
              <p className="text-xs text-slate-400">No expense category data logged yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={5}
                    dataKey="value"
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  >
                    {categoryPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => `LKR ${Number(value).toLocaleString()}`} />
                </PieChart>
              </ResponsiveContainer>

            )}
          </div>
        </div>

      </div>

      {/* Expense Ledger Search & Filter Controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Search code or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-navy-500 text-slate-800 dark:text-slate-100"
          />
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <span className="text-xs text-slate-500 font-semibold whitespace-nowrap">Category:</span>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full sm:w-48 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-navy-500"
          >
            <option value="all">All Categories</option>
            <option value="electricity">Electricity</option>
            <option value="diesel">Diesel</option>
            <option value="maintenance">Maintenance</option>
            <option value="salaries">Salaries</option>
            <option value="water_utilities">Water & Utilities</option>
            <option value="packaging">Packaging</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>

      {/* Expense Ledger Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="p-6 space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : filteredExpenses.length === 0 ? (
          <div className="p-12 text-center">
            <Receipt size={36} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">No Expenses Found</h3>
            <p className="text-xs text-slate-400 mt-1">Start logging factory operating costs to view complete P&L analytics.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-50 dark:bg-slate-800/50 uppercase text-[10px] font-bold text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Expense Code</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4">Payment Method</th>
                  <th className="py-3 px-4 text-right">Amount (LKR)</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {filteredExpenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                    <td className="py-3 px-4 font-bold text-slate-900 dark:text-slate-100 font-mono">
                      {exp.expense_code}
                    </td>
                    <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                      {new Date(exp.expense_date).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 capitalize">
                        {getCategoryIcon(exp.category)}
                        <span>{exp.category.replace('_', ' ')}</span>
                      </span>
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200">
                      {exp.description}
                    </td>
                    <td className="py-3 px-4 text-slate-500 uppercase font-semibold text-[10px]">
                      {exp.payment_method.replace('_', ' ')}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-slate-900 dark:text-slate-100">
                      LKR {parseFloat(exp.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {isAdmin ? (
                        <button
                          onClick={() => handleDelete(exp.id)}
                          className="p-1 text-slate-400 hover:text-red-500 transition"
                          title="Delete expense entry"
                        >
                          <Trash2 size={15} />
                        </button>
                      ) : (
                        <button
                          disabled
                          className="p-1 text-slate-300 dark:text-slate-700 opacity-40 cursor-not-allowed"
                          title="Admin privilege required to delete entries"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL: LOG OPERATING EXPENSE */}
      <Modal
        isOpen={isAddExpenseOpen}
        onClose={() => setIsAddExpenseOpen(false)}
        title="Log Operating Expense"
        size="lg"
      >
        <form onSubmit={handleAddExpense} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Expense Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-navy-500 min-h-[38px]"
              >
                <option value="electricity">Electricity Power Bill</option>
                <option value="diesel">Diesel & Fuel</option>
                <option value="maintenance">Machinery & Plant Maintenance</option>
                <option value="salaries">Staff Wages & Salaries</option>
                <option value="water_utilities">Water & Utility Bills</option>
                <option value="packaging">Packaging Materials</option>
                <option value="other">Other Operational Costs</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Payment Method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-navy-500 min-h-[38px]"
              >
                <option value="bank_transfer">Bank Transfer</option>
                <option value="cash">Cash</option>
                <option value="cheque">Cheque</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Description <span className="text-red-500">*</span></label>
              <input
                type="text"
                required
                placeholder="e.g. CEB Industrial Grid Power Bill July"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-navy-500 text-slate-900 dark:text-slate-100 min-h-[38px]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Amount (LKR) <span className="text-red-500">*</span></label>
              <input
                type="number"
                step="0.01"
                required
                placeholder="e.g. 45000.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-navy-500 text-slate-900 dark:text-slate-100 min-h-[38px]"
              />
            </div>
          </div>

          <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setIsAddExpenseOpen(false)}>Cancel</Button>
            <Button variant="primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Logging...' : 'Confirm & Save Expense'}
            </Button>
          </div>
        </form>
      </Modal>

    </div>
  );
}
