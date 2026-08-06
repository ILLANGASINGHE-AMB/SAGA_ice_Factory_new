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
  Wrench
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
      <div className="space-y-6">
        {/* Metric Cards Loading */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
        
        {/* Charts Loading */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <Skeleton className="h-80 rounded-2xl lg:col-span-2" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      </div>
    );
  }

  const { stats, charts, tables } = dashboardData;

  const cardItems = [
    {
      title: 'Total Cubes Sold Today',
      value: `${stats.totalCubesSoldToday.toLocaleString()} Cubes`,
      icon: <Boxes size={24} className="text-sky-500" />,
      bg: 'bg-sky-50 dark:bg-sky-950/20 border-sky-100 dark:border-sky-900/50'
    },
    {
      title: 'Total Inventory',
      value: `${stats.totalInventory.toLocaleString()} Cubes`,
      icon: <Boxes size={24} className="text-indigo-500" />,
      bg: 'bg-indigo-50 dark:bg-indigo-950/20 border-indigo-100 dark:border-indigo-900/50'
    },
    {
      title: 'Total Revenue',
      value: `LKR ${stats.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      icon: <TrendingUp size={24} className="text-emerald-500" />,
      bg: 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/50'
    },
    {
      title: 'Pending Debts',
      value: `${stats.pendingDebtsCount} Customers`,
      icon: <AlertCircle size={24} className="text-rose-500" />,
      bg: 'bg-rose-50 dark:bg-rose-950/20 border-rose-100 dark:border-rose-900/50'
    }
  ];

  return (
    <div className="space-y-6">
      
      {/* Downtime & Maintenance Alert Banner */}
      {alertItems.length > 0 && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-amber-500/10 dark:bg-slate-900/90 border border-amber-200 dark:border-amber-500/30 flex items-center justify-between shadow-sm dark:shadow-[0_0_25px_-5px_rgba(245,158,11,0.15)] backdrop-blur-md">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-500 border border-amber-500/30">
              <ShieldAlert size={20} />
            </div>
            <div>
              <h4 className="text-xs font-bold text-amber-900 dark:text-amber-300 uppercase tracking-wider">
                Machinery Alerts ({alertItems.length})
              </h4>
              <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                {alertItems.map(i => `${i.equipment_name} (${i.status === 'offline' ? 'OFFLINE' : 'Service Due'})`).join(' • ')}
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate('/production')}
            className="px-4 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl transition-all shadow-sm hover:shadow-md"
          >
            Manage Machinery
          </button>
        </div>
      )}

      {/* 1. Summary Cards Row */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {cardItems.map((card, idx) => (
          <div 
            key={idx} 
            className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 shadow-sm dark:shadow-[0_4px_20px_-4px_rgba(0,0,0,0.4)] backdrop-blur-md flex items-center space-x-4 hover:-translate-y-0.5 transition-all duration-200"
          >
            <div className={`p-3.5 rounded-2xl ${card.bg.split(' ')[0]} ${card.bg.split(' ')[1]}`}>
              {card.icon}
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {card.title}
              </p>
              <h3 className="text-xl font-bold font-heading text-slate-900 dark:text-slate-50 mt-1">
                {card.value}
              </h3>
            </div>
          </div>
        ))}
      </div>

      {/* 2. Charts Section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        
        {/* Weekly Sales & Monthly Revenue Tabs */}
        <div className="bg-white dark:bg-slate-900/90 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-[0_4px_20px_-4px_rgba(0,0,0,0.4)] backdrop-blur-md lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
            <h3 className="text-base font-bold font-heading text-slate-800 dark:text-slate-100">
              Weekly Cube Production Sales
            </h3>
            <span className="text-xs font-semibold text-slate-400 dark:text-slate-400">
              Last 7 Days
            </span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.weekly} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" className="dark:hidden" />
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" className="hidden dark:block" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)' }}
                  labelStyle={{ fontWeight: 'bold', color: '#38bdf8' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Manufactured" fill={COLORS.manufactured} radius={[4, 4, 0, 0]} />
                <Bar dataKey="Resell" fill={COLORS.resell} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Debt vs Cash sales (Pie Chart) */}
        <div className="bg-white dark:bg-slate-900/90 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-[0_4px_20px_-4px_rgba(0,0,0,0.4)] backdrop-blur-md space-y-4 flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
            <h3 className="text-base font-bold font-heading text-slate-800 dark:text-slate-100">
              Sales Distribution
            </h3>
            <span className="text-xs font-semibold text-slate-400 dark:text-slate-400">
              Cash vs Credit
            </span>
          </div>
          <div className="h-48 relative flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={charts.pie}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={75}
                  paddingAngle={4}
                  dataKey="value"
                >
                  <Cell fill={COLORS.cash} />
                  <Cell fill={COLORS.debt} />
                </Pie>
                <Tooltip 
                  formatter={(value) => `LKR ${value.toLocaleString()}`}
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)' }}
                />
              </PieChart>
            </ResponsiveContainer>
            
            {/* Center label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-xs text-slate-400 font-medium">Aggregate</span>
              <span className="text-base font-bold font-heading text-slate-900 dark:text-slate-50">Sales</span>
            </div>
          </div>
          
          {/* Custom legend */}
          <div className="flex justify-around text-xs font-semibold px-2">
            <div className="flex items-center space-x-2">
              <span className="w-3 h-3 rounded-full bg-emerald-500" />
              <span className="text-slate-700 dark:text-slate-300">Cash: LKR {charts.pie[0]?.value.toLocaleString()}</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-3 h-3 rounded-full bg-rose-500" />
              <span className="text-slate-700 dark:text-slate-300">Debt: LKR {charts.pie[1]?.value.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Monthly Revenue Timeline */}
      <div className="bg-white dark:bg-slate-900/90 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-[0_4px_20px_-4px_rgba(0,0,0,0.4)] backdrop-blur-md">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 mb-4">
          <h3 className="text-base font-bold font-heading text-slate-800 dark:text-slate-100">
            Monthly Revenue Trend (Daily)
          </h3>
          <span className="text-xs font-semibold text-slate-400 dark:text-slate-400">
            Last 30 Days
          </span>
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={charts.monthly} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" className="dark:hidden" />
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" className="hidden dark:block" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickLine={false} />
              <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} />
              <Tooltip 
                formatter={(value) => [`LKR ${value.toLocaleString()}`, 'Revenue']}
                contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)' }}
              />
              <Line type="monotone" dataKey="Revenue" stroke="#0ea5e9" strokeWidth={2.5} dot={false} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 3. Recent Activity Grid */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        
        {/* Recent Sales Table */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold font-heading text-slate-800 dark:text-slate-100">
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
                <td className="px-6 py-3.5 font-medium text-slate-900 dark:text-slate-100">{sale.customerName}</td>
                <td className="px-6 py-3.5"><Badge type={sale.cube_type === 'manufactured' ? 'MFC' : 'RSC'} /></td>
                <td className="px-6 py-3.5 font-mono">{sale.quantity.toLocaleString()}</td>
                <td className="px-6 py-3.5 font-semibold font-mono text-slate-800 dark:text-slate-200">LKR {sale.total_amount.toLocaleString()}</td>
                <td className="px-6 py-3.5 text-xs text-slate-400">{new Date(sale.sale_date).toLocaleDateString()}</td>
              </tr>
            )}
          />
        </div>

        {/* Recent Debts Table */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold font-heading text-slate-800 dark:text-slate-100">
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
                <td className="px-6 py-3.5 font-medium text-slate-900 dark:text-slate-100">{debt.customerName}</td>
                <td className="px-6 py-3.5 font-mono">LKR {debt.total_amount.toLocaleString()}</td>
                <td className="px-6 py-3.5 font-mono font-semibold text-rose-600 dark:text-rose-400">LKR {debt.remaining_amount.toLocaleString()}</td>
                <td className="px-6 py-3.5"><Badge type={debt.status} /></td>
              </tr>
            )}
          />
        </div>

        {/* Recent Settlements Table */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold font-heading text-slate-800 dark:text-slate-100">
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
                <td className="px-6 py-3.5 font-medium text-slate-900 dark:text-slate-100">{setl.customerName}</td>
                <td className="px-6 py-3.5 font-mono font-medium text-navy-600 dark:text-navy-400">{setl.saleCode}</td>
                <td className="px-6 py-3.5 font-semibold font-mono text-emerald-600 dark:text-emerald-400">LKR {setl.amount_paid.toLocaleString()}</td>
                <td className="px-6 py-3.5 text-xs text-slate-400">{new Date(setl.settlement_date).toLocaleString()}</td>
              </tr>
            )}
          />
        </div>

      </div>

    </div>
  );
}
