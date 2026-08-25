import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useDashboard } from '../hooks/useDashboard';
import { useAuth } from '../context/AuthContext';
import { Badge } from '../components/Badge';
import { Table } from '../components/Table';
import { Skeleton } from '../components/Skeleton';
import { Button } from '../components/Button';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line,
  PieChart, Pie, Cell
} from 'recharts';
import {
  Boxes,
  TrendingUp,
  AlertCircle,
  ArrowUpRight,
  Package,
  Recycle,
  Layers,
  Wallet,
  Landmark,
  CreditCard,
  ShoppingCart,
  HandCoins
} from 'lucide-react';

export function DashboardPage() {
  const { dashboardData, isLoading } = useDashboard();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  const handleAddNewOrder = () => {
    navigate('/sales', { state: { openNewOrder: true } });
  };

  // Collections shortcut: hands the operator straight to the Debts ledger with
  // the debtor picker already open, so a walk-in payment can be registered
  // without hunting the customer down in the ledger first.
  const handleSettleDebts = () => {
    navigate('/debts', { state: { openSettleDebt: true } });
  };

  // Color constants for charts
  const COLORS = {
    manufactured: '#22c55e', // Production - green
    resell: '#0ea5e9',       // Resell - light blue
    total: '#7c3aed',        // Production + Resell combined - violet
    purchases: '#f59e0b',    // Purchased-in stock - amber
    cash: '#10b981',         // Green
    debt: '#f43f5e'          // Rose
  };

  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        {/* Metric Cards Loading */}
        <div className="grid grid-cols-2 lg:grid-cols-4 landscape:grid-cols-4 gap-3 sm:gap-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 sm:h-28 rounded-2xl" />
          ))}
        </div>
        
        {/* Charts Loading */}
        <div className="grid grid-cols-1 lg:grid-cols-3 landscape:grid-cols-3 gap-4 sm:gap-5">
          <Skeleton className="h-64 sm:h-72 rounded-2xl lg:col-span-2 landscape:col-span-2" />
          <Skeleton className="h-64 sm:h-72 rounded-2xl" />
        </div>
      </div>
    );
  }

  const { stats, charts, tables, totals } = dashboardData;

  const money = (val) => `LKR ${(Number(val) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const cubeCards = [
    // Row 1 — cube counts
    {
      title: 'Sold Today',
      value: `${stats.totalCubesSoldToday.toLocaleString()} Cubes`,
      icon: <Boxes size={20} className="text-sky-500" />,
      bg: 'bg-sky-50 dark:bg-sky-950/30 border-sky-100 dark:border-sky-900/50 text-sky-500'
    },
    {
      title: 'Production Cubes',
      value: `${stats.mfcInventory.toLocaleString()} Cubes`,
      icon: <Package size={20} className="text-green-500" />,
      bg: 'bg-green-50 dark:bg-green-950/30 border-green-100 dark:border-green-900/50 text-green-500'
    },
    {
      title: 'Resell Cubes',
      value: `${stats.rscInventory.toLocaleString()} Cubes`,
      icon: <Recycle size={20} className="text-sky-500" />,
      bg: 'bg-sky-50 dark:bg-sky-950/30 border-sky-100 dark:border-sky-900/50 text-sky-500'
    },
    {
      title: 'Total Cubes',
      value: `${stats.totalProductionResellCubes.toLocaleString()} Cubes`,
      icon: <Layers size={20} className="text-violet-500" />,
      bg: 'bg-violet-50 dark:bg-violet-950/30 border-violet-100 dark:border-violet-900/50 text-violet-500'
    },
  ];

  // Row 2 — takings. Revenue and cash-flow figures are commercially sensitive
  // and are for administrators only; a staff operator sees the cube counts
  // and the outstanding-debt total they need to do their job, but nothing
  // that adds up what the factory earns.
  const revenueCards = [
    {
      title: 'Monthly Revenue',
      value: money(stats.monthlyRevenue),
      icon: <TrendingUp size={20} className="text-emerald-500" />,
      bg: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-100 dark:border-emerald-900/50 text-emerald-500'
    },
    {
      title: 'Total Revenue',
      value: money(stats.totalRevenue),
      icon: <Wallet size={20} className="text-teal-500" />,
      bg: 'bg-teal-50 dark:bg-teal-950/30 border-teal-100 dark:border-teal-900/50 text-teal-500'
    },
    {
      title: 'Monthly Cash Flow',
      value: money(stats.monthlyCashFlow),
      icon: <Landmark size={20} className="text-blue-500" />,
      bg: 'bg-blue-50 dark:bg-blue-950/30 border-blue-100 dark:border-blue-900/50 text-blue-500'
    }
  ];

  // Outstanding debt stays visible to everyone — it's a collections worklist,
  // not a measure of takings.
  const debtCard = {
    title: 'Total Debts',
    value: money(stats.totalOutstandingDebts),
    icon: <CreditCard size={20} className="text-rose-500" />,
    bg: 'bg-rose-50 dark:bg-rose-950/30 border-rose-100 dark:border-rose-900/50 text-rose-500'
  };

  const cardItems = isAdmin
    ? [...cubeCards, ...revenueCards, debtCard]
    : [...cubeCards, debtCard];

  return (
    <div className="space-y-4 sm:space-y-6">

      {/* Quick Action Triggers */}
      <div className="flex justify-end gap-2.5">
        <Button
          variant="primary"
          onClick={handleSettleDebts}
          className="flex items-center justify-center space-x-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 shadow-emerald-200 focus:ring-emerald-500"
        >
          <HandCoins size={16} />
          <span>Settle Debts</span>
        </Button>
        <Button
          variant="primary"
          onClick={handleAddNewOrder}
          className="flex items-center justify-center space-x-2 rounded-xl"
        >
          <ShoppingCart size={16} />
          <span>Add New Order</span>
        </Button>
      </div>

      {/* 1. Summary Cards Row - High Density Landscape 4-Col Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 landscape:grid-cols-4 gap-2.5 sm:gap-4">
        {cardItems.map((card, idx) => (
          <div 
            key={idx} 
            className="p-3.5 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 shadow-xs dark:shadow-[0_4px_20px_-4px_rgba(0,0,0,0.4)] backdrop-blur-md flex items-center space-x-3 hover:-translate-y-0.5 transition-all duration-200"
          >
            <div className={`p-2.5 rounded-xl ${card.bg.split(' ')[0]} ${card.bg.split(' ')[1]} shrink-0`}>
              {card.icon}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate">
                {card.title}
              </p>
              <h3 className="text-sm sm:text-base md:text-lg font-bold font-heading text-slate-900 dark:text-slate-50 mt-0.5 truncate">
                {card.value}
              </h3>
            </div>
          </div>
        ))}
      </div>

      {/* 2. Charts Section - Landscape Side-by-Side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 landscape:grid-cols-3 gap-4 sm:gap-5">
        
        {/* Monthly Sales & Production Chart */}
        <div className="bg-white dark:bg-slate-900/90 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs dark:shadow-[0_4px_20px_-4px_rgba(0,0,0,0.4)] backdrop-blur-md lg:col-span-2 landscape:col-span-2 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 className="text-xs sm:text-sm font-bold font-heading text-slate-800 dark:text-slate-100">
              Monthly Cube Production Sales
            </h3>
            <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500">
              Last 30 Days
            </span>
          </div>

          {/* Period totals — Production + Resell and their combined figure,
              so the chart answers "how many cubes did we sell this period?"
              without the reader having to add the bars up. */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-green-50 dark:bg-green-950/20 border border-green-100 dark:border-green-900/40 py-1.5">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-green-700 dark:text-green-400">Production</span>
              <span className="block text-xs sm:text-sm font-bold font-mono text-green-700 dark:text-green-400">
                {totals.monthlyCubesProduction.toLocaleString()}
              </span>
            </div>
            <div className="rounded-xl bg-sky-50 dark:bg-sky-950/20 border border-sky-100 dark:border-sky-900/40 py-1.5">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-400">Retail / Resell</span>
              <span className="block text-xs sm:text-sm font-bold font-mono text-sky-700 dark:text-sky-400">
                {totals.monthlyCubesResell.toLocaleString()}
              </span>
            </div>
            <div className="rounded-xl bg-violet-50 dark:bg-violet-950/20 border border-violet-100 dark:border-violet-900/40 py-1.5">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-400">Total Cubes</span>
              <span className="block text-xs sm:text-sm font-bold font-mono text-violet-700 dark:text-violet-400">
                {totals.monthlyCubesTotal.toLocaleString()}
              </span>
            </div>
          </div>
          <div className="h-44 sm:h-52 md:h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.monthly} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" className="dark:hidden" />
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" className="hidden dark:block" />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={9} tickLine={false} interval={2} />
                <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)', fontSize: '11px' }}
                  labelStyle={{ fontWeight: 'bold', color: '#38bdf8' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 10, paddingTop: 4 }} />
                <Bar dataKey="Production" fill={COLORS.manufactured} radius={[4, 4, 0, 0]} />
                <Bar dataKey="Resell" fill={COLORS.resell} radius={[4, 4, 0, 0]} />
                <Bar dataKey="Total" fill={COLORS.total} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Debt vs Cash sales (Pie Chart) */}
        <div className="bg-white dark:bg-slate-900/90 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs dark:shadow-[0_4px_20px_-4px_rgba(0,0,0,0.4)] backdrop-blur-md space-y-3 flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 className="text-xs sm:text-sm font-bold font-heading text-slate-800 dark:text-slate-100">
              Sales Distribution (Monthly)
            </h3>
            <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500">
              Cash vs Credit
            </span>
          </div>
          <div className="h-36 sm:h-40 relative flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={charts.pie}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={65}
                  paddingAngle={4}
                  dataKey="value"
                >
                  <Cell fill={COLORS.cash} />
                  <Cell fill={COLORS.debt} />
                </Pie>
                <Tooltip 
                  formatter={(value) => `LKR ${value.toLocaleString()}`}
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)', fontSize: '11px' }}
                />
              </PieChart>
            </ResponsiveContainer>
            
            {/* Center label — the month's combined cash + debt sales value */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[10px] text-slate-400 font-medium">Total</span>
              <span className="text-[11px] sm:text-xs font-bold font-heading text-slate-900 dark:text-slate-50">
                {totals.salesDistributionTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>
          </div>
          
          {/* Custom legend + monthly total */}
          <div className="space-y-1.5 px-1 pt-1 border-t border-slate-100 dark:border-slate-800">
            <div className="flex justify-around text-[11px] font-semibold">
              <div className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="text-slate-700 dark:text-slate-300">Cash: {charts.pie[0]?.value.toLocaleString()}</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                <span className="text-slate-700 dark:text-slate-300">Debt: {charts.pie[1]?.value.toLocaleString()}</span>
              </div>
            </div>
            <div className="flex justify-between items-baseline text-[11px] font-bold pt-1 border-t border-dashed border-slate-100 dark:border-slate-800">
              <span className="text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[10px]">Total (Cash + Debt)</span>
              <span className="font-mono text-slate-900 dark:text-slate-50">{money(totals.salesDistributionTotal)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Production & Purchase Trends — cubes ADDED to stock over the last 30
          days: what the factory manufactured (MFC) versus what it bought in
          (RSC). This is intake, so sales deductions and manual removals are
          deliberately excluded. */}
      <div className="bg-white dark:bg-slate-900/90 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs dark:shadow-[0_4px_20px_-4px_rgba(0,0,0,0.4)] backdrop-blur-md">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-3">
          <h3 className="text-xs sm:text-sm font-bold font-heading text-slate-800 dark:text-slate-100">
            Production & Purchase Trends
          </h3>
          <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500">
            Cubes Added · Last 30 Days
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center mb-3">
          <div className="rounded-xl bg-green-50 dark:bg-green-950/20 border border-green-100 dark:border-green-900/40 py-1.5">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-green-700 dark:text-green-400">Produced</span>
            <span className="block text-xs sm:text-sm font-bold font-mono text-green-700 dark:text-green-400">
              {totals.trendProductionTotal.toLocaleString()}
            </span>
          </div>
          <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40 py-1.5">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">Purchased</span>
            <span className="block text-xs sm:text-sm font-bold font-mono text-amber-700 dark:text-amber-400">
              {totals.trendPurchaseTotal.toLocaleString()}
            </span>
          </div>
          <div className="rounded-xl bg-violet-50 dark:bg-violet-950/20 border border-violet-100 dark:border-violet-900/40 py-1.5">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-400">Total Intake</span>
            <span className="block text-xs sm:text-sm font-bold font-mono text-violet-700 dark:text-violet-400">
              {(totals.trendProductionTotal + totals.trendPurchaseTotal).toLocaleString()}
            </span>
          </div>
        </div>

        <div className="h-40 sm:h-48 md:h-52">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={charts.stockTrend} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" className="dark:hidden" />
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" className="hidden dark:block" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={9} tickLine={false} interval={2} />
              <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} />
              <Tooltip
                formatter={(value, name) => [`${Number(value).toLocaleString()} cubes`, name]}
                contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)', fontSize: '11px' }}
              />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 10, paddingTop: 4 }} />
              <Line type="monotone" dataKey="Production" stroke={COLORS.manufactured} strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
              <Line type="monotone" dataKey="Purchases" stroke={COLORS.purchases} strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Monthly Revenue Timeline — takings, so administrators only (same
          rule as the revenue summary cards above). */}
      {isAdmin && (
      <div className="bg-white dark:bg-slate-900/90 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs dark:shadow-[0_4px_20px_-4px_rgba(0,0,0,0.4)] backdrop-blur-md">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-3">
          <h3 className="text-xs sm:text-sm font-bold font-heading text-slate-800 dark:text-slate-100">
            Monthly Revenue Trend (Daily)
          </h3>
          <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500">
            Last 30 Days
          </span>
        </div>
        <div className="h-40 sm:h-48 md:h-52">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={charts.monthly} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" className="dark:hidden" />
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" className="hidden dark:block" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={9} tickLine={false} />
              <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} />
              <Tooltip 
                formatter={(value) => [`LKR ${value.toLocaleString()}`, 'Revenue']}
                contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)', fontSize: '11px' }}
              />
              <Line type="monotone" dataKey="Revenue" stroke="#0ea5e9" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      )}

      {/* 3. Recent Activity Grid - Landscape 2-Col Split */}
      <div className="grid grid-cols-1 xl:grid-cols-2 landscape:grid-cols-2 gap-4 sm:gap-5">
        
        {/* Recent Sales Table */}
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs sm:text-sm font-bold font-heading text-slate-800 dark:text-slate-100">
              Recent Cube Orders
            </h3>
          </div>
          <Table
            headers={[
              { key: 'customerName', label: 'Customer' },
              { key: 'cube_type', label: 'Type' },
              { key: 'quantity', label: 'Qty' },
              { key: 'total_amount', label: 'Amount' },
              { key: 'sale_date', label: 'Date' }
            ]}
            data={tables.recentSales}
            emptyMessage="No orders generated yet today."
            renderRow={(sale) => (
              <tr key={sale.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 border-b border-slate-100 dark:border-slate-800">
                <td className="px-3.5 sm:px-6 py-2.5 sm:py-3 font-medium text-slate-900 dark:text-slate-100 truncate max-w-[120px]">{sale.customerName}</td>
                <td className="px-3.5 sm:px-6 py-2.5 sm:py-3">
                  {(sale.sale_items?.length || 0) > 1 ? (
                    <Badge type="mixed" label="MIXED" />
                  ) : (
                    <Badge type={sale.cube_type === 'manufactured' ? 'MFC' : 'RSC'} />
                  )}
                </td>
                <td className="px-3.5 sm:px-6 py-2.5 sm:py-3 font-mono">{sale.quantity.toLocaleString()}</td>
                <td className="px-3.5 sm:px-6 py-2.5 sm:py-3 font-semibold font-mono text-slate-800 dark:text-slate-200">LKR {sale.total_amount.toLocaleString()}</td>
                <td className="px-3.5 sm:px-6 py-2.5 sm:py-3 text-xs text-slate-400">{new Date(sale.sale_date).toLocaleDateString()}</td>
              </tr>
            )}
          />
        </div>

        {/* Recent Debts Table */}
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs sm:text-sm font-bold font-heading text-slate-800 dark:text-slate-100">
              Outstanding Debt Log
            </h3>
          </div>
          <Table
            headers={[
              { key: 'customerName', label: 'Debtor' },
              { key: 'total_amount', label: 'Total' },
              { key: 'remaining_amount', label: 'Remaining' },
              { key: 'status', label: 'Status' }
            ]}
            data={tables.recentDebts}
            emptyMessage="Clear ledger! No debt issues recorded."
            renderRow={(debt) => (
              <tr key={debt.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 border-b border-slate-100 dark:border-slate-800">
                <td className="px-3.5 sm:px-6 py-2.5 sm:py-3 font-medium text-slate-900 dark:text-slate-100 truncate max-w-[120px]">{debt.customerName}</td>
                <td className="px-3.5 sm:px-6 py-2.5 sm:py-3 font-mono">LKR {debt.total_amount.toLocaleString()}</td>
                <td className="px-3.5 sm:px-6 py-2.5 sm:py-3 font-mono font-semibold text-rose-600 dark:text-rose-400">LKR {debt.remaining_amount.toLocaleString()}</td>
                <td className="px-3.5 sm:px-6 py-2.5 sm:py-3"><Badge type={debt.status} /></td>
              </tr>
            )}
          />
        </div>

        {/* Recent Settlements Table */}
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3 lg:col-span-2 landscape:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs sm:text-sm font-bold font-heading text-slate-800 dark:text-slate-100">
              Recent Debt Settlements
            </h3>
          </div>
          <Table
            headers={[
              { key: 'customerName', label: 'Customer' },
              { key: 'saleCode', label: 'Sale Ref' },
              { key: 'amount_paid', label: 'Amount Settled' },
              { key: 'settlement_date', label: 'Date Paid' }
            ]}
            data={tables.recentSettlements}
            emptyMessage="No debt collections registered recently."
            renderRow={(setl) => (
              <tr key={setl.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 border-b border-slate-100 dark:border-slate-800">
                <td className="px-3.5 sm:px-6 py-2.5 sm:py-3 font-medium text-slate-900 dark:text-slate-100">{setl.customerName}</td>
                <td className="px-3.5 sm:px-6 py-2.5 sm:py-3 font-mono font-medium text-navy-600 dark:text-navy-400">{setl.saleCode}</td>
                <td className="px-3.5 sm:px-6 py-2.5 sm:py-3 font-semibold font-mono text-emerald-600 dark:text-emerald-400">LKR {setl.amount_paid.toLocaleString()}</td>
                <td className="px-3.5 sm:px-6 py-2.5 sm:py-3 text-xs text-slate-400">{new Date(setl.settlement_date).toLocaleString()}</td>
              </tr>
            )}
          />
        </div>

      </div>

    </div>
  );
}

