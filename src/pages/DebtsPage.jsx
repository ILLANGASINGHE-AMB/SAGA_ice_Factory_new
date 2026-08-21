import React, { useState, useMemo } from 'react';
import { useDebts } from '../hooks/useDebts';
import { useSettings } from '../hooks/useSettings';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { Table } from '../components/Table';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Input, Select, TextArea } from '../components/FormFields';
import { generateSettlementReceiptPDF, generateBillPDF } from '../utils/pdfGenerator';
import { DollarSign, RefreshCcw, FileDown, Users, History } from 'lucide-react';

export function DebtsPage() {
  const { debts, isLoading, settleCustomerDebt } = useDebts();
  const { settings } = useSettings();
  const { user } = useAuth();
  const toast = useToast();

  // Overview mode: 'byCustomer' (grouped debtors ledger) or 'history' (per-sale debt ledger)
  const [viewMode, setViewMode] = useState('byCustomer');

  // Filters state
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'pending', 'partial', 'settled'
  const [searchQuery, setSearchQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [agingFilter, setAgingFilter] = useState('all');

  // Settlement modal state
  const [settleModalOpen, setSettleModalOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [settlementNote, setSettlementNote] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Settlement receipt preview modal state (generated, not auto-downloaded)
  const [receiptPreviewOpen, setReceiptPreviewOpen] = useState(false);
  const [receiptPdfUrl, setReceiptPdfUrl] = useState(null);
  const [settlementReceiptRecord, setSettlementReceiptRecord] = useState(null);

  // Debt History bill preview modal state
  const [billPreviewOpen, setBillPreviewOpen] = useState(false);
  const [billPdfUrl, setBillPdfUrl] = useState(null);
  const [billDebt, setBillDebt] = useState(null);

  // WhatsApp Prompt State
  const [whatsappPromptOpen, setWhatsappPromptOpen] = useState(false);

  // Calculate live preview remaining amount in modal
  const remainingPreview = useMemo(() => {
    if (!selectedGroup) return 0;
    const pay = parseFloat(paymentAmount) || 0;
    return Math.max(0, selectedGroup.total_debt - pay);
  }, [selectedGroup, paymentAmount]);

  const openSettleModal = (group) => {
    setSelectedGroup(group);
    setPaymentAmount('');
    setPaymentMethod('cash');
    setSettlementNote('');
    setSettleModalOpen(true);
  };

  const closeSettleModal = () => {
    setSettleModalOpen(false);
    setSelectedGroup(null);
    setPaymentAmount('');
    setPaymentMethod('cash');
    setSettlementNote('');
  };

  // Submit Settle Debt (applied FIFO across the customer's oldest debts)
  const handleConfirmSettlement = async (e) => {
    e.preventDefault();
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid positive payment amount");
      return;
    }
    if (amount > selectedGroup.total_debt) {
      toast.error(`Payment amount exceeds total debt (LKR ${selectedGroup.total_debt.toLocaleString()})`);
      return;
    }

    setActionLoading(true);
    try {
      const result = await settleCustomerDebt(
        selectedGroup.customer_id,
        amount,
        user?.fullName || 'Staff Operator',
        paymentMethod,
        settlementNote.trim() || null
      );

      // Generate the receipt PDF and show it in-app for preview — download is
      // an explicit user action from the preview modal, not automatic.
      const receiptDoc = generateSettlementReceiptPDF(result, settings);
      const blobUrl = receiptDoc.output('bloburl');
      setReceiptPdfUrl(blobUrl);
      setSettlementReceiptRecord(result);

      toast.success(`Settlement recorded! Code: ${result.settlement_code}`);
      closeSettleModal();
      setReceiptPreviewOpen(true);
    } catch (err) {
      toast.error(err.message || "Failed to settle debt");
    } finally {
      setActionLoading(false);
    }
  };

  const downloadReceipt = () => {
    if (!settlementReceiptRecord) return;
    const doc = generateSettlementReceiptPDF(settlementReceiptRecord, settings);
    doc.save(`${settlementReceiptRecord.settlement_code}_receipt.pdf`);
  };

  const closeReceiptPreview = () => {
    if (receiptPdfUrl) URL.revokeObjectURL(receiptPdfUrl);
    setReceiptPreviewOpen(false);
    setReceiptPdfUrl(null);
    setWhatsappPromptOpen(true); // Chain into the WhatsApp prompt
  };

  // Send receipt notification via WhatsApp
  const handleSendWhatsAppReceipt = () => {
    if (!settlementReceiptRecord) return;
    const phone = settlementReceiptRecord.customer?.whatsapp_number || settlementReceiptRecord.customer?.contact_number;
    const name = settlementReceiptRecord.customer?.name;
    const saleRef = settlementReceiptRecord.settlements?.length
      ? settlementReceiptRecord.settlements.map(s => s.sale_code).filter(Boolean).join(', ')
      : (settlementReceiptRecord.sale?.sale_code || 'N/A');
    const amount = settlementReceiptRecord.amount_paid;
    const remaining = settlementReceiptRecord.remaining_amount;

    if (!phone) {
      toast.error("This customer has no WhatsApp number on file — can't send a notification.");
      setWhatsappPromptOpen(false);
      setSettlementReceiptRecord(null);
      return;
    }

    const mockPDFURL = `https://sagaciouscube.com/receipt/${settlementReceiptRecord.settlement_code}`;
    const text = `Hello ${name}, your settlement receipt for ${saleRef} is ready. Amount Paid: LKR ${amount.toLocaleString()}. Remaining: LKR ${remaining.toLocaleString()}. View/Download: ${mockPDFURL}`;

    const waURL = `https://wa.me/94${phone.substring(1)}?text=${encodeURIComponent(text)}`;
    window.open(waURL, '_blank');

    setWhatsappPromptOpen(false);
    setSettlementReceiptRecord(null);
  };

  // Debt History: preview a debt's original sale bill (generated, not auto-downloaded)
  const handleViewBill = (debt) => {
    const doc = generateBillPDF(debt.sale, settings);
    const blobUrl = doc.output('bloburl');
    setBillPdfUrl(blobUrl);
    setBillDebt(debt);
    setBillPreviewOpen(true);
  };

  const downloadBill = (debt) => {
    if (!debt) return;
    const doc = generateBillPDF(debt.sale, settings);
    doc.save(`${debt.sale?.sale_code || 'bill'}_invoice.pdf`);
  };

  const closeBillPreview = () => {
    if (billPdfUrl) URL.revokeObjectURL(billPdfUrl);
    setBillPreviewOpen(false);
    setBillPdfUrl(null);
    setBillDebt(null);
  };

  // Customer Debt Aging (0-30, 31-60, 61-90, 90+ days)
  const agingSummary = useMemo(() => {
    if (!debts) return { b0_30: 0, b31_60: 0, b61_90: 0, b90_plus: 0, total: 0, count: 0 };
    const now = new Date();

    let b0_30 = 0, b31_60 = 0, b61_90 = 0, b90_plus = 0, total = 0, count = 0;

    debts.forEach(d => {
      if (d.status === 'settled') return;
      count++;
      const debtDate = new Date(d.created_at);
      const diffDays = Math.floor((now - debtDate) / (1000 * 60 * 60 * 24));

      total += d.remaining_amount;

      if (diffDays <= 30) b0_30 += d.remaining_amount;
      else if (diffDays <= 60) b31_60 += d.remaining_amount;
      else if (diffDays <= 90) b61_90 += d.remaining_amount;
      else b90_plus += d.remaining_amount;
    });

    return { b0_30, b31_60, b61_90, b90_plus, total, count };
  }, [debts]);

  // Reset all filters
  const resetFilters = () => {
    setStatusFilter('all');
    setAgingFilter('all');
    setSearchQuery('');
    setFromDate('');
    setToDate('');
  };

  // Filtered debt rows (feeds both the History ledger and the Customers grouping)
  const filteredDebts = useMemo(() => {
    if (!debts) return [];
    let result = debts.slice();
    const now = new Date();

    // 1. Status Filter
    if (statusFilter !== 'all') {
      result = result.filter(d => d.status === statusFilter);
    }

    // 2. Aging Filter
    if (agingFilter !== 'all') {
      result = result.filter(d => {
        if (d.status === 'settled') return false;
        const diffDays = Math.floor((now - new Date(d.created_at)) / (1000 * 60 * 60 * 24));
        if (agingFilter === '0-30') return diffDays <= 30;
        if (agingFilter === '31-60') return diffDays > 30 && diffDays <= 60;
        if (agingFilter === '61-90') return diffDays > 60 && diffDays <= 90;
        if (agingFilter === '90+') return diffDays > 90;
        return true;
      });
    }

    // 3. Search Query (Customer Name or Sale Code)
    const query = searchQuery.toLowerCase().trim();
    if (query) {
      result = result.filter(d =>
        d.customer?.name?.toLowerCase().includes(query) ||
        d.sale?.sale_code?.toLowerCase().includes(query)
      );
    }

    // 4. Date Range Filter
    if (fromDate) {
      const from = new Date(fromDate);
      from.setHours(0, 0, 0, 0);
      result = result.filter(d => new Date(d.created_at) >= from);
    }
    if (toDate) {
      const to = new Date(toDate);
      to.setHours(23, 59, 59, 999);
      result = result.filter(d => new Date(d.created_at) <= to);
    }

    return result;
  }, [debts, statusFilter, agingFilter, searchQuery, fromDate, toDate]);

  // Debt by Customers: group the (already filtered) outstanding debts by customer
  const customerGroups = useMemo(() => {
    const map = new Map();
    filteredDebts.forEach(d => {
      if (d.status === 'settled') return;
      const key = d.customer_id;
      if (!map.has(key)) {
        map.set(key, { customer_id: key, customer: d.customer, total_debt: 0 });
      }
      map.get(key).total_debt += Number(d.remaining_amount);
    });
    return Array.from(map.values()).sort((a, b) => b.total_debt - a.total_debt);
  }, [filteredDebts]);

  // Latest settlement note recorded against a debt, for the History "Note" column
  const getLatestNote = (debt) => {
    const settlements = debt.debt_settlements || [];
    if (!settlements.length) return null;
    const latest = [...settlements].sort((a, b) => new Date(b.settlement_date) - new Date(a.settlement_date))[0];
    return latest?.notes || null;
  };

  return (
    <div className="space-y-6">

      {/* --- Debt Aging Summary Cards - 4-Column Landscape Grid --- */}
      <div className="grid grid-cols-2 md:grid-cols-4 landscape:grid-cols-4 gap-2.5 sm:gap-4">
        <div
          onClick={() => setAgingFilter(agingFilter === '0-30' ? 'all' : '0-30')}
          className={`p-3.5 sm:p-4 rounded-2xl border cursor-pointer transition-all ${
            agingFilter === '0-30'
              ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30 shadow-md ring-2 ring-emerald-500/20'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-emerald-300'
          }`}
        >
          <div className="flex justify-between items-center text-[11px] sm:text-xs text-slate-500 font-semibold mb-1">
            <span className="truncate">0-30 Days (Current)</span>
            <span className="px-1.5 py-0.2 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 text-[10px]">Normal</span>
          </div>
          <p className="text-sm sm:text-base md:text-lg font-extrabold font-heading text-emerald-600 dark:text-emerald-400 truncate">
            LKR {agingSummary.b0_30.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
        </div>

        <div
          onClick={() => setAgingFilter(agingFilter === '31-60' ? 'all' : '31-60')}
          className={`p-3.5 sm:p-4 rounded-2xl border cursor-pointer transition-all ${
            agingFilter === '31-60'
              ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/30 shadow-md ring-2 ring-amber-500/20'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-amber-300'
          }`}
        >
          <div className="flex justify-between items-center text-[11px] sm:text-xs text-slate-500 font-semibold mb-1">
            <span className="truncate">31-60 Days</span>
            <span className="px-1.5 py-0.2 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 text-[10px]">Watch</span>
          </div>
          <p className="text-sm sm:text-base md:text-lg font-extrabold font-heading text-amber-600 dark:text-amber-400 truncate">
            LKR {agingSummary.b31_60.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
        </div>

        <div
          onClick={() => setAgingFilter(agingFilter === '61-90' ? 'all' : '61-90')}
          className={`p-3.5 sm:p-4 rounded-2xl border cursor-pointer transition-all ${
            agingFilter === '61-90'
              ? 'border-orange-500 bg-orange-50/50 dark:bg-orange-950/30 shadow-md ring-2 ring-orange-500/20'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-orange-300'
          }`}
        >
          <div className="flex justify-between items-center text-[11px] sm:text-xs text-slate-500 font-semibold mb-1">
            <span className="truncate">61-90 Days</span>
            <span className="px-1.5 py-0.2 rounded-full bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-400 text-[10px]">Overdue</span>
          </div>
          <p className="text-sm sm:text-base md:text-lg font-extrabold font-heading text-orange-600 dark:text-orange-400 truncate">
            LKR {agingSummary.b61_90.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
        </div>

        <div
          onClick={() => setAgingFilter(agingFilter === '90+' ? 'all' : '90+')}
          className={`p-3.5 sm:p-4 rounded-2xl border cursor-pointer transition-all ${
            agingFilter === '90+'
              ? 'border-rose-500 bg-rose-50/50 dark:bg-rose-950/30 shadow-md ring-2 ring-rose-500/20'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-rose-300'
          }`}
        >
          <div className="flex justify-between items-center text-[11px] sm:text-xs text-slate-500 font-semibold mb-1">
            <span className="truncate">90+ Days</span>
            <span className="px-1.5 py-0.2 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 text-[10px]">Critical</span>
          </div>
          <p className="text-sm sm:text-base md:text-lg font-extrabold font-heading text-rose-600 dark:text-rose-400 truncate">
            LKR {agingSummary.b90_plus.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">

          {/* Status Filter */}
          <Select
            label="Payment Status"
            name="statusFilter"
            options={[
              { value: 'all', label: 'All Statuses' },
              { value: 'pending', label: 'Pending Only' },
              { value: 'partial', label: 'Partially Settled' },
              { value: 'settled', label: 'Settled Ledger' }
            ]}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          />

          {/* Debt Aging Filter */}
          <Select
            label="Debt Aging Bracket"
            name="agingFilter"
            options={[
              { value: 'all', label: 'All Aging Brackets' },
              { value: '0-30', label: '0 - 30 Days (Current)' },
              { value: '31-60', label: '31 - 60 Days Overdue' },
              { value: '61-90', label: '61 - 90 Days Overdue' },
              { value: '90+', label: '90+ Days (Critical Risk)' }
            ]}
            value={agingFilter}
            onChange={(e) => setAgingFilter(e.target.value)}
          />

          {/* Customer Search */}
          <Input
            label="Search Registry"
            name="debtSearch"
            placeholder="Search debtor or sale code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          {/* Date From */}
          <Input
            label="Date From"
            name="fromDate"
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />

          {/* Date To */}
          <Input
            label="Date To"
            name="toDate"
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </div>

        {/* Reset Filter Button */}
        <div className="flex justify-between items-center pt-1">
          <span className="text-xs text-slate-500 font-medium">
            Total Debt Outstanding: <strong className="text-slate-900 dark:text-slate-100">LKR {agingSummary.total.toLocaleString()}</strong> ({agingSummary.count} debtors)
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={resetFilters}
            className="flex items-center space-x-1.5"
          >
            <RefreshCcw size={14} />
            <span>Reset Filters</span>
          </Button>
        </div>
      </div>

      {/* Overview Mode Toggle */}
      <div className="inline-flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-1 shadow-sm">
        <button
          onClick={() => setViewMode('byCustomer')}
          className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
            viewMode === 'byCustomer'
              ? 'bg-navy-600 text-white shadow-sm'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Users size={14} />
          <span>Debt by Customers</span>
        </button>
        <button
          onClick={() => setViewMode('history')}
          className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
            viewMode === 'history'
              ? 'bg-navy-600 text-white shadow-sm'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <History size={14} />
          <span>Debt History</span>
        </button>
      </div>

      {viewMode === 'byCustomer' ? (
        <Table
          compact
          enablePagination={false}
          headers={[
            { key: 'customerId', label: 'Customer ID', sortable: false },
            { key: 'customerName', label: 'Customer Name', sortable: false },
            { key: 'total_debt', label: 'Total Debt', sortable: false },
            { key: 'action', label: 'Actions', sortable: false }
          ]}
          data={customerGroups}
          isLoading={isLoading}
          emptyMessage="Clear ledger! No debtors matched the parameters."
          renderRow={(group) => (
            <tr key={group.customer_id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 border-b border-slate-100 dark:border-slate-800">
              <td className="px-2.5 sm:px-4 py-2.5 sm:py-3 font-mono text-navy-600 dark:text-navy-400">{group.customer?.customer_code}</td>
              <td className="px-2.5 sm:px-4 py-2.5 sm:py-3 font-semibold text-slate-900 dark:text-slate-100">{group.customer?.name}</td>
              <td className="px-2.5 sm:px-4 py-2.5 sm:py-3 font-mono font-semibold text-rose-600 dark:text-rose-400">LKR {group.total_debt.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
              <td className="px-2.5 sm:px-4 py-2.5 sm:py-3">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => openSettleModal(group)}
                  className="flex items-center space-x-1"
                >
                  <DollarSign size={13} />
                  <span>Settle</span>
                </Button>
              </td>
            </tr>
          )}
        />
      ) : (
        <Table
          compact
          enablePagination={false}
          headers={[
            { key: 'customerName', label: 'Customer Name', sortable: true },
            { key: 'saleCode', label: 'Sale Code', sortable: true },
            { key: 'total_amount', label: 'Total Amount', sortable: true },
            { key: 'paid_amount', label: 'Amount Paid', sortable: true },
            { key: 'remaining_amount', label: 'Remaining Balance', sortable: true },
            { key: 'created_at', label: 'Date Issued', sortable: true },
            { key: 'note', label: 'Note', sortable: false },
            { key: 'downloadPdf', label: 'Download PDF', sortable: false }
          ]}
          data={filteredDebts}
          isLoading={isLoading}
          emptyMessage="Clear ledger! No outstanding debts matched the parameters."
          renderRow={(debt) => {
            const note = getLatestNote(debt);
            return (
              <tr key={debt.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 border-b border-slate-100 dark:border-slate-800">
                <td className="px-2.5 sm:px-4 py-2.5 sm:py-3 font-semibold text-slate-900 dark:text-slate-100">{debt.customer?.name}</td>
                <td className="px-2.5 sm:px-4 py-2.5 sm:py-3 font-mono font-medium text-navy-600 dark:text-navy-400">{debt.sale?.sale_code}</td>
                <td className="px-2.5 sm:px-4 py-2.5 sm:py-3 font-mono text-slate-700 dark:text-slate-300">LKR {debt.total_amount.toLocaleString()}</td>
                <td className="px-2.5 sm:px-4 py-2.5 sm:py-3 font-mono text-emerald-600 dark:text-emerald-400">LKR {debt.paid_amount.toLocaleString()}</td>
                <td className="px-2.5 sm:px-4 py-2.5 sm:py-3 font-mono font-semibold text-rose-600 dark:text-rose-400">LKR {debt.remaining_amount.toLocaleString()}</td>
                <td className="px-2.5 sm:px-4 py-2.5 sm:py-3 text-xs text-slate-400">{new Date(debt.created_at).toLocaleDateString()}</td>
                <td className="px-2.5 sm:px-4 py-2.5 sm:py-3 text-xs text-slate-500 dark:text-slate-400 max-w-[160px] truncate" title={note || ''}>{note || '—'}</td>
                <td className="px-2.5 sm:px-4 py-2.5 sm:py-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleViewBill(debt)}
                    className="flex items-center space-x-1"
                  >
                    <FileDown size={13} />
                    <span>Download PDF</span>
                  </Button>
                </td>
              </tr>
            );
          }}
        />
      )}

      {/* --- Settle Debt Modal Dialog --- */}
      <Modal
        isOpen={settleModalOpen}
        onClose={closeSettleModal}
        title="Register Debt Settlement"
      >
        <form onSubmit={handleConfirmSettlement} className="space-y-4">

          {/* Summary Details */}
          <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 divide-y divide-slate-150 dark:divide-slate-800 space-y-2.5">
            <div className="flex justify-between text-xs py-0.5">
              <span className="text-slate-400">Customer</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {selectedGroup?.customer?.name}
              </span>
            </div>
            <div className="flex justify-between text-xs py-1">
              <span className="text-slate-400">Customer ID</span>
              <span className="font-mono text-navy-600 dark:text-navy-400">
                {selectedGroup?.customer?.customer_code}
              </span>
            </div>
            <div className="flex justify-between text-xs py-1 font-bold text-rose-600 dark:text-rose-400">
              <span>Total Debt</span>
              <span className="font-mono">
                LKR {selectedGroup?.total_debt.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Payment amount */}
          <Input
            label="Payment Amount (LKR)"
            name="amountPaid"
            type="number"
            step="0.01"
            required
            min="0.01"
            max={selectedGroup?.total_debt}
            placeholder={`Max LKR ${selectedGroup?.total_debt}`}
            value={paymentAmount}
            onChange={(e) => setPaymentAmount(e.target.value)}
          />

          {/* Payment method */}
          <Select
            label="Payment Method"
            name="paymentMethod"
            options={[
              { value: 'cash', label: 'Cash' },
              { value: 'card', label: 'Card' }
            ]}
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
          />

          {/* Note */}
          <TextArea
            label="Note (Optional)"
            name="settlementNote"
            rows={2}
            placeholder="Add a note about this payment..."
            value={settlementNote}
            onChange={(e) => setSettlementNote(e.target.value)}
          />

          {/* Preview panel */}
          <div className="p-3 bg-navy-50/50 dark:bg-navy-950/20 border border-navy-100 dark:border-navy-900/50 rounded-xl flex justify-between items-center text-xs">
            <span className="text-slate-500 font-semibold">Remaining balance after settlement:</span>
            <span className="font-extrabold font-mono text-slate-800 dark:text-slate-200 text-sm">
              LKR {remainingPreview.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <Button variant="secondary" onClick={closeSettleModal} disabled={actionLoading}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" isLoading={actionLoading} className="bg-emerald-600 hover:bg-emerald-700">
              Confirm Settlement
            </Button>
          </div>
        </form>
      </Modal>

      {/* --- Settlement Receipt Preview Modal --- */}
      <Modal
        isOpen={receiptPreviewOpen}
        onClose={closeReceiptPreview}
        title={`Settlement Receipt ${settlementReceiptRecord ? `— ${settlementReceiptRecord.settlement_code}` : ''}`}
        size="2xl"
      >
        <div className="space-y-3">
          {receiptPdfUrl && (
            <iframe
              src={receiptPdfUrl}
              title="Settlement Receipt PDF Preview"
              className="w-full h-[70vh] rounded-xl border border-slate-200 dark:border-slate-800"
            />
          )}
          <div className="flex justify-end">
            <Button
              variant="primary"
              onClick={downloadReceipt}
              className="flex items-center space-x-1.5"
            >
              <FileDown size={16} />
              <span>Download PDF</span>
            </Button>
          </div>
        </div>
      </Modal>

      {/* --- Debt History Bill Preview Modal --- */}
      <Modal
        isOpen={billPreviewOpen}
        onClose={closeBillPreview}
        title={`Bill Preview ${billDebt?.sale ? `— ${billDebt.sale.sale_code}` : ''}`}
        size="2xl"
      >
        <div className="space-y-3">
          {billPdfUrl && (
            <iframe
              src={billPdfUrl}
              title="Bill PDF Preview"
              className="w-full h-[70vh] rounded-xl border border-slate-200 dark:border-slate-800"
            />
          )}
          <div className="flex justify-end">
            <Button
              variant="primary"
              onClick={() => downloadBill(billDebt)}
              className="flex items-center space-x-1.5"
            >
              <FileDown size={16} />
              <span>Download PDF</span>
            </Button>
          </div>
        </div>
      </Modal>

      {/* --- WhatsApp Confirmation Receipt Prompt --- */}
      <ConfirmDialog
        isOpen={whatsappPromptOpen}
        onClose={() => {
          setWhatsappPromptOpen(false);
          setSettlementReceiptRecord(null);
        }}
        onConfirm={handleSendWhatsAppReceipt}
        title="Send Receipt to WhatsApp?"
        message={`Settlement saved successfully. Would you like to launch WhatsApp to dispatch the receipt statement to: ${settlementReceiptRecord?.customer?.name}?`}
        confirmLabel="Send Notification"
        cancelLabel="Skip Notification"
        variant="primary"
      />

    </div>
  );
}
