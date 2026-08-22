import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCustomers } from '../hooks/useCustomers';
import { useDebts } from '../hooks/useDebts';
import { useSales } from '../hooks/useSales';
import { useCustomerPayments } from '../hooks/useCustomerPayments';
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
  ArrowLeft, Edit2, Trash2, Table2, LineChart as LineChartIcon, FileDown, ExternalLink, DollarSign
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

const GRAPH_COLORS = { orders: '#ef4444', payments: '#22c55e' };
const PAYMENT_METHOD_LABELS = { cash: 'Cash', card: 'Card', bank_transfer: 'Bank Transfer', cheque: 'Cheque', other: 'Other' };

function money(n) {
  return `LKR ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function isWithinRange(isoStr, dateFrom, dateTo) {
  if (!isoStr) return false;
  const d = isoStr.slice(0, 10);
  if (dateFrom && d < dateFrom) return false;
  if (dateTo && d > dateTo) return false;
  return true;
}

export function CustomerProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const customerId = Number(id);

  const { customers, isLoading: customersLoading, updateCustomer, deleteCustomer } = useCustomers();
  const { debts, isLoading: debtsLoading } = useDebts();
  const { sales, isLoading: salesLoading } = useSales();
  const { payments, isLoading: paymentsLoading } = useCustomerPayments(customerId);
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

  // View / filter state
  const [viewMode, setViewMode] = useState('sales'); // 'sales' | 'payments' | 'graph'
  const [typeFilter, setTypeFilter] = useState('all'); // 'all' | 'debt' | 'cash'
  const [granularity, setGranularity] = useState('daily'); // 'daily' | 'monthly' | 'yearly' — graph bucket size
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Modal state
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [priceModalOpen, setPriceModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const filteredSales = useMemo(() => {
    return customerSales.filter(s =>
      (typeFilter === 'all' || s.payment_type === typeFilter) && isWithinRange(s.sale_date, dateFrom, dateTo)
    );
  }, [customerSales, typeFilter, dateFrom, dateTo]);

  const filteredPayments = useMemo(() => {
    // Settlements only ever exist against debt orders, so a "Cash Orders"
    // filter has no matches here — that's correct, not a bug.
    if (typeFilter === 'cash') return [];
    return payments.filter(p => isWithinRange(p.settlement_date, dateFrom, dateTo));
  }, [payments, typeFilter, dateFrom, dateTo]);

  const totalOrderAmount = filteredSales.reduce((sum, s) => sum + Number(s.total_amount || 0), 0);
  const totalPayments = filteredPayments.reduce((sum, p) => sum + Number(p.amount_paid || 0), 0);
  const totalOutstandingDebt = customerDebts.reduce((sum, d) => sum + Number(d.remaining_amount || 0), 0);

  // Graph data: buckets sized by the selected granularity (Daily/Monthly/Yearly)
  const graphData = useMemo(() => {
    let keyFn, labelFn;
    if (granularity === 'daily') {
      keyFn = (d) => d.toISOString().slice(0, 10);
      labelFn = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } else if (granularity === 'monthly') {
      keyFn = (d) => `${d.getFullYear()}-${d.getMonth()}`;
      labelFn = (d) => d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
    } else {
      keyFn = (d) => `${d.getFullYear()}`;
      labelFn = (d) => `${d.getFullYear()}`;
    }

    const buckets = new Map();
    const ensureBucket = (dateObj) => {
      const key = keyFn(dateObj);
      if (!buckets.has(key)) {
        buckets.set(key, { key, label: labelFn(dateObj), sortDate: dateObj, Orders: 0, Payments: 0 });
      }
      return buckets.get(key);
    };

    filteredSales.forEach(s => {
      ensureBucket(new Date(s.sale_date)).Orders += Number(s.total_amount || 0);
    });
    filteredPayments.forEach(p => {
      ensureBucket(new Date(p.settlement_date)).Payments += Number(p.amount_paid || 0);
    });

    return Array.from(buckets.values()).sort((a, b) => a.sortDate - b.sortDate);
  }, [filteredSales, filteredPayments, granularity]);

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
          headers={[
            { key: 'sale_code', label: 'Sale Code' },
            { key: 'debt_amount', label: 'Debt Amount' },
            { key: 'settled_amount', label: 'Settled Amount' },
            { key: 'date_added', label: 'Date Added' },
            { key: 'date_settled', label: 'Date Settled' },
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
                <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 font-mono text-navy-600 dark:text-navy-400">{debt.sale?.sale_code || '—'}</td>
                <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 font-mono">{money(debt.total_amount)}</td>
                <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 font-mono">{money(debt.paid_amount)}</td>
                <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 font-mono text-slate-500">{new Date(debt.created_at).toLocaleDateString()}</td>
                <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 font-mono text-slate-500">
                  {debt.status === 'settled' && lastSettlement ? new Date(lastSettlement.settlement_date).toLocaleDateString() : '—'}
                </td>
                <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5"><Badge type={debt.status} /></td>
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
            onClick={() => setViewMode('graph')}
            className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              viewMode === 'graph' ? 'bg-navy-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <LineChartIcon size={14} />
            <span>Graph View</span>
          </button>
        </div>

        {/* Filter Options */}
        <div className="flex flex-wrap items-center gap-2">
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
          {['daily', 'monthly', 'yearly'].map(opt => (
            <button
              key={opt}
              onClick={() => setGranularity(opt)}
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
        </div>

        {viewMode === 'sales' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-sm font-bold font-heading text-slate-800 dark:text-slate-100">Sales History</h3>
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                Total Order Amount (Cash + Debt Orders): {money(totalOrderAmount)}
              </span>
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
                      className="p-1.5 rounded-lg text-slate-500 hover:text-navy-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition min-w-[32px] min-h-[32px] flex items-center justify-center cursor-pointer"
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
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                Total Payments: {money(totalPayments)}
              </span>
            </div>
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
              data={filteredPayments}
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
                    {PAYMENT_METHOD_LABELS[payment.payment_method] || 'Cash'}
                  </td>
                  <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5">
                    <button
                      onClick={() => handleViewPayment(payment)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-navy-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition min-w-[32px] min-h-[32px] flex items-center justify-center cursor-pointer"
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
