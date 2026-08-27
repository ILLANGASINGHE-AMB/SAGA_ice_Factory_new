import { useState, useMemo, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDebts } from '../hooks/useDebts';
import { useSettings } from '../hooks/useSettings';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { Table } from '../components/Table';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { Input, Select, TextArea } from '../components/FormFields';
import { generateDebtStatementPDF } from '../utils/pdfGenerator';
import { toLocalDateTimeStr } from '../utils/date';
import { buildSettlementNotification, notificationUrl, toWhatsAppNumber } from '../utils/notifications';
import { SendNotificationDialog } from '../components/SendNotificationDialog';
import { recordNotification } from '../hooks/useNotifications';
import { DollarSign, RefreshCcw, FileDown, Users, History, Search, Landmark } from 'lucide-react';

// Roll a set of debt rows up into one outstanding-balance line per customer,
// heaviest debtor first. Shared by the ledger's "Debt by Customers" view and
// the debtor picker, so both always agree on what a customer owes.
function groupDebtsByCustomer(rows) {
  const map = new Map();
  rows.forEach(d => {
    if (d.status === 'settled') return;
    const key = d.customer_id;
    if (!map.has(key)) {
      map.set(key, { customer_id: key, customer: d.customer, total_debt: 0, latest_debt_at: null });
    }
    const group = map.get(key);
    group.total_debt += Number(d.remaining_amount);

    // `created_at` is when the debt was incurred and is never rewritten, so
    // the newest one in the group is the last time this customer took credit —
    // what the "Debt Date & Time" column reports. Compared as timestamps
    // rather than strings so a missing/invalid value can't win the max.
    const incurredAt = d.created_at ? new Date(d.created_at) : null;
    if (incurredAt && !isNaN(incurredAt.getTime())) {
      if (!group.latest_debt_at || incurredAt > new Date(group.latest_debt_at)) {
        group.latest_debt_at = d.created_at;
      }
    }
  });
  return Array.from(map.values()).sort((a, b) => b.total_debt - a.total_debt);
}

// An auto-applied settlement records the settling order only inside its
// `created_by` string — the order RPC writes '<user> (auto-applied from sale
// SC009)' and the mark_auto_applied_settlement trigger stamps is_auto_applied
// to match. This is the only place the settling sale code is available.
const AUTO_APPLIED_SALE_RE = /\(auto-applied from sale ([^)]+)\)/;

const PAYMENT_METHOD_LABELS = {
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
  cheque: 'Cheque',
  card: 'Card',
  other: 'Other'
};

function formatPaymentMethod(method) {
  if (!method) return 'Payment';
  return PAYMENT_METHOD_LABELS[method] || method.replace(/_/g, ' ');
}

