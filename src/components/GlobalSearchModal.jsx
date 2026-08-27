import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  X,
  Users,
  Contact,
  Truck,
  ShoppingCart,
  DollarSign,
  Package,
  Receipt,
  StickyNote,
  ArrowRight
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { debtReference } from '../utils/customerDebt';
import { useBackdropDismiss } from '../hooks/useBackdropDismiss';

const MIN_QUERY_LENGTH = 2;
const PER_TABLE_LIMIT = 20;

// Two things need neutralising before a term goes into a filter:
//   - LIKE wildcards, or a customer literally named "50%" matches everything;
//   - PostgREST's own or() grammar separators (comma, parentheses, dot), which
//     would otherwise be read as filter syntax rather than search text.
function escapeLike(term) {
  return term
    .replace(/[,()."]/g, ' ')
    .replace(/[\\%_]/g, m => `\\${m}`)
    .trim();
}

export function GlobalSearchModal({ isOpen, onClose }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // The search term is pushed INTO the queries rather than downloading an
  // arbitrary 100 rows per table and filtering them client-side. Those queries
  // had no `order by` at all, so which 100 rows came back was unspecified:
  // customer #250 or a sale from last month simply returned "no results"
  // despite existing. Trigram indexes back the ilike lookups.
  useEffect(() => {
    if (!isOpen) {
      // This effect's job is to subscribe to an external system (Supabase:
      // an initial fetch plus a realtime channel) and push what it reports
      // back into React state — the case the rule explicitly allows for. It
      // is not derived state being patched in after a render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSearchResults([]);
      return undefined;
    }

    const q = query.trim();
    if (q.length < MIN_QUERY_LENGTH) {
      setSearchResults([]);
      setIsLoading(false);
      return undefined;
    }

    let cancelled = false;
    const pattern = `%${escapeLike(q)}%`;

    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const [
          { data: customers },
          { data: employees },
          { data: vehicles },
          { data: sales },
          { data: debts },
          { data: inventory },
          { data: expenses },
          { data: notes }
        ] = await Promise.all([
          supabase.from('customers').select('*')
            .or(`name.ilike.${pattern},customer_code.ilike.${pattern},whatsapp_number.ilike.${pattern},contact_number.ilike.${pattern}`)
            .order('name').limit(PER_TABLE_LIMIT),
          supabase.from('employees').select('*')
            .or(`name.ilike.${pattern},employee_code.ilike.${pattern},nic.ilike.${pattern},job_type.ilike.${pattern}`)
            .order('name').limit(PER_TABLE_LIMIT),
          supabase.from('vehicles').select('*')
            .or(`vehicle_no.ilike.${pattern},vehicle_model.ilike.${pattern},vehicle_type.ilike.${pattern}`)
            .order('vehicle_no').limit(PER_TABLE_LIMIT),
          supabase.from('sales').select('*, customer:customers(name)')
            .ilike('sale_code', pattern)
            .order('sale_date', { ascending: false }).limit(PER_TABLE_LIMIT),
          supabase.from('debts').select('*, customer:customers(name), sale:sales(sale_code)')
            .ilike('status', pattern)
            .order('created_at', { ascending: false }).limit(PER_TABLE_LIMIT),
          supabase.from('inventory').select('*')
            .or(`code.ilike.${pattern},type.ilike.${pattern}`).limit(PER_TABLE_LIMIT),
          // operating_expenses was dropped in the August expenses redesign
          // (20260821140000). This query used to 404 on every open and render
          // the Expenses section permanently empty.
          supabase.from('expense_amounts')
            .select('id, amount, expense_item:expense_items(name, expense_code, category:expense_categories(name)), ledger_row:expense_ledger_rows(entry_date, description)')
            .gt('amount', 0)
            .limit(200),
          supabase.from('notes').select('*')
            .or(`note_text.ilike.${pattern},created_by.ilike.${pattern}`)
            .order('created_at', { ascending: false }).limit(PER_TABLE_LIMIT)
        ]);

        if (cancelled) return;

        const lower = q.toLowerCase();
        const results = [];

        (customers || []).forEach(c => results.push({
          type: 'Customer',
          icon: <Users size={16} className="text-blue-500" />,
          title: c.name,
          subtitle: `${c.customer_code} • ${c.whatsapp_number || c.contact_number || 'No number'}`,
          path: '/customers'
        }));

        (employees || []).forEach(e => results.push({
          type: 'Employee',
          icon: <Contact size={16} className="text-emerald-500" />,
          title: e.name,
          subtitle: `${e.employee_code} • ${e.job_type || 'No job type'}`,
          path: '/employees'
        }));

        (vehicles || []).forEach(v => results.push({
          type: 'Vehicle',
          icon: <Truck size={16} className="text-indigo-500" />,
          title: v.vehicle_no,
          subtitle: `${v.vehicle_model} • ${v.vehicle_type === 'lorry' ? 'Lorry' : 'Pickup'}`,
          path: `/vehicles/${v.id}`
        }));

        (sales || []).forEach(sale => results.push({
          type: 'Sale',
          icon: <ShoppingCart size={16} className="text-emerald-500" />,
          title: sale.sale_code,
          subtitle: `${sale.customer?.name || 'Customer'} • LKR ${Number(sale.total_amount || 0).toLocaleString()} (${sale.payment_type})`,
          path: '/sales'
        }));

        (debts || []).forEach(d => results.push({
          type: 'Debt Record',
          icon: <DollarSign size={16} className="text-rose-500" />,
          title: `${d.customer?.name || 'Customer'} (${debtReference(d)})`,
          subtitle: `Outstanding: LKR ${Number(d.remaining_amount || 0).toLocaleString()} • Status: ${d.status}`,
          path: '/debts'
        }));

        (inventory || []).forEach(i => results.push({
          type: 'Stock Item',
          icon: <Package size={16} className="text-amber-500" />,
          title: `${i.code} (${i.type})`,
          subtitle: `Stock Qty: ${Number(i.quantity || 0).toLocaleString()} cubes • Price: LKR ${i.price_per_cube || 'N/A'}`,
          path: '/inventory'
        }));

        // The Cash Book has no single searchable text column (a description
        // lives on the ledger row, the name/category on the item), so this one
        // is matched in memory over a bounded recent slice.
        (expenses || []).forEach(a => {
          const itemName = a.expense_item?.name || '';
          const categoryName = a.expense_item?.category?.name || '';
          const description = a.ledger_row?.description || '';
          const code = a.expense_item?.expense_code || '';
          const haystack = `${itemName} ${categoryName} ${description} ${code}`.toLowerCase();
          if (!haystack.includes(lower)) return;
          results.push({
            type: 'Expense',
            icon: <Receipt size={16} className="text-orange-500" />,
            title: `${code || 'Expense'} — ${description || itemName || 'Cash Book entry'}`,
            subtitle: `${categoryName || 'Uncategorized'} • LKR ${Number(a.amount || 0).toLocaleString()} • ${a.ledger_row?.entry_date || ''}`,
            path: '/expenses'
          });
        });

        (notes || []).forEach(n => results.push({
          type: 'Note',
          icon: <StickyNote size={16} className="text-sky-500" />,
          title: n.note_text?.length > 60 ? `${n.note_text.slice(0, 60)}...` : n.note_text,
          subtitle: `By ${n.created_by} • ${new Date(n.created_at).toLocaleDateString()}`,
          path: '/notes'
        }));

        setSearchResults(results.slice(0, 25));
      } catch (err) {
        if (!cancelled) {
          console.error("Global search failed:", err);
          setSearchResults([]);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isOpen, query]);

  // Escape key listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // The palette carries no unsaved input, so tapping the dim area still
  // closes it — but only on a clean tap, never on a flick or a mis-tap that
  // began inside the results list.
  const backdropHandlers = useBackdropDismiss(onClose);

  if (!isOpen) return null;

  const handleSelectResult = (path) => {
    navigate(path);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-4 sm:pt-16 p-4 overflow-y-auto">
      {/* Backdrop */}
      <div
        aria-hidden="true"
        className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm transition-opacity"
        {...backdropHandlers}
      />

      {/* Search Modal Box */}
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in-50 zoom-in-95">
        {/* Input Bar */}
        <div className="flex items-center px-4 border-b border-slate-100 dark:border-slate-800">
          <Search size={20} className="text-slate-400 mr-3 flex-shrink-0" />
          <input
            type="text"
            autoFocus
            placeholder="Search customers, vehicles, sales, debts, stock..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full py-4 text-sm font-medium bg-transparent border-none text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="touch-target p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition mr-1 flex items-center justify-center"
            >
              <X size={18} />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="touch-target px-3 py-2 rounded-xl text-[11px] font-semibold uppercase tracking-wide bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition flex items-center justify-center"
          >
            Close
          </button>
        </div>

        {/* Results Box */}
        <div className="max-h-[55dvh] overflow-y-auto touch-scroll overscroll-contain p-2">
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
                  { name: 'Employees', path: '/employees' },
                  { name: 'Vehicles', path: '/vehicles' },
                  { name: 'Debt Ledger', path: '/debts' },
                  { name: 'Inventory', path: '/inventory' },
                  { name: 'Expenses', path: '/expenses' },
                  { name: 'Notes & Messages', path: '/notes' }
                ].map(chip => (
                  <button
                    key={chip.path}
                    onClick={() => handleSelectResult(chip.path)}
                    className="touch-target px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-navy-50 dark:hover:bg-sky-500/10 active:scale-95 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-navy-600 dark:hover:text-sky-400 transition"
                  >
                    {chip.name}
                  </button>
                ))}
              </div>
            </div>
          ) : query.trim().length < MIN_QUERY_LENGTH ? (
            <div className="p-8 text-center text-xs text-slate-400">
              Type at least {MIN_QUERY_LENGTH} characters to search.
            </div>
          ) : searchResults.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              No matching records found for "{query}".
            </div>
          ) : (
            <div className="space-y-1">
              {searchResults.map((item, idx) => (
                <button
                  type="button"
                  key={idx}
                  onClick={() => handleSelectResult(item.path)}
                  className="w-full text-left flex items-center justify-between gap-3 p-3.5 min-h-[56px] rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/60 active:bg-slate-100 dark:active:bg-slate-800 cursor-pointer transition"
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
                  <ArrowRight size={16} className="text-slate-400 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
