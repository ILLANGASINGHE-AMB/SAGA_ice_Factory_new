import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, 
  X, 
  Users, 
  ShoppingCart, 
  DollarSign, 
  Package,
  Receipt,
  ArrowRight 
} from 'lucide-react';
import { supabase } from '../lib/supabase';

export function GlobalSearchModal({ isOpen, onClose }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [data, setData] = useState({
    customers: [],
    sales: [],
    debts: [],
    inventory: [],
    expenses: []
  });
  const [isLoading, setIsLoading] = useState(false);

  // Fetch all entities on open
  useEffect(() => {
    if (!isOpen) return;

    const fetchAllData = async () => {
      setIsLoading(true);
      try {
        const [
          { data: customers },
          { data: sales },
          { data: debts },
          { data: inventory },
          { data: expenses }
        ] = await Promise.all([
          supabase.from('customers').select('*').limit(100),
          supabase.from('sales').select('*, customer:customers(name)').limit(100),
          supabase.from('debts').select('*, customer:customers(name), sale:sales(sale_code)').limit(100),
          supabase.from('inventory').select('*'),
          supabase.from('operating_expenses').select('*').limit(50)
        ]);

        setData({
          customers: customers || [],
          sales: sales || [],
          debts: debts || [],
          inventory: inventory || [],
          expenses: expenses || []
        });
      } catch (err) {
        console.error("Global search data fetch failed:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAllData();
  }, [isOpen]);

  // Escape key listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Filtered Results Calculation
  const searchResults = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return [];

    const results = [];

    // Search Customers
    data.customers.forEach(c => {
      if (c.name?.toLowerCase().includes(q) || c.whatsapp_number?.includes(q) || c.customer_code?.toLowerCase().includes(q)) {
        results.push({
          type: 'Customer',
          icon: <Users size={16} className="text-blue-500" />,
          title: c.name,
          subtitle: `${c.customer_code} • ${c.whatsapp_number}`,
          path: '/customers'
        });
      }
    });

    // Search Sales
    data.sales.forEach(s => {
      if (s.sale_code?.toLowerCase().includes(q) || s.customer?.name?.toLowerCase().includes(q) || s.cube_type?.toLowerCase().includes(q)) {
        results.push({
          type: 'Sale',
          icon: <ShoppingCart size={16} className="text-emerald-500" />,
          title: s.sale_code,
          subtitle: `${s.customer?.name || 'Customer'} • LKR ${s.total_amount?.toLocaleString()} (${s.payment_type})`,
          path: '/sales'
        });
      }
    });

    // Search Debts
    data.debts.forEach(d => {
      if (d.customer?.name?.toLowerCase().includes(q) || d.sale?.sale_code?.toLowerCase().includes(q) || d.status?.toLowerCase().includes(q)) {
        results.push({
          type: 'Debt Record',
          icon: <DollarSign size={16} className="text-rose-500" />,
          title: `${d.customer?.name} (${d.sale?.sale_code || 'Debt'})`,
          subtitle: `Outstanding: LKR ${d.remaining_amount?.toLocaleString()} • Status: ${d.status}`,
          path: '/debts'
        });
      }
    });

    // Search Inventory
    data.inventory.forEach(i => {
      if (i.code?.toLowerCase().includes(q) || i.type?.toLowerCase().includes(q)) {
        results.push({
          type: 'Stock Item',
          icon: <Package size={16} className="text-amber-500" />,
          title: `${i.code} (${i.type})`,
          subtitle: `Stock Qty: ${i.quantity?.toLocaleString()} cubes • Price: LKR ${i.price_per_cube || 'N/A'}`,
          path: '/inventory'
        });
      }
    });

    // Search Expenses
    data.expenses.forEach(e => {
      if (e.expense_code?.toLowerCase().includes(q) || e.description?.toLowerCase().includes(q) || e.category?.toLowerCase().includes(q)) {
        results.push({
          type: 'Expense',
          icon: <Receipt size={16} className="text-orange-500" />,
          title: `${e.expense_code} - ${e.description}`,
          subtitle: `Category: ${e.category} • Amount: LKR ${e.amount?.toLocaleString()}`,
          path: '/expenses'
        });
      }
    });

    return results.slice(0, 15); // Limit to top 15 matches
  }, [query, data]);

  if (!isOpen) return null;

  const handleSelectResult = (path) => {
    navigate(path);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 p-4 overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Search Modal Box */}
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in-50 zoom-in-95">
        {/* Input Bar */}
        <div className="flex items-center px-4 border-b border-slate-100 dark:border-slate-800">
          <Search size={20} className="text-slate-400 mr-3 flex-shrink-0" />
          <input
            type="text"
            autoFocus
            placeholder="Search customers, sales, debts, stock..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full py-4 text-sm font-medium bg-transparent border-none text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none"
          />
          {query && (
            <button onClick={() => setQuery('')} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 mr-2">
              <X size={16} />
            </button>
          )}
          <span className="hidden sm:inline-block text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-400">
            ESC
          </span>
        </div>

        {/* Results Box */}
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {isLoading ? (
            <div className="p-8 text-center text-xs text-slate-400 animate-pulse">
              Searching system registries...
            </div>
          ) : !query.trim() ? (
            <div className="p-8 text-center space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Quick Navigation</p>
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                {[
                  { name: 'Sales POS', path: '/sales' },
                  { name: 'Customers', path: '/customers' },
                  { name: 'Debt Ledger', path: '/debts' },
                  { name: 'Inventory', path: '/inventory' },
                  { name: 'Expenses', path: '/expenses' }
                ].map(chip => (
                  <button
                    key={chip.path}
                    onClick={() => handleSelectResult(chip.path)}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-navy-50 dark:hover:bg-sky-500/10 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-navy-600 dark:hover:text-sky-400 transition"
                  >
                    {chip.name}
                  </button>
                ))}
              </div>
            </div>
          ) : searchResults.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              No matching records found for "{query}".
            </div>
          ) : (
            <div className="space-y-1">
              {searchResults.map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => handleSelectResult(item.path)}
                  className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer transition group"
                >
                  <div className="flex items-center space-x-3">
                    <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800">
                      {item.icon}
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          {item.title}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-semibold">
                          {item.type}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {item.subtitle}
                      </p>
                    </div>
                  </div>
                  <ArrowRight size={14} className="text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
