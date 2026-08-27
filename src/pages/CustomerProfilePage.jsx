import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCustomers } from '../hooks/useCustomers';
import { useDebts } from '../hooks/useDebts';
import { useSales } from '../hooks/useSales';
import { useCustomerPayments } from '../hooks/useCustomerPayments';
import { useCustomerCheques } from '../hooks/useCustomerCheques';
import { useNotifications } from '../hooks/useNotifications';
import { useCustomerPrices } from '../hooks/useCustomerPrices';
import { useInventory } from '../hooks/useInventory';
import { useSettings } from '../hooks/useSettings';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { Table } from '../components/Table';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { CustomerFormModal } from '../components/CustomerFormModal';
import { CustomerPriceModal } from '../components/CustomerPriceModal';
import { generateBillPDF } from '../utils/pdfGenerator';
import {
  ArrowLeft, Edit2, Trash2, Table2, LineChart as LineChartIcon, FileDown, ExternalLink, DollarSign, Send
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { toLocalDateStr, isWithinLocalRange } from '../utils/date';
import { isCustomerPayment } from '../utils/cashBankMath';

const GRAPH_COLORS = { orders: '#ef4444', payments: '#22c55e', autoApplied: '#94a3b8' };
const PAYMENT_METHOD_LABELS = { cash: 'Cash', card: 'Card', bank_transfer: 'Bank Transfer', cheque: 'Cheque', other: 'Other' };

function money(n) {
  return `LKR ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function CustomerProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const customerId = Number(id);

  const { customers, isLoading: customersLoading, updateCustomer, deleteCustomer } = useCustomers();
  const { debts, isLoading: debtsLoading } = useDebts();
  const { sales, isLoading: salesLoading } = useSales();
  const { payments, isLoading: paymentsLoading, error: paymentsError } = useCustomerPayments(customerId);
  const { cheques, isLoading: chequesLoading } = useCustomerCheques(customerId);
  const { notifications, isLoading: notificationsLoading } = useNotifications({ customerId });
  const { customerPrices, setCustomPrice, clearCustomPrice } = useCustomerPrices();
  const { inventory } = useInventory();
  const { settings } = useSettings();
  const { isAdmin } = useAuth();
  const toast = useToast();

  const inventoryDefaults = useMemo(() => {
    const mfc = inventory?.find(i => i.type === 'manufactured');
    const rsc = inventory?.find(i => i.type === 'resell');
    return { MFC: mfc?.price_per_cube || 0, RSC: rsc?.price_per_cube || 0 };
  }, [inventory]);

  const customer = useMemo(() => customers.find(c => Number(c.id) === customerId), [customers, customerId]);
  const customerDebts = useMemo(() => debts.filter(d => Number(d.customer_id) === customerId), [debts, customerId]);
  const customerSales = useMemo(() => sales.filter(s => Number(s.customer_id) === customerId), [sales, customerId]);

  // Lifetime summary cards — unfiltered totals across this customer's full history
  const totalSalesAmount = useMemo(() => customerSales.reduce((sum, s) => sum + Number(s.total_amount || 0), 0), [customerSales]);
  const totalCashSalesAmount = useMemo(() => customerSales.filter(s => s.payment_type === 'cash').reduce((sum, s) => sum + Number(s.total_amount || 0), 0), [customerSales]);
  const totalDebtSalesAmount = useMemo(() => customerSales.filter(s => s.payment_type === 'debt').reduce((sum, s) => sum + Number(s.total_amount || 0), 0), [customerSales]);

  // View / filter state
  const [viewMode, setViewMode] = useState('sales'); // 'sales' | 'payments' | 'cheques' | 'notifications' | 'graph'
  const [typeFilter, setTypeFilter] = useState('all'); // 'all' | 'debt' | 'cash'
  const [granularity, setGranularity] = useState('daily'); // 'daily' | 'monthly' | 'yearly' — graph bucket size
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Modal state
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [priceModalOpen, setPriceModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Daily/Monthly/Yearly sets both the bucket size AND a matching lookback
  // window wide enough to actually show several buckets — "just today" (or
  // "just this month"/"just this year") collapsed the window to exactly one
  // bucket of its own granularity, so the graph could never draw more than a
  // single point no matter which of the three was picked, and the list tabs
  // often came back empty for a customer with no activity that exact day.
  // That's what made the buttons look broken/ineffective.
  const applyPeriod = (period) => {
    setGranularity(period);
    const today = new Date();
    if (period === 'daily') {
      // Last 30 days, bucketed by day.
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);
      setDateFrom(toLocalDateStr(start));
      setDateTo(toLocalDateStr(today));
    } else if (period === 'monthly') {
      // Last 12 months, bucketed by month.
      const start = new Date(today.getFullYear(), today.getMonth() - 11, 1);
      setDateFrom(toLocalDateStr(start));
      setDateTo(toLocalDateStr(today));
    } else {
      // Last 5 years, bucketed by year.
      const start = new Date(today.getFullYear() - 4, 0, 1);
      setDateFrom(toLocalDateStr(start));
      setDateTo(toLocalDateStr(today));
    }
  };

  const clearFilters = () => {
    setTypeFilter('all');
    setGranularity('daily');
    setDateFrom('');
    setDateTo('');
  };

  const filteredSales = useMemo(() => {
    return customerSales.filter(s =>
      (typeFilter === 'all' || s.payment_type === typeFilter) && isWithinLocalRange(s.sale_date, dateFrom, dateTo)
    );
  }, [customerSales, typeFilter, dateFrom, dateTo]);

  // Money this customer actually handed over. An auto-applied settlement is
  // the system offsetting one of their cash orders against an older debt —
  // counting it as a payment showed a large "Total Payments" figure for a
  // customer who only ever pays cash at the counter, representing money they
  // never paid twice.
  const filteredPayments = useMemo(() => {
    // Settlements only ever exist against debt orders, so a "Cash Orders"
    // filter has no matches here — that's correct, not a bug.
    if (typeFilter === 'cash') return [];
    return payments.filter(p =>
      isCustomerPayment(p) && isWithinLocalRange(p.settlement_date, dateFrom, dateTo)
    );
  }, [payments, typeFilter, dateFrom, dateTo]);

  // The same debt reductions, kept visible as their own neutral series so the
  // customer's history still explains why a balance dropped — the pattern
  // useCashBank's history entries already use.
  const filteredAutoApplied = useMemo(() => {
    if (typeFilter === 'cash') return [];
    return payments.filter(p =>
      !isCustomerPayment(p) && isWithinLocalRange(p.settlement_date, dateFrom, dateTo)
    );
  }, [payments, typeFilter, dateFrom, dateTo]);

  // Cheques aren't tagged cash/debt — a cheque can be received against a debt
  // settlement OR logged independently via Cash & Bank with no link to any
  // order at all (cheque_records.settlement_id is nullable), so there's no
  // reliable signal to sort them into "Cash Orders" / "Debt Orders" by. Only
  // the date range applies here; the type filter buttons are hidden for this
  // tab below rather than guessing at a rule the data doesn't support.
  const filteredCheques = useMemo(() => {
    return cheques.filter(c => isWithinLocalRange(c.received_at, dateFrom, dateTo));
  }, [cheques, dateFrom, dateTo]);

  // Unlike cheques, a notification CAN be reliably tied to cash/debt: a
  // 'debt_settlement' receipt is always debt-related (same fact the Payments
  // filter above relies on), and a 'sale_invoice' notification's reference
  // code is that sale's own sale_code, so its payment_type is looked up
  // directly rather than guessed.
  const saleByCode = useMemo(() => {
    const map = new Map();
    customerSales.forEach(s => map.set(s.sale_code, s));
    return map;
  }, [customerSales]);

  const filteredNotifications = useMemo(() => {
    return notifications.filter(n => {
      if (!isWithinLocalRange(n.sent_at, dateFrom, dateTo)) return false;
      if (typeFilter === 'all') return true;
      if (n.notification_type === 'debt_settlement') return typeFilter === 'debt';
      const sale = saleByCode.get(n.reference_code);
      // No matching sale on record (e.g. a since-deleted order) — don't hide
      // it behind a filter it can't be verified against either way.
      if (!sale) return true;
      return sale.payment_type === typeFilter;
    });
  }, [notifications, dateFrom, dateTo, typeFilter, saleByCode]);

  // The ledger the Payments tab lists: real payments plus the system's own
  // debt offsets, so nothing disappears from the customer's history — but the
  // offsets are labelled, and totalPayments below still counts only what the
  // customer actually handed over.
  const paymentLedgerRows = useMemo(
    () => [...filteredPayments, ...filteredAutoApplied]
      .sort((a, b) => new Date(b.settlement_date) - new Date(a.settlement_date)),
    [filteredPayments, filteredAutoApplied]
  );

  const totalOrderAmount = filteredSales.reduce((sum, s) => sum + Number(s.total_amount || 0), 0);
  const totalPayments = filteredPayments.reduce((sum, p) => sum + Number(p.amount_paid || 0), 0);
  const totalOutstandingDebt = customerDebts.reduce((sum, d) => sum + Number(d.remaining_amount || 0), 0);

  // Graph data: one bucket per day/month/year across the active window,
  // sized by the selected granularity (Daily/Monthly/Yearly). Buckets are
  // pre-filled with zero across the WHOLE window and only then topped up
  // from real transactions — a day/month/year with no activity still gets a
  // point on the line (sitting at 0) instead of being skipped entirely.
  // Skipping empty buckets was the actual bug behind both symptoms reported:
  // with sparse data, most windows produced only one populated bucket, which
  // recharts can only render as a single floating dot (a line needs 2+
  // points to draw a segment) — so the chart looked broken, and switching
  // Daily/Monthly/Yearly still produced the same "one dot" result every
  // time, which read as the filter buttons doing nothing.
  const graphData = useMemo(() => {
    let stepUnit, keyFn, labelFn;
    if (granularity === 'daily') {
      stepUnit = 'day';
      keyFn = (d) => toLocalDateStr(d);
      labelFn = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } else if (granularity === 'monthly') {
      stepUnit = 'month';
      keyFn = (d) => `${d.getFullYear()}-${d.getMonth()}`;
      labelFn = (d) => d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
    } else {
      stepUnit = 'year';
      keyFn = (d) => `${d.getFullYear()}`;
      labelFn = (d) => `${d.getFullYear()}`;
    }

    // The window to fill: the active date filter if one is set (always true
    // once Daily/Monthly/Yearly or a manual date has been picked); otherwise
    // fall back to the actual span of this customer's own records, so a
    // fresh, unfiltered profile still shows a real trend instead of nothing.
    let start = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    let end = dateTo ? new Date(`${dateTo}T00:00:00`) : null;
    if (!start || !end) {
      const allDates = [
        ...customerSales.map(s => new Date(s.sale_date)),
        ...payments.map(p => new Date(p.settlement_date))
      ].filter(d => !isNaN(d.getTime()));
      if (allDates.length === 0) return [];
      const minD = new Date(Math.min(...allDates));
      const maxD = new Date(Math.max(...allDates));
      if (!start) start = new Date(minD.getFullYear(), minD.getMonth(), minD.getDate());
      if (!end) end = new Date(maxD.getFullYear(), maxD.getMonth(), maxD.getDate());
    }

    // Pre-fill every step from start to end. Capped as a safety net against
    // an extreme manually-picked range (e.g. daily buckets over a decade) —
    // not a limit that applies to the normal preset windows above.
    const buckets = new Map();
    const cursor = new Date(start);
    let guard = 0;
    while (cursor <= end && guard < 500) {
      const key = keyFn(cursor);
      if (!buckets.has(key)) {
        buckets.set(key, { key, label: labelFn(cursor), sortDate: new Date(cursor), Orders: 0, Payments: 0, 'Applied from cash order': 0 });
      }
      if (stepUnit === 'day') cursor.setDate(cursor.getDate() + 1);
      else if (stepUnit === 'month') cursor.setMonth(cursor.getMonth() + 1);
      else cursor.setFullYear(cursor.getFullYear() + 1);
      guard++;
    }

    const ensureBucket = (dateObj) => {
      const key = keyFn(dateObj);
      if (!buckets.has(key)) {
        buckets.set(key, { key, label: labelFn(dateObj), sortDate: dateObj, Orders: 0, Payments: 0, 'Applied from cash order': 0 });
      }
      return buckets.get(key);
    };

    filteredSales.forEach(s => {
      ensureBucket(new Date(s.sale_date)).Orders += Number(s.total_amount || 0);
    });
    filteredPayments.forEach(p => {
      ensureBucket(new Date(p.settlement_date)).Payments += Number(p.amount_paid || 0);
    });
    // Charted separately, never as a Payment: line 1 already drew this money
    // as an Order on the same date, so adding it to Payments too made one
    // transaction draw two bars and doubled the customer's apparent turnover.
    filteredAutoApplied.forEach(p => {
      ensureBucket(new Date(p.settlement_date))['Applied from cash order'] += Number(p.amount_paid || 0);
    });

    return Array.from(buckets.values()).sort((a, b) => a.sortDate - b.sortDate);
  }, [filteredSales, filteredPayments, filteredAutoApplied, granularity, dateFrom, dateTo, customerSales, payments]);

  const handleViewSale = (sale) => {
    const doc = generateBillPDF(sale, settings);
    doc.save(`${sale.sale_code}_invoice.pdf`);
  };

  const handleViewPayment = (payment) => {
    if (payment.bill_pdf_url) {
      window.open(payment.bill_pdf_url, '_blank', 'noopener,noreferrer');
    } else {
      toast.info('No PDF receipt available for this payment.');
    }
  };

  const handleSaved = ({ mode, name, error }) => {
    if (mode === 'error') {
      toast.error(error);
    } else {
      toast.success(`Successfully updated customer: ${name}`);
    }
  };

  const handlePricesSaved = ({ mode, name, error }) => {
    if (mode === 'error') {
      toast.error(error);
    } else {
      toast.success(`Custom cube prices updated for ${name}`);
    }
  };

  const handleConfirmDelete = async () => {
    setActionLoading(true);
    try {
      await deleteCustomer(customerId);
      toast.success("Customer removed successfully");
      navigate('/customers');
    } catch (err) {
      toast.error(err.message || "Failed to delete customer");
    } finally {
      setActionLoading(false);
      setDeleteOpen(false);
    }
  };

  if (customersLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-24 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl" />
        <div className="h-40 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="text-center py-16 space-y-4">
        <p className="text-sm text-slate-500">Customer not found.</p>
        <Button variant="secondary" onClick={() => navigate('/customers')} className="mx-auto flex items-center space-x-1.5">
          <ArrowLeft size={14} />
          <span>Back to Customers</span>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Back link */}
      <button
        onClick={() => navigate('/customers')}
        className="flex items-center space-x-1.5 text-xs font-semibold text-slate-500 hover:text-navy-600 dark:hover:text-navy-400 transition cursor-pointer"
      >
        <ArrowLeft size={14} />
        <span>Back to Customers</span>
      </button>

      {/* Customer Details Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <span className="text-[11px] font-mono font-semibold text-navy-600 dark:text-navy-400">{customer.customer_code}</span>
            <h2 className="text-base sm:text-lg font-bold font-heading text-slate-900 dark:text-slate-100 flex items-center space-x-1.5">
              <span>{customer.name}</span>
              {customer.is_branch && (
                <span
                  title="Branch customer — managed in Settings"
                  className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-600 text-white text-[9px] font-bold shrink-0"
                >
                  B
                </span>
              )}
            </h2>
          </div>
          {isAdmin ? (
            <div className="flex items-center space-x-2">
              <Button variant="secondary" size="sm" onClick={() => setPriceModalOpen(true)} className="flex items-center space-x-1.5">
                <DollarSign size={14} />
                <span>Custom Prices</span>
              </Button>
              {customer.is_branch ? (
                <span className="text-xs text-slate-400 font-medium" title="Branch customers are edited/deleted from Settings → Set Branch">
                  Managed in Settings
                </span>
              ) : (
                <>
                  <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)} className="flex items-center space-x-1.5">
                    <Edit2 size={14} />
                    <span>Edit</span>
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)} className="flex items-center space-x-1.5">
                    <Trash2 size={14} />
                    <span>Delete</span>
                  </Button>
                </>
              )}
            </div>
          ) : (
            <span className="text-xs text-slate-400 font-medium">Read Only</span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 mt-4 text-xs sm:text-sm">
          <div className="flex justify-between sm:block">
            <span className="text-slate-400">Whatsapp No</span>
            <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 sm:block sm:mt-0.5">{customer.whatsapp_number || '—'}</span>
          </div>
          <div className="flex justify-between sm:block">
            <span className="text-slate-400">Contact No</span>
            <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 sm:block sm:mt-0.5">{customer.contact_number || '—'}</span>
          </div>
          <div className="flex justify-between sm:block sm:col-span-2">
            <span className="text-slate-400">Address</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200 sm:block sm:mt-0.5">{customer.address || '—'}</span>
          </div>
        </div>
      </div>

      {/* Lifetime Summary Cards. The sales-value totals are takings figures,
          so a non-admin sees only what they need to service the account:
          how much this customer still owes. */}
      <div className={`grid gap-2.5 sm:gap-3 ${isAdmin ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-1'}`}>
        {isAdmin && (
          <>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-xs">
            <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide block truncate">Total Sales</span>
            <span className="text-sm font-bold font-mono text-slate-900 dark:text-slate-100 block mt-0.5 truncate">{money(totalSalesAmount)}</span>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-xs">
            <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide block truncate">Total Cash Sales</span>
            <span className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400 block mt-0.5 truncate">{money(totalCashSalesAmount)}</span>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-xs">
            <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide block truncate">Total Debt Sales</span>
            <span className="text-sm font-bold font-mono text-amber-600 dark:text-amber-400 block mt-0.5 truncate">{money(totalDebtSalesAmount)}</span>
          </div>
          </>
        )}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-xs">
          <span className="text-[10px] font-semibold text-rose-600 dark:text-rose-400 uppercase tracking-wide block truncate">Remaining Debt</span>
          <span className="text-sm font-bold font-mono text-rose-600 dark:text-rose-400 block mt-0.5 truncate">{money(totalOutstandingDebt)}</span>
        </div>
      </div>

      {/* Debt Details */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-bold font-heading text-slate-800 dark:text-slate-100">Debt Details</h3>
          <span className="text-xs font-bold text-rose-600 dark:text-rose-400">
            Outstanding: {money(totalOutstandingDebt)}
          </span>
        </div>
        <Table
          enablePagination={false}
          compact
          headers={[
            { key: 'sale_code', label: 'Sale Code' },
            { key: 'debt_amount', label: 'Debt Amount' },
            { key: 'settled_amount', label: 'Settled Amount' },
            { key: 'date_added', label: 'Date Added' },
            { key: 'date_settled', label: 'Date Settled' },
            { key: 'remaining_debt', label: 'Remaining Debt' },
            { key: 'status', label: 'Status' }
          ]}
          data={customerDebts}
          isLoading={debtsLoading}
          emptyMessage="No debt records for this customer."
          renderRow={(debt) => {
            const lastSettlement = payments
              .filter(p => Number(p.debt_id) === Number(debt.id))
              .sort((a, b) => new Date(b.settlement_date) - new Date(a.settlement_date))[0];
            return (
              <tr key={debt.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 border-b border-slate-100 dark:border-slate-800">
                <td className="px-2 sm:px-3 py-2 font-mono text-navy-600 dark:text-navy-400">{debt.sale?.sale_code || '—'}</td>
                <td className="px-2 sm:px-3 py-2 font-mono">{money(debt.total_amount)}</td>
                <td className="px-2 sm:px-3 py-2 font-mono">{money(debt.paid_amount)}</td>
                <td className="px-2 sm:px-3 py-2 font-mono text-slate-500">{new Date(debt.created_at).toLocaleDateString()}</td>
                <td className="px-2 sm:px-3 py-2 font-mono text-slate-500">
                  {debt.status === 'settled' && lastSettlement ? new Date(lastSettlement.settlement_date).toLocaleDateString() : '—'}
                </td>
                <td className="px-2 sm:px-3 py-2 font-mono text-rose-600 dark:text-rose-400">{money(debt.remaining_amount)}</td>
                <td className="px-2 sm:px-3 py-2"><Badge type={debt.status} /></td>
              </tr>
            );
          }}
        />
      </div>

      {/* Sales History / Payment History / Graph View */}
      <div className="space-y-3">
        <div className="flex items-center space-x-1 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700 w-fit">
          <button
            onClick={() => setViewMode('sales')}
            className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              viewMode === 'sales' ? 'bg-navy-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Table2 size={14} />
            <span>Sales History</span>
          </button>
          <button
            onClick={() => setViewMode('payments')}
            className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              viewMode === 'payments' ? 'bg-navy-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Table2 size={14} />
            <span>Payment History</span>
          </button>
          <button
            onClick={() => setViewMode('cheques')}
            className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              viewMode === 'cheques' ? 'bg-navy-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Table2 size={14} />
            <span>Cheques ({cheques.length})</span>
          </button>
          <button
            onClick={() => setViewMode('notifications')}
            className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              viewMode === 'notifications' ? 'bg-navy-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Send size={14} />
            <span>Notifications ({notifications.length})</span>
          </button>
          <button
            onClick={() => setViewMode('graph')}
            className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              viewMode === 'graph' ? 'bg-navy-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <LineChartIcon size={14} />
            <span>Graph View</span>
          </button>
        </div>

        {/* Filter Options — Cash/Debt Orders is hidden on the Cheques tab:
            a cheque isn't reliably one or the other (see filteredCheques),
            so showing a filter that can't actually narrow anything there
            would be exactly the "looks broken" problem this fixes. */}
        <div className="flex flex-wrap items-center gap-2">
          {viewMode !== 'cheques' && (
            <>
              {['all', 'debt', 'cash'].map(opt => (
                <button
                  key={opt}
                  onClick={() => setTypeFilter(opt)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
                    typeFilter === opt
                      ? 'bg-navy-600 text-white border-navy-600 shadow-xs'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {opt === 'all' ? 'All' : opt === 'debt' ? 'Debt Orders' : 'Cash Orders'}
                </button>
              ))}
              <span className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-0.5" />
            </>
          )}
          {['daily', 'monthly', 'yearly'].map(opt => (
            <button
              key={opt}
              onClick={() => applyPeriod(opt)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
                granularity === opt
                  ? 'bg-navy-600 text-white border-navy-600 shadow-xs'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
              }`}
            >
              {opt === 'daily' ? 'Daily' : opt === 'monthly' ? 'Monthly' : 'Yearly'}
            </button>
          ))}
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 focus:outline-none"
          />
          <span className="text-xs text-slate-400">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 focus:outline-none"
          />
          {(typeFilter !== 'all' || dateFrom || dateTo) && (
            <button
              onClick={clearFilters}
              className="px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-navy-600 dark:hover:text-navy-400 transition"
            >
              Clear Filters
            </button>
          )}
        </div>

        {viewMode === 'sales' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-sm font-bold font-heading text-slate-800 dark:text-slate-100">Sales History</h3>
              {isAdmin && (
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  Total Order Amount (Cash + Debt Orders): {money(totalOrderAmount)}
                </span>
              )}
            </div>
            <Table
              enablePagination={false}
              headers={[
                { key: 'sale_code', label: 'Sale Code' },
                { key: 'amount', label: 'Amount' },
                { key: 'date_placed', label: 'Date Placed' },
                { key: 'type', label: 'Type' },
                { key: 'actions', label: 'View', sortable: false }
              ]}
              data={filteredSales}
              isLoading={salesLoading}
              emptyMessage="No sales found for the selected filters."
              renderRow={(sale) => (
                <tr key={sale.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 border-b border-slate-100 dark:border-slate-800">
                  <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 font-mono text-navy-600 dark:text-navy-400">{sale.sale_code}</td>
                  <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 font-mono">{money(sale.total_amount)}</td>
                  <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 font-mono text-slate-500">{new Date(sale.sale_date).toLocaleDateString()}</td>
                  <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5"><Badge type={sale.payment_type} /></td>
                  <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5">
                    <button
                      onClick={() => handleViewSale(sale)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-navy-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition active:scale-95 touch-target flex items-center justify-center cursor-pointer"
                      title="View Sale (download bill PDF)"
                    >
                      <FileDown size={15} />
                    </button>
                  </td>
                </tr>
              )}
            />
          </div>
        )}

        {viewMode === 'payments' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-sm font-bold font-heading text-slate-800 dark:text-slate-100">Payment History</h3>
              {isAdmin && (
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  Total Payments: {money(totalPayments)}
                </span>
              )}
            </div>
            {paymentsError && (
              <p className="text-xs font-medium text-rose-600 dark:text-rose-400">
                Couldn't load payment history: {paymentsError}
              </p>
            )}
            <Table
              enablePagination={false}
              headers={[
                { key: 'id', label: 'Payment ID' },
                { key: 'amount', label: 'Amount' },
                { key: 'date_placed', label: 'Date Placed' },
                { key: 'payment_date', label: 'Payment Date' },
                { key: 'method', label: 'Payment Method' },
                { key: 'actions', label: 'View', sortable: false }
              ]}
              data={paymentLedgerRows}
              isLoading={paymentsLoading}
              emptyMessage="No payments found for the selected filters."
              renderRow={(payment) => (
                <tr key={payment.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 border-b border-slate-100 dark:border-slate-800">
                  <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 font-mono text-navy-600 dark:text-navy-400">#{payment.id}</td>
                  <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 font-mono">{money(payment.amount_paid)}</td>
                  <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 font-mono text-slate-500">
                    {payment.debt?.sale?.sale_date ? new Date(payment.debt.sale.sale_date).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 font-mono text-slate-500">{new Date(payment.settlement_date).toLocaleDateString()}</td>
                  <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 text-slate-600 dark:text-slate-300">
                    {payment.is_auto_applied
                      ? <span className="text-slate-400">Applied from cash order</span>
                      : (PAYMENT_METHOD_LABELS[payment.payment_method] || 'Cash')}
                  </td>
                  <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5">
                    <button
                      onClick={() => handleViewPayment(payment)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-navy-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition active:scale-95 touch-target flex items-center justify-center cursor-pointer"
                      title="View Payment Receipt"
                    >
                      <ExternalLink size={15} />
                    </button>
                  </td>
                </tr>
              )}
            />
          </div>
        )}

        {viewMode === 'cheques' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-sm font-bold font-heading text-slate-800 dark:text-slate-100">Cheques Received</h3>
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                On hand: {money(cheques.filter(c => c.status === 'pending').reduce((sum, c) => sum + Number(c.amount || 0), 0))}
              </span>
            </div>
            <Table
              enablePagination={false}
              headers={[
                { key: 'cheque_no', label: 'Cheque No' },
                { key: 'bank_name', label: 'Bank' },
                { key: 'payer_name', label: 'Name on Cheque' },
                { key: 'received_at', label: 'Received' },
                { key: 'amount', label: 'Amount' },
                { key: 'status', label: 'Status' }
              ]}
              data={filteredCheques}
              isLoading={chequesLoading}
              emptyMessage="No cheques recorded for the selected filters."
              renderRow={(cheque) => (
                <tr key={cheque.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 border-b border-slate-100 dark:border-slate-800">
                  <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 font-mono text-navy-600 dark:text-navy-400">{cheque.cheque_no}</td>
                  <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 text-slate-600 dark:text-slate-300">{cheque.bank_name}</td>
                  <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 text-slate-600 dark:text-slate-300">{cheque.payer_name}</td>
                  <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 font-mono text-slate-500">{new Date(cheque.received_at).toLocaleDateString()}</td>
                  <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 font-mono font-semibold text-amber-600 dark:text-amber-400">{money(cheque.amount)}</td>
                  <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                      cheque.status === 'pending'
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                    }`}>
                      {cheque.status === 'pending' ? 'In Hand' : 'Deposited'}
                    </span>
                  </td>
                </tr>
              )}
            />
          </div>
        )}

        {viewMode === 'notifications' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs p-4 sm:p-5 space-y-3">
            <h3 className="text-sm font-bold font-heading text-slate-800 dark:text-slate-100">Notifications Sent</h3>
            <p className="text-[11px] text-slate-400">
              Every invoice and settlement receipt dispatched to this customer, with the exact message they were sent.
            </p>
            <Table
              enablePagination={false}
              headers={[
                { key: 'sent_at', label: 'Sent' },
                { key: 'notification_type', label: 'Type' },
                { key: 'channel', label: 'Channel' },
                { key: 'reference_code', label: 'Reference' },
                { key: 'recipient_phone', label: 'To' },
                { key: 'amount', label: 'Amount' },
                { key: 'sent_by', label: 'Sent By' }
              ]}
              data={filteredNotifications}
              isLoading={notificationsLoading}
              emptyMessage="No notifications found for the selected filters."
              renderRow={(note) => (
                <tr key={note.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 border-b border-slate-100 dark:border-slate-800 align-top">
                  <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 font-mono text-slate-500 whitespace-nowrap">{new Date(note.sent_at).toLocaleString()}</td>
                  <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300">
                      {note.notification_type === 'sale_invoice' ? 'Invoice' : 'Receipt'}
                    </span>
                    <span className="block text-[10px] text-slate-400 mt-1 max-w-[260px] whitespace-pre-wrap line-clamp-3" title={note.message}>
                      {note.message}
                    </span>
                  </td>
                  <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                      (note.channel || 'whatsapp') === 'sms'
                        ? 'bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300'
                        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                    }`}>
                      {note.channel === 'sms' ? 'SMS' : 'WhatsApp'}
                    </span>
                  </td>
                  <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 font-mono text-navy-600 dark:text-navy-400">{note.reference_code || '—'}</td>
                  <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 font-mono text-slate-500">{note.recipient_phone || '—'}</td>
                  <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 font-mono">{note.amount == null ? '—' : money(note.amount)}</td>
                  <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 text-slate-600 dark:text-slate-300">{note.sent_by}</td>
                </tr>
              )}
            />
          </div>
        )}

        {viewMode === 'graph' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold font-heading text-slate-800 dark:text-slate-100">Orders vs Payments</h3>
              <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 capitalize">
                {granularity} view
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
                    label={{ value: 'Amount (LKR)', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#94a3b8' }}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)', fontSize: '11px' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Line type="monotone" dataKey="Orders" name="Orders Placed" stroke={GRAPH_COLORS.orders} strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="Payments" name="Payments Done" stroke={GRAPH_COLORS.payments} strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
                  {/* Neutral third series: a debt reduction funded by one of
                      this customer's own cash orders. Real, but not a payment
                      they made — the order is already drawn above. */}
                  <Line type="monotone" dataKey="Applied from cash order" name="Applied from Cash Order" stroke={GRAPH_COLORS.autoApplied} strokeWidth={2} strokeDasharray="4 3" dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Edit Customer Modal */}
      <CustomerFormModal
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        editingCustomer={customer}
        updateCustomer={updateCustomer}
        onSaved={handleSaved}
      />

      {/* Custom Cube Prices Modal */}
      <CustomerPriceModal
        isOpen={priceModalOpen}
        onClose={() => setPriceModalOpen(false)}
        customer={customer}
        customerPrices={customerPrices}
        inventoryDefaults={inventoryDefaults}
        setCustomPrice={setCustomPrice}
        clearCustomPrice={clearCustomPrice}
        onSaved={handlePricesSaved}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Remove Customer?"
        message="Deleting this customer will remove them from the system database permanently. Please confirm you want to proceed."
        confirmLabel="Confirm Delete"
        isLoading={actionLoading}
      />

    </div>
  );
}