export function DebtsPage() {
  const { debts, isLoading, settleCustomerDebt } = useDebts();
  const { settings } = useSettings();
  const { user } = useAuth();
  const toast = useToast();
  const location = useLocation();
  const navigate = useNavigate();

  // Overview mode: 'byCustomer' (grouped debtors ledger) or 'history' (per-sale debt ledger)
  const [viewMode, setViewMode] = useState('byCustomer');

  // Filters state
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'pending', 'partial', 'settled'
  const [searchQuery, setSearchQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [agingFilter, setAgingFilter] = useState('all');

  // Debtor picker modal state — the entry point used by the dashboard's
  // "Settle Debts" shortcut, which arrives here without a customer chosen yet.
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');

  // Settlement modal state
  const [settleModalOpen, setSettleModalOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [settlementNote, setSettlementNote] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Where the money actually landed. A bank/online transfer optionally names
  // the receiving account (so the amount is withdrawable from that bank in
  // Cash & Bank); a cheque must carry a cheque number and bank name before it
  // can be filed under Hand Cheques.
  const [chequeNo, setChequeNo] = useState('');
  const [settlementBankName, setSettlementBankName] = useState('');

  // The just-completed settlement, kept only long enough to compose and send
  // the WhatsApp/SMS notification below — no PDF is generated or shown for
  // it any more (see pendingReceiptNotification / handleSendReceiptNotification).
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

  const openCustomerPicker = () => {
    setPickerQuery('');
    setCustomerPickerOpen(true);
  };

  const closeCustomerPicker = () => {
    setCustomerPickerOpen(false);
    setPickerQuery('');
  };

  // Picking a debtor hands straight over to the normal settlement modal, so
  // the payment, receipt and notification steps are the same either way.
  const handlePickCustomer = (group) => {
    closeCustomerPicker();
    openSettleModal(group);
  };

  const openSettleModal = (group) => {
    setSelectedGroup(group);
    setPaymentAmount('');
    setPaymentMethod('cash');
    setSettlementNote('');
    setChequeNo('');
    setSettlementBankName('');
    setSettleModalOpen(true);
  };

  const closeSettleModal = () => {
    setSettleModalOpen(false);
    setSelectedGroup(null);
    setPaymentAmount('');
    setPaymentMethod('cash');
    setSettlementNote('');
    setChequeNo('');
    setSettlementBankName('');
  };

  // Dashboard "Settle Debts" shortcut: land on the ledger with the debtor
  // picker already open. The navigation state is cleared straight away so a
  // back/forward or refresh doesn't reopen the picker unexpectedly.
  useEffect(() => {
    if (location.state?.openSettleDebt) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      openCustomerPicker();
      navigate(location.pathname, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

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
    if (paymentMethod === 'cheque') {
      if (!chequeNo.trim()) {
        toast.error("Please enter the cheque number");
        return;
      }
      if (!settlementBankName.trim()) {
        toast.error("Please enter the bank name on the cheque");
        return;
      }
    }

    setActionLoading(true);
    try {
      const result = await settleCustomerDebt(
        selectedGroup.customer_id,
        amount,
        user?.fullName || 'Staff Operator',
        paymentMethod,
        settlementNote.trim() || null,
        {
          chequeNo: chequeNo.trim(),
          bankName: settlementBankName.trim(),
          payerName: selectedGroup.customer?.name
        }
      );

      // No PDF is generated or shown here any more — settlementReceiptRecord
      // is kept only to compose the WhatsApp/SMS notification below. The
      // operator can still get a payment record for this customer any time
      // afterward via the "PDF" (Debt Statement) button in Debt History,
      // which lists every settlement's date/amount/method/notes.
      setSettlementReceiptRecord(result);

      toast.success(`Settlement recorded! Code: ${result.settlement_code}`);
      closeSettleModal();
      setWhatsappPromptOpen(true);
    } catch (err) {
      toast.error(err.message || "Failed to settle debt");
    } finally {
      setActionLoading(false);
    }
  };

  const dismissWhatsAppPrompt = () => {
    setWhatsappPromptOpen(false);
    setSettlementReceiptRecord(null);
  };

  // The settlement receipt notification, composed once so the WhatsApp text,
  // the SMS text and the logged record can never drift apart.
  const pendingReceiptNotification = useMemo(() => {
    if (!settlementReceiptRecord) return null;

    const phone = settlementReceiptRecord.customer?.whatsapp_number || settlementReceiptRecord.customer?.contact_number;
    const saleRef = settlementReceiptRecord.settlements?.length
      ? settlementReceiptRecord.settlements.map(s => s.sale_code).filter(Boolean).join(', ')
      : (settlementReceiptRecord.sale?.sale_code || 'N/A');
    const amountPaid = Number(settlementReceiptRecord.amount_paid) || 0;

    // What this customer still owes across *all* their debts after the
    // payment, as reported by the settlement transaction itself. Deriving it
    // from the local `debts` array instead meant quoting the customer their
    // OLD balance whenever the operator tapped Send inside the 350ms realtime
    // debounce — the payment they had just made appeared not to have
    // registered. The local sum stays only as a fallback for a receipt record
    // that predates this field.
    const remaining = settlementReceiptRecord.customerRemainingTotal ?? (debts || [])
      .filter(d => Number(d.customer_id) === Number(settlementReceiptRecord.customer_id) && d.status !== 'settled')
      .reduce((sum, d) => sum + (Number(d.remaining_amount) || 0), 0);

    return {
      phone,
      amountPaid,
      remaining,
      message: buildSettlementNotification({
        customerName: settlementReceiptRecord.customer?.name,
        settlementCode: settlementReceiptRecord.settlement_code,
        saleRef,
        currentAmount: amountPaid,
        totalAmount: amountPaid + remaining,
        paymentType: settlementReceiptRecord.payment_method,
        remainingAmount: remaining
      })
    };
  }, [settlementReceiptRecord, debts]);

  // Dispatch the receipt over the chosen channel — WhatsApp, or the phone's
  // own messaging app for a customer who doesn't use it.
  const handleSendReceiptNotification = async (channel) => {
    if (!settlementReceiptRecord || !pendingReceiptNotification) return;
    const { phone, message, amountPaid, remaining } = pendingReceiptNotification;

    if (!toWhatsAppNumber(phone)) {
      toast.error("This customer has no phone number on file — can't send a notification.");
      dismissWhatsAppPrompt();
      return;
    }

    window.open(notificationUrl(channel, phone, message), '_blank');

    await recordNotification({
      channel,
      notificationType: 'debt_settlement',
      customerId: settlementReceiptRecord.customer_id,
      customerName: settlementReceiptRecord.customer?.name,
      recipientPhone: phone,
      referenceCode: settlementReceiptRecord.settlement_code,
      amount: amountPaid,
      remainingAmount: remaining,
      paymentType: settlementReceiptRecord.payment_method,
      message,
      sentBy: user?.fullName || 'Staff Operator'
    });

    dismissWhatsAppPrompt();
  };

  // Debt History: preview the debt statement — total debt amount, full paid
  // history, and (once settled) the settled amount/date — generated, not
  // auto-downloaded.
  const handleViewBill = (debt) => {
    const doc = generateDebtStatementPDF(debt, settings);
    const blobUrl = doc.output('bloburl');
    setBillPdfUrl(blobUrl);
    setBillDebt(debt);
    setBillPreviewOpen(true);
  };

  const downloadBill = (debt) => {
    if (!debt) return;
    const doc = generateDebtStatementPDF(debt, settings);
    doc.save(`${debt.sale?.sale_code || `DEBT-${debt.id}`}_statement.pdf`);
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
      // created_at is the date the debt was incurred and is never rewritten
      // by the cash-to-old-debt offset any more (that reset a 6-month-old
      // debt into the "0-30 days" bucket). Last activity lives in
      // last_activity_at and deliberately does not affect aging.
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
  const customerGroups = useMemo(() => groupDebtsByCustomer(filteredDebts), [filteredDebts]);

  // Debtors offered in the picker — deliberately built from every debt rather
  // than the filtered set, so the ledger's active filters can't hide the
  // customer standing at the counter with a payment.
  const allDebtorGroups = useMemo(() => groupDebtsByCustomer(debts || []), [debts]);

  const pickerResults = useMemo(() => {
    const query = pickerQuery.toLowerCase().trim();
    if (!query) return allDebtorGroups;
    return allDebtorGroups.filter(g =>
      g.customer?.name?.toLowerCase().includes(query) ||
      g.customer?.customer_code?.toLowerCase().includes(query) ||
      g.customer?.contact_number?.toLowerCase().includes(query)
    );
  }, [allDebtorGroups, pickerQuery]);

  // Debt History — one row per debt.
  //
  // It used to emit a separate row for every settlement, so a debt and the
  // payment that cleared it appeared as two disconnected lines. Per
  // DebtTab.md the settlement now folds back into the debt's own row: that
  // row carries what was owed, what has been paid, how it was paid and what
  // is left, and updates in place as the debt is settled. A debt cleared by
  // a later cash order therefore stops reading "Not Settled / 25,000" and
  // starts reading "Settled by Cash Order [SC009] / 0" on the same line.
  const debtHistoryRows = useMemo(() => {
    const rows = filteredDebts.map(debt => {
      const debtAmount = Number(debt.total_amount) || 0;
      const remainingAmount = Number(debt.remaining_amount) || 0;
      const settlements = debt.debt_settlements || [];

      // `debts.paid_amount` is the maintained figure; the settlements sum is
      // a fallback for rows written before it was kept up to date.
      const settledSum = settlements.reduce((sum, setl) => sum + (Number(setl.amount_paid) || 0), 0);
      const paidAmount = Number(debt.paid_amount) || settledSum;

      // Which cash orders auto-cleared this debt, de-duplicated.
      const settledByOrders = [...new Set(
        settlements
          .filter(setl => setl.is_auto_applied)
          .map(setl => AUTO_APPLIED_SALE_RE.exec(setl.created_by || '')?.[1])
          .filter(Boolean)
      )];

      // Methods for payments a person actually took at the counter.
      const manualMethods = [...new Set(
        settlements
          .filter(setl => !setl.is_auto_applied)
          .map(setl => formatPaymentMethod(setl.payment_method))
      )];

      const methodParts = [];
      if (settledByOrders.length > 0) {
        methodParts.push(`Settled by Cash Order [${settledByOrders.join(', ')}]`);
      } else if (settlements.some(setl => setl.is_auto_applied)) {
        // Auto-applied, but the settling order's code was never stamped.
        methodParts.push('Settled by Cash Order');
      }
      methodParts.push(...manualMethods);

      // A debt can be cleared without leaving a settlement row behind (an
      // adjustment, or a legacy record). Calling that "Not Settled" next to a
      // zero balance would read as a contradiction.
      const isCleared = debtAmount > 0 && remainingAmount <= 0;
      if (methodParts.length === 0 && isCleared) methodParts.push('Settled');

      // A debt hanging off a CASH sale is not a credit sale — it is the
      // shortfall FIN-17 opens when that order's cash was diverted to the
      // customer's older invoices. Kept as a sub-label so the operator can
      // still tell the two apart at a glance.
      const isCashShortfall = debt.sale?.payment_type === 'cash';
      const orderTotal = Number(debt.sale?.total_amount) || 0;

      return {
        id: `debt-${debt.id}`,
        occurredAt: debt.created_at,
        customerName: debt.customer?.name || 'Unknown',
        saleCode: debt.sale?.sale_code || `DEBT-${debt.id}`,
        isCashShortfall,
        orderTotal,
        debtAmount,
        paidAmount,
        paymentMethod: methodParts.length > 0 ? methodParts.join(' + ') : 'Not Settled',
        remainingAmount,
        // Drives the row tint. Derived from the balance rather than
        // `debt.status` so it can't disagree with the numbers beside it.
        settlementState: isCleared ? 'settled' : paidAmount > 0 ? 'partial' : 'pending',
        debt
      };
    });

    return rows.sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt));
  }, [filteredDebts]);

  // Status bar across the rows currently in view — how much was charged,
  // how much has come back in, and what's still standing. Now that a row is
  // a debt rather than an event, these are plain column sums.
  const debtHistorySummary = useMemo(() => {
    let charged = 0;
    let collected = 0;
    let outstanding = 0;
    let settled = 0;

    debtHistoryRows.forEach(row => {
      charged += row.debtAmount;
      collected += row.paidAmount;
      outstanding += row.remainingAmount;
      if (row.settlementState === 'settled') settled++;
    });

    return {
      charged,
      collected,
      outstanding,
      debts: debtHistoryRows.length,
      settled,
      open: debtHistoryRows.length - settled,
      collectedPct: charged > 0 ? Math.min(100, (collected / charged) * 100) : 0
    };
  }, [debtHistoryRows]);

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
            { key: 'latest_debt_at', label: 'Debt Date & Time', sortable: false },
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
              <td className="px-2.5 sm:px-4 py-2.5 sm:py-3 font-mono whitespace-nowrap text-slate-600 dark:text-slate-300">
                {toLocalDateTimeStr(group.latest_debt_at) || '—'}
              </td>
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
        <div className="space-y-3">

          {/* Debt History status bar — what the rows currently in view add up
              to: charged, collected, and still outstanding. */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-sm font-bold font-heading text-slate-800 dark:text-slate-100">
                Debt History
              </h3>
              <span className="text-[11px] font-semibold text-slate-400">
                {debtHistorySummary.debts.toLocaleString()} {debtHistorySummary.debts === 1 ? 'debt' : 'debts'} ·{' '}
                {debtHistorySummary.settled.toLocaleString()} settled ·{' '}
                {debtHistorySummary.open.toLocaleString()} outstanding
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:gap-3 text-center">
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 py-2">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Charged</span>
                <span className="block text-xs sm:text-sm font-bold font-mono text-slate-900 dark:text-slate-100">
                  LKR {debtHistorySummary.charged.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 py-2">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Collected</span>
                <span className="block text-xs sm:text-sm font-bold font-mono text-emerald-700 dark:text-emerald-400">
                  LKR {debtHistorySummary.collected.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50 py-2">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400">Outstanding</span>
                <span className="block text-xs sm:text-sm font-bold font-mono text-rose-700 dark:text-rose-400">
                  LKR {debtHistorySummary.outstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <div>
              <div className="h-2 w-full rounded-full bg-slate-150 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${debtHistorySummary.collectedPct}%` }}
                />
              </div>
              <p className="text-[11px] font-semibold text-slate-500 mt-1.5">
                {debtHistorySummary.collectedPct.toFixed(1)}% of the credit issued in this view has been collected.
              </p>
            </div>
          </div>

          <Table
            compact
            enablePagination={false}
            headers={[
              { key: 'occurredAt', label: 'Date & Time', sortable: false },
              { key: 'customerName', label: 'Customer Name', sortable: false },
              { key: 'saleCode', label: 'Sales Code', sortable: false },
              { key: 'debtAmount', label: 'Debt Amount', sortable: false },
              { key: 'paidAmount', label: 'Paid Amount', sortable: false },
              { key: 'paymentMethod', label: 'Payment Method', sortable: false },
              { key: 'remainingAmount', label: 'Remaining Amount', sortable: false },
              { key: 'downloadPdf', label: 'Download PDF', sortable: false }
            ]}
            data={debtHistoryRows}
            isLoading={isLoading}
            emptyMessage="No debts matched the parameters."
            renderRow={(row) => (
              <tr key={row.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 border-b border-slate-100 dark:border-slate-800">
                <td className="px-2.5 sm:px-4 py-2.5 sm:py-3 font-mono text-xs text-slate-500 whitespace-nowrap">
                  {toLocalDateTimeStr(row.occurredAt) || '—'}
                </td>
                <td className="px-2.5 sm:px-4 py-2.5 sm:py-3 font-semibold text-slate-900 dark:text-slate-100">
                  {row.customerName}
                </td>
                <td className="px-2.5 sm:px-4 py-2.5 sm:py-3 font-mono font-medium text-navy-600 dark:text-navy-400 whitespace-nowrap">
                  {row.saleCode}
                  {row.isCashShortfall && (
                    <span className="block text-[10px] font-sans font-normal text-slate-400">
                      Cash order LKR {row.orderTotal.toLocaleString()}
                    </span>
                  )}
                </td>
                <td className="px-2.5 sm:px-4 py-2.5 sm:py-3 font-mono font-semibold text-amber-600 dark:text-amber-400 whitespace-nowrap">
                  LKR {row.debtAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td className="px-2.5 sm:px-4 py-2.5 sm:py-3 font-mono font-semibold whitespace-nowrap">
                  {row.paidAmount > 0 ? (
                    <span className="text-emerald-600 dark:text-emerald-400">
                      LKR {row.paidAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  ) : (
                    <span className="font-sans text-xs font-semibold text-slate-400">Not Paid</span>
                  )}
                </td>
                <td className="px-2.5 sm:px-4 py-2.5 sm:py-3 text-xs max-w-[200px]">
                  <span className={`font-semibold ${
                    row.settlementState === 'settled'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : row.settlementState === 'partial'
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-slate-400'
                  }`} title={row.paymentMethod}>
                    {row.paymentMethod}
                  </span>
                  {row.settlementState === 'partial' && (
                    <span className="block text-[10px] text-slate-400">Part paid</span>
                  )}
                </td>
                <td className={`px-2.5 sm:px-4 py-2.5 sm:py-3 font-mono font-semibold whitespace-nowrap ${
                  row.remainingAmount > 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}>
                  LKR {row.remainingAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td className="px-2.5 sm:px-4 py-2.5 sm:py-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleViewBill(row.debt)}
                    className="flex items-center space-x-1"
                  >
                    <FileDown size={13} />
                    <span>PDF</span>
                  </Button>
                </td>
              </tr>
            )}
          />
        </div>
      )}

      {/* --- Select Debtor Modal (dashboard "Settle Debts" entry point) --- */}
      <Modal
        isOpen={customerPickerOpen}
        onClose={closeCustomerPicker}
        title="Select Customer to Settle"
      >
        <div className="flex flex-col">
          {/* Search + running total stay pinned while the debtor list scrolls in
              the modal's own scrollport. Previously the list had its own
              max-h-[52vh] overflow-y-auto, which produced two nested scrollbars
              and, on landscape tablets, a list taller than the modal itself. */}
          <div className="sticky -top-1 z-10 bg-white dark:bg-slate-900 pt-1 pb-2 space-y-3">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                autoFocus
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
                placeholder="Search by name, customer ID or phone..."
                className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-navy-500 focus:border-transparent"
              />
            </div>

            <div className="flex justify-between items-center text-[11px] font-semibold text-slate-500 px-1">
              <span>{pickerResults.length} debtor{pickerResults.length === 1 ? '' : 's'} with outstanding balance</span>
              <span className="font-mono text-rose-600 dark:text-rose-400">
                LKR {pickerResults.reduce((sum, g) => sum + g.total_debt, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            {isLoading && (
              <p className="text-center text-xs text-slate-400 py-8">Loading debtors...</p>
            )}

            {!isLoading && pickerResults.length === 0 && (
              <p className="text-center text-xs text-slate-400 py-8">
                {allDebtorGroups.length === 0
                  ? 'Clear ledger! No customer currently owes anything.'
                  : 'No debtor matched that search.'}
              </p>
            )}

            {pickerResults.map(group => (
              <button
                key={group.customer_id}
                type="button"
                onClick={() => handlePickCustomer(group)}
                className="w-full text-left p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-emerald-400 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 transition-all flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {group.customer?.name || 'Unknown Customer'}
                  </p>
                  <p className="text-[11px] font-mono text-navy-600 dark:text-navy-400 truncate">
                    {group.customer?.customer_code}
                    {group.customer?.contact_number ? ` · ${group.customer.contact_number}` : ''}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Owes</span>
                  <span className="block text-sm font-bold font-mono text-rose-600 dark:text-rose-400">
                    LKR {group.total_debt.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </button>
            ))}
          </div>

          <div className="sticky -bottom-1 z-10 flex justify-end mt-3 pt-3 pb-1 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
            <Button variant="secondary" onClick={closeCustomerPicker}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

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

          {/* Payment method — decides which Cash & Bank store of value the
              settlement lands in: Cash Balance, Bank Balance, or Hand Cheques. */}
          <Select
            label="Payment Method"
            name="paymentMethod"
            options={[
              { value: 'cash', label: 'Cash' },
              { value: 'bank_transfer', label: 'Bank / Online Transfer' },
              { value: 'cheque', label: 'Cheque' }
            ]}
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
          />

          {/* Where the money lands, stated plainly before the operator commits */}
          <div className={`flex items-start gap-2 p-2.5 rounded-xl text-[11px] font-semibold border ${
            paymentMethod === 'cash'
              ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-400'
              : paymentMethod === 'bank_transfer'
                ? 'bg-sky-50 dark:bg-sky-950/20 border-sky-100 dark:border-sky-900/50 text-sky-700 dark:text-sky-400'
                : 'bg-amber-50 dark:bg-amber-950/20 border-amber-100 dark:border-amber-900/50 text-amber-700 dark:text-amber-400'
          }`}>
            <Landmark size={14} className="mt-0.5 shrink-0" />
            <span>
              {paymentMethod === 'cash' && 'Adds to Cash Balance in Cash & Bank Management.'}
              {paymentMethod === 'bank_transfer' && 'Recorded as a Bank Deposit and adds to Bank Balance in Cash & Bank Management.'}
              {paymentMethod === 'cheque' && 'Filed as a pending cheque and adds to Hand Cheques in Cash & Bank Management.'}
            </span>
          </div>

          {/* Bank/online transfer — naming the receiving account is optional,
              but without it the deposit lands in the unnamed bucket in Cash &
              Bank and can't be withdrawn against a specific bank. */}
          {paymentMethod === 'bank_transfer' && (
            <Input
              label="Bank Name (Optional)"
              name="transferBankName"
              placeholder="Which account received the transfer?"
              value={settlementBankName}
              onChange={(e) => setSettlementBankName(e.target.value)}
            />
          )}

          {/* Cheque — everything Hand Cheques needs to hold the funds and
              later deposit them. The amount is the settlement amount above,
              shown here so the operator can check it against the cheque. */}
          {paymentMethod === 'cheque' && (
            <div className="space-y-3 p-3 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/10">
              <Input
                label="Cheque No."
                name="chequeNo"
                required
                placeholder="e.g. 004512"
                value={chequeNo}
                onChange={(e) => setChequeNo(e.target.value)}
              />
              <Input
                label="Bank Name"
                name="chequeBankName"
                required
                placeholder="Bank printed on the cheque"
                value={settlementBankName}
                onChange={(e) => setSettlementBankName(e.target.value)}
              />
              <Input
                label="Cheque Amount (LKR)"
                name="chequeAmount"
                type="number"
                step="0.01"
                min="0.01"
                max={selectedGroup?.total_debt}
                placeholder="Same as the payment amount"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
              />
              <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">
                The cheque amount is the settlement amount — editing either keeps both in step, so the debt and Hand Cheques can never disagree.
              </p>
            </div>
          )}

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

      {/* --- Debt History Statement Preview Modal --- */}
      <Modal
        isOpen={billPreviewOpen}
        onClose={closeBillPreview}
        title={`Debt Statement ${billDebt?.sale ? `— ${billDebt.sale.sale_code}` : ''}`}
        size="2xl"
      >
        <div className="space-y-3">
          {billPdfUrl && (
            <iframe
              src={billPdfUrl}
              title="Debt Statement PDF Preview"
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

      {/* --- Settlement Receipt Notification Prompt --- */}
      <SendNotificationDialog
        isOpen={whatsappPromptOpen}
        onClose={dismissWhatsAppPrompt}
        onSend={handleSendReceiptNotification}
        title="Send Settlement Receipt"
        intro={`Settlement ${settlementReceiptRecord?.settlement_code || ''} saved. Send the receipt to ${settlementReceiptRecord?.customer?.name || 'the customer'}?`}
        customerName={settlementReceiptRecord?.customer?.name}
        phone={pendingReceiptNotification?.phone}
        message={pendingReceiptNotification?.message || ''}
      />

    </div>
  );
}
