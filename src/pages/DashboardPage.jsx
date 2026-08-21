import React from 'react';
import { useDashboard } from '../hooks/useDashboard';
import { useMaintenance } from '../hooks/useMaintenance';
import { Badge } from '../components/Badge';
import { Table } from '../components/Table';
import { Skeleton } from '../components/Skeleton';
import { useNavigate } from 'react-router-dom';
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
  ShieldAlert,
  Wrench,
  Package,
  Recycle,
  Layers,
  Wallet,
  Landmark,
  CreditCard
} from 'lucide-react';

export function DashboardPage() {
  const { dashboardData, isLoading } = useDashboard();
  const { alertItems } = useMaintenance();
  const navigate = useNavigate();

  // Color constants for charts
  const COLORS = {
    manufactured: '#0ea5e9', // Icy Blue
    resell: '#6366f1',       // Indigo
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

  const { stats, charts, tables } = dashboardData;

  const money = (val) => `LKR ${(Number(val) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const cardItems = [
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
      icon: <Package size={20} className="text-cyan-500" />,
      bg: 'bg-cyan-50 dark:bg-cyan-950/30 border-cyan-100 dark:border-cyan-900/50 text-cyan-500'
    },
    {
      title: 'Resell Cubes',
      value: `${stats.rscInventory.toLocaleString()} Cubes`,
      icon: <Recycle size={20} className="text-indigo-500" />,
      bg: 'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-100 dark:border-indigo-900/50 text-indigo-500'
    },
    {
      title: 'Total Cubes',
      value: `${stats.totalProductionResellCubes.toLocaleString()} Cubes`,
      icon: <Layers size={20} className="text-violet-500" />,
      bg: 'bg-violet-50 dark:bg-violet-950/30 border-violet-100 dark:border-violet-900/50 text-violet-500'
    },
    // Row 2 — money
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
    },
    {
      title: 'Total Debts',
      value: money(stats.totalOutstandingDebts),
      icon: <CreditCard size={20} className="text-rose-500" />,
      bg: 'bg-rose-50 dark:bg-rose-950/30 border-rose-100 dark:border-rose-900/50 text-rose-500'
    }
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      
      {/* Downtime & Maintenance Alert Banner */}
      {alertItems.length > 0 && (
        <div className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-amber-500/10 dark:bg-slate-900/90 border border-amber-200 dark:border-amber-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm dark:shadow-[0_0_25px_-5px_rgba(245,158,11,0.15)] backdrop-blur-md">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-500 border border-amber-500/30 shrink-0">
              <ShieldAlert size={18} />
            </div>
            <div>
              <h4 className="text-xs font-bold text-amber-900 dark:text-amber-300 uppercase tracking-wider">
                Machinery Alerts ({alertItems.length})
              </h4>
              <p className="text-xs text-amber-700 dark:text-amber-400 font-medium line-clamp-1">
                {alertItems.map(i => `${i.equipment_name} (${i.status === 'offline' ? 'OFFLINE' : 'Service Due'})`).join(' • ')}
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate('/production')}
            className="px-3.5 py-1.5 text-xs font-bold bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-slate-950 rounded-xl transition-all shadow-xs shrink-0"
          >
            Manage Machinery
          </button>
        </div>
      )}

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
                <Bar dataKey="Manufactured" fill={COLORS.manufactured} radius={[4, 4, 0, 0]} />
                <Bar dataKey="Resell" fill={COLORS.resell} radius={[4, 4, 0, 0]} />
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
            
            {/* Center label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[10px] text-slate-400 font-medium">Split</span>
              <span className="text-xs font-bold font-heading text-slate-900 dark:text-slate-50">Sales</span>
            </div>
          </div>
          
          {/* Custom legend */}
          <div className="flex justify-around text-[11px] font-semibold px-1 pt-1 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span className="text-slate-700 dark:text-slate-300">Cash: {charts.pie[0]?.value.toLocaleString()}</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              <span className="text-slate-700 dark:text-slate-300">Debt: {charts.pie[1]?.value.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Monthly Revenue Timeline */}
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
                <td className="px-3.5 sm:px-6 py-2.5 sm:py-3"><Badge type={sale.cube_type === 'manufactured' ? 'MFC' : 'RSC'} /></td>
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

