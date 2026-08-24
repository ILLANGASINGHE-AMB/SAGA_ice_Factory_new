import { useState, useMemo } from 'react';
import { useCashBank } from '../hooks/useCashBank';
import { useCustomers } from '../hooks/useCustomers';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Input, Select } from '../components/FormFields';
import {
  Landmark,
  Wallet,
  CreditCard,
  ArrowUpRight,
  ArrowDownLeft,
  Plus,
  Trash2,
  Clock,
  History,
  PiggyBank
} from 'lucide-react';
import { toLocalDateStr, todayStr, thisMonthStr, thisYearStr, nowLocalDatetimeStr } from '../utils/date';

const fmtDateTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

const ACTION_LABELS = {
  cash_receive: 'Cash Receive',
  bank_deposit: 'Bank Deposit',
  cheque_received: 'Cheque Received',
  withdrawal: 'Withdrawal'
};

const money = (n) => `LKR ${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

function StatCard({ label, icon, value, subtitle, tone = 'default' }) {
  const tones = {
    emerald: 'bg-emerald-500 text-white',
    default: 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100'
  };
  const isFilled = tone === 'emerald';
  return (
    <div className={`rounded-2xl p-3.5 sm:p-4 shadow-xs flex flex-col justify-between relative overflow-hidden ${tones[tone]}`}>
      <div className={`flex items-center justify-between ${isFilled ? 'text-emerald-100' : 'text-slate-500'}`}>
        <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">{label}</span>
        {icon}
      </div>
      <div className="my-1.5">
        <p className="text-base sm:text-lg md:text-xl font-extrabold font-heading truncate">{money(value)}</p>
        <span className={`text-[10px] block mt-0.5 truncate ${isFilled ? 'text-emerald-100' : 'text-slate-400'}`}>{subtitle}</span>
      </div>
    </div>
  );
}

// Cash & Bank is four independent ledgers plus a history view. Stacking them
// all down one long page meant scrolling past three irrelevant sections to
// reach the one being worked in — they're tabs now, with the running balances
// pinned above so they stay visible whichever ledger is open.
const OPENING_SCOPES = [
  { value: 'cash', label: 'Cash in Hand' },
  { value: 'bank', label: 'Bank Balance' },
  { value: 'cheques', label: 'Cheques in Hand' }
];

const SECTION_TABS = [
  { value: 'receives', label: '01. Cash Receives', icon: Wallet },
  { value: 'deposits', label: '02. Bank Deposits', icon: Landmark },
  { value: 'cheques', label: '03. Cheques', icon: CreditCard },
  { value: 'withdrawals', label: '04. Withdrawals', icon: ArrowDownLeft },
  { value: 'history', label: 'Cash Flow History', icon: History },
  { value: 'opening', label: 'Initial Collection', icon: PiggyBank }
];

export function CashBankPage() {
  const cb = useCashBank();
  const { customers } = useCustomers();
  const { user, isAdmin } = useAuth();
  const toast = useToast();

  const [savingSection, setSavingSection] = useState(null);
  const [confirmTarget, setConfirmTarget] = useState(null); // { type, id, label }
  const [isDeleting, setIsDeleting] = useState(false);

  const [activeTab, setActiveTab] = useState('receives');

  // Cash Flow History view
  const [periodType, setPeriodType] = useState('all'); // 'all' | 'daily' | 'monthly' | 'yearly'
  const [periodDate, setPeriodDate] = useState(todayStr);
  const [periodMonth, setPeriodMonth] = useState(thisMonthStr);
  const [periodYear, setPeriodYear] = useState(thisYearStr);
  const [historyActionFilter, setHistoryActionFilter] = useState('all');
  const [historyUserFilter, setHistoryUserFilter] = useState('all');

  // Section 01: Other Cash Receives
  const [receiveAmount, setReceiveAmount] = useState('');
  const [receiveAt, setReceiveAt] = useState(nowLocalDatetimeStr);
  const [receiveType, setReceiveType] = useState('head_office');

  // Section 02: Bank Deposit
  const [depositAmount, setDepositAmount] = useState('');
  const [cashMethod, setCashMethod] = useState('sales');
  const [depositBankName, setDepositBankName] = useState('');

  // Section 03: Cheque Register
  const [chequeNo, setChequeNo] = useState('');
  const [chequeBank, setChequeBank] = useState('');
  const [chequeAmount, setChequeAmount] = useState('');
  const [chequePayer, setChequePayer] = useState('');
  const [chequeCustomerId, setChequeCustomerId] = useState('');

  // Initial Collection: opening balances, set once at go-live
  const [openingScope, setOpeningScope] = useState('cash');
  const [openingAmount, setOpeningAmount] = useState('');
  const [openingBankName, setOpeningBankName] = useState('');
  const [openingDate, setOpeningDate] = useState(todayStr);
  const [openingNote, setOpeningNote] = useState('');

  // Section 04: Withdraw Money
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawBank, setWithdrawBank] = useState('');
  const [withdrawPurpose, setWithdrawPurpose] = useState('');

  const createdBy = user?.fullName || 'Manager';

  const handleAddReceive = async (e) => {
    e.preventDefault();
    setSavingSection('receive');
    try {
      await cb.addCashReceive({ amount: receiveAmount, receiveType, receivedAt: receiveAt, createdBy });
      toast.success(`Recorded LKR ${Number(receiveAmount).toLocaleString()} as a new cash receive!`);
      setReceiveAmount('');
      setReceiveAt(nowLocalDatetimeStr());
      setReceiveType('head_office');
    } catch (err) {
      toast.error(err.message || "Failed to save cash receive");
    } finally {
      setSavingSection(null);
    }
  };

  const handleAddDeposit = async (e) => {
    e.preventDefault();
    setSavingSection('deposit');
    try {
      await cb.addBankDeposit({ amount: depositAmount, cashMethod, bankName: depositBankName, createdBy });
      toast.success(`Deposited LKR ${Number(depositAmount).toLocaleString()} into Bank!`);
      setDepositAmount('');
      setDepositBankName('');
      setCashMethod('sales');
    } catch (err) {
      toast.error(err.message || "Failed to save bank deposit");
    } finally {
      setSavingSection(null);
    }
  };

  const handleAddCheque = async (e) => {
    e.preventDefault();
    setSavingSection('cheque');
    try {
      await cb.addChequeRecord({
        chequeNo,
        bankName: chequeBank,
        amount: chequeAmount,
        payerName: chequePayer,
        customerId: chequeCustomerId || null,
        createdBy
      });
      toast.success(`Cheque ${chequeNo} (LKR ${Number(chequeAmount).toLocaleString()}) recorded!`);
      setChequeNo('');
      setChequeBank('');
      setChequeAmount('');
      setChequePayer('');
      setChequeCustomerId('');
    } catch (err) {
      toast.error(err.message || "Failed to save cheque record");
    } finally {
      setSavingSection(null);
    }
  };

  const handleDepositCheque = async (chequeId, chequeNoLabel) => {
    setSavingSection(`cheque-deposit-${chequeId}`);
    try {
      await cb.depositChequeRecord(chequeId);
      toast.success(`Cheque ${chequeNoLabel} deposited into Bank!`);
    } catch (err) {
      toast.error(err.message || "Failed to deposit cheque");
    } finally {
      setSavingSection(null);
    }
  };

  const handleAddWithdrawal = async (e) => {
    e.preventDefault();
    setSavingSection('withdrawal');
    try {
      await cb.addWithdrawal({ amount: withdrawAmount, bankName: withdrawBank, purpose: withdrawPurpose, createdBy });
      toast.success(`Withdrew LKR ${Number(withdrawAmount).toLocaleString()} from ${withdrawBank}!`);
      setWithdrawAmount('');
      setWithdrawPurpose('');
    } catch (err) {
      toast.error(err.message || "Failed to record withdrawal");
    } finally {
      setSavingSection(null);
    }
  };

  // Registered accounts first, then one-time walk-ins, each clearly labelled.
  const chequeCustomerOptions = useMemo(() => {
    const rows = (customers || []).slice().sort((a, b) => {
      if (!!a.is_one_time !== !!b.is_one_time) return a.is_one_time ? 1 : -1;
      return (a.name || '').localeCompare(b.name || '');
    });
    return rows.map(c => ({
      value: String(c.id),
      label: `${c.customer_code} — ${c.name}${c.is_one_time ? ' (One-Time)' : ''}`
    }));
  }, [customers]);

  const handleChequeCustomerChange = (value) => {
    setChequeCustomerId(value);
    // Save the operator retyping a name the system already knows; they can
    // still overwrite it, since the name on the cheque isn't always the
    // account name.
    const match = (customers || []).find(c => String(c.id) === String(value));
    if (match && !chequePayer.trim()) setChequePayer(match.name);
  };

  const handleSaveOpening = async (e) => {
    e.preventDefault();
    setSavingSection('opening');
    try {
      await cb.setOpeningBalance({
        scope: openingScope,
        amount: openingAmount,
        bankName: openingBankName,
        asOfDate: openingDate,
        note: openingNote,
        setBy: createdBy
      });
      const label = OPENING_SCOPES.find(o => o.value === openingScope)?.label || openingScope;
      toast.success(`${label} opening balance set to LKR ${Number(openingAmount).toLocaleString()}`);
      setOpeningAmount('');
      setOpeningNote('');
    } catch (err) {
      toast.error(err.message || "Failed to save the opening balance");
    } finally {
      setSavingSection(null);
    }
  };

  const requestDelete = (type, id, label) => setConfirmTarget({ type, id, label });

  const handleConfirmDelete = async () => {
    if (!confirmTarget) return;
    setIsDeleting(true);
    try {
      if (confirmTarget.type === 'receive') await cb.deleteCashReceive(confirmTarget.id);
      else if (confirmTarget.type === 'deposit') await cb.deleteBankDeposit(confirmTarget.id);
      else if (confirmTarget.type === 'cheque') await cb.deleteChequeRecord(confirmTarget.id);
      else if (confirmTarget.type === 'withdrawal') await cb.deleteWithdrawal(confirmTarget.id);
      toast.success("Record deleted");
      setConfirmTarget(null);
    } catch (err) {
      toast.error(err.message || "Failed to delete record");
    } finally {
      setIsDeleting(false);
    }
  };

  const cashMethodLabels = {
    sales: 'Cash Received From Sales',
    other: 'Cash Received From Other',
    cheques: 'Cash Received From Cheques (Already Deposited)'
  };

  const historyUsers = useMemo(
    () => Array.from(new Set(cb.historyEntries.map(e => e.doneBy))).sort(),
    [cb.historyEntries]
  );

  const filteredHistory = useMemo(() => {
    return cb.historyEntries.filter(e => {
      if (periodType === 'daily' && toLocalDateStr(e.occurredAt) !== periodDate) return false;
      if (periodType === 'monthly' && toLocalDateStr(e.occurredAt).slice(0, 7) !== periodMonth) return false;
      if (periodType === 'yearly' && String(new Date(e.occurredAt).getFullYear()) !== periodYear) return false;
      if (historyActionFilter !== 'all' && e.actionType !== historyActionFilter) return false;
      if (historyUserFilter !== 'all' && e.doneBy !== historyUserFilter) return false;
      return true;
    });
  }, [cb.historyEntries, periodType, periodDate, periodMonth, periodYear, historyActionFilter, historyUserFilter]);

  return (
    <div className="space-y-6">

      {/* Header Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs">
        <div className="flex items-center space-x-2">
          <Landmark className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
          <h2 className="text-xl font-bold font-heading text-slate-900 dark:text-slate-100">
            Cash & Bank Management
          </h2>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Live running balances across Cash, Bank, Cheques and Withdrawals — every entry is saved permanently.
        </p>
      </div>

      {cb.isLoading ? (
        <div className="p-12 text-center text-slate-500 animate-pulse">
          Loading Cash & Bank Management...
        </div>
      ) : (
        <div className="space-y-6">

          {/* Running balances — pinned above the tabs so they stay visible
              whichever ledger is open. The first three are balances (what is
              held right now); the fourth is a running total of money taken
              out, which is why it reads differently from the others. */}
          <div className="grid grid-cols-2 md:grid-cols-4 landscape:grid-cols-4 gap-2.5 sm:gap-4">
            <StatCard
              label="01. Cash Balance"
              icon={<Wallet className="w-4 h-4 sm:w-5 sm:h-5" />}
              value={cb.cashBalance}
              subtitle="Cash in hand — updated by cash orders, settlements & receives"
              tone="emerald"
            />
            <StatCard
              label="02. Bank Balance"
              icon={<Landmark className="w-4 h-4 sm:w-5 sm:h-5 text-navy-600 dark:text-sky-400" />}
              value={cb.bankBalance}
              subtitle={`Deposits less withdrawals · ${cb.bankDeposits.length} deposit${cb.bankDeposits.length !== 1 ? 's' : ''}`}
            />
            <StatCard
              label="03. Hand Cheques"
              icon={<CreditCard className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500" />}
              value={cb.handChequesTotal}
              subtitle={`Received but not yet banked · ${cb.chequesPending.length} cheque${cb.chequesPending.length !== 1 ? 's' : ''}`}
            />
            <StatCard
              label="04. Total Withdrawn"
              icon={<ArrowDownLeft className="w-4 h-4 sm:w-5 sm:h-5 text-rose-500" />}
              value={cb.bankWithdrawalsTotal}
              subtitle={`Taken out of the bank for expenses · ${cb.bankWithdrawals.length} withdrawal${cb.bankWithdrawals.length !== 1 ? 's' : ''}`}
            />
          </div>

          {/* Section tabs */}
          <div className="flex items-center gap-1 overflow-x-auto touch-scroll bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-1.5 shadow-xs">
            {SECTION_TABS.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.value}
                  onClick={() => setActiveTab(tab.value)}
                  className={`flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition shrink-0 cursor-pointer ${
                    activeTab === tab.value
                      ? 'bg-navy-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon size={14} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {activeTab === 'receives' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center space-x-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <Wallet size={18} className="text-emerald-600" />
              <h3 className="text-base font-bold font-heading text-slate-800 dark:text-slate-100">
                Section 01: Other Cash Receives
              </h3>
            </div>

            <form onSubmit={handleAddReceive} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Amount (LKR)"
                  type="number" step="0.01" min="0.01"
                  value={receiveAmount}
                  onChange={(e) => setReceiveAmount(e.target.value)}
                  required
                />
                <Input
                  label="Date & Time"
                  type="datetime-local"
                  value={receiveAt}
                  onChange={(e) => setReceiveAt(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">Description</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setReceiveType('head_office')}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold border transition ${
                      receiveType === 'head_office'
                        ? 'bg-emerald-500 text-white border-emerald-500'
                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Received by Head Office
                  </button>
                  <button
                    type="button"
                    onClick={() => setReceiveType('other')}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold border transition ${
                      receiveType === 'other'
                        ? 'bg-emerald-500 text-white border-emerald-500'
                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Other Receives
                  </button>
                </div>
              </div>

              <Button type="submit" variant="primary" isLoading={savingSection === 'receive'} className="w-full py-2.5 rounded-xl font-bold flex justify-center items-center space-x-2">
                <Plus size={16} />
                <span>Save Cash Receive</span>
              </Button>
            </form>

            {cb.cashReceives.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-2">No cash receives recorded yet.</p>
            ) : (
              <div className="overflow-x-auto max-h-48 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase text-[10px]">
                      <th className="py-1.5">Date & Time</th>
                      <th className="py-1.5">Description</th>
                      <th className="py-1.5 text-right">Amount</th>
                      <th className="py-1.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {cb.cashReceives.map((r) => (
                      <tr key={r.id}>
                        <td className="py-1.5 text-slate-500 whitespace-nowrap">{fmtDateTime(r.received_at)}</td>
                        <td className="py-1.5 font-medium">{r.receive_type === 'head_office' ? 'Received by Head Office' : 'Other Receives'}</td>
                        <td className="py-1.5 text-right font-bold text-emerald-600">{money(r.amount)}</td>
                        <td className="py-1.5 text-right">
                          <button onClick={() => requestDelete('receive', r.id, `this cash receive of ${money(r.amount)}`)} className="p-1 text-rose-500 hover:bg-rose-50 rounded">
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          )}

          {activeTab === 'deposits' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center space-x-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <Landmark className="w-5 h-5 text-navy-600 dark:text-sky-400" />
              <h3 className="text-base font-bold font-heading text-slate-800 dark:text-slate-100">
                Section 02: Bank Deposit
              </h3>
            </div>

            <form onSubmit={handleAddDeposit} className="space-y-3">
              <Input
                label="Amount to Deposit (LKR)"
                type="number" step="0.01" min="0.01"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                required
              />
              <Select
                label="Select Cash Method"
                value={cashMethod}
                onChange={(e) => setCashMethod(e.target.value)}
                options={[
                  { value: 'sales', label: cashMethodLabels.sales },
                  { value: 'other', label: cashMethodLabels.other },
                  { value: 'cheques', label: cashMethodLabels.cheques }
                ]}
              />
              <Input
                label="Bank Name / Reference Note (Optional)"
                type="text"
                placeholder="e.g. Commercial Bank - Main Branch"
                value={depositBankName}
                onChange={(e) => setDepositBankName(e.target.value)}
              />

              <Button type="submit" variant="primary" isLoading={savingSection === 'deposit'} className="w-full py-2.5 rounded-xl font-bold flex justify-center items-center space-x-2">
                <ArrowUpRight size={16} />
                <span>Save Bank Deposit</span>
              </Button>
            </form>

            {cb.bankDeposits.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-2">No bank deposits recorded yet.</p>
            ) : (
              <div className="overflow-x-auto max-h-48 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase text-[10px]">
                      <th className="py-1.5">Date & Time</th>
                      <th className="py-1.5">Method</th>
                      <th className="py-1.5">Bank / Ref</th>
                      <th className="py-1.5 text-right">Amount</th>
                      <th className="py-1.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {cb.bankDeposits.map((d) => (
                      <tr key={d.id}>
                        <td className="py-1.5 text-slate-500 whitespace-nowrap">{fmtDateTime(d.deposited_at)}</td>
                        <td className="py-1.5">
                          <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-sky-100 text-sky-800">
                            {d.cash_method}
                          </span>
                        </td>
                        <td className="py-1.5 text-slate-500">{d.bank_name || '—'}</td>
                        <td className="py-1.5 text-right font-bold text-sky-600">{money(d.amount)}</td>
                        <td className="py-1.5 text-right">
                          <button onClick={() => requestDelete('deposit', d.id, `this bank deposit of ${money(d.amount)}`)} className="p-1 text-rose-500 hover:bg-rose-50 rounded">
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          )}

          {activeTab === 'cheques' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center space-x-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <CreditCard className="w-5 h-5 text-amber-500" />
              <h3 className="text-base font-bold font-heading text-slate-800 dark:text-slate-100">
                Section 03: Cheque Prices Register
              </h3>
            </div>

            <form onSubmit={handleAddCheque} className="grid grid-cols-2 gap-2">
              <Input placeholder="Cheque No." value={chequeNo} onChange={(e) => setChequeNo(e.target.value)} required />
              <Input placeholder="Bank Name" value={chequeBank} onChange={(e) => setChequeBank(e.target.value)} required />
              <Input type="number" step="0.01" placeholder="Amount (LKR)" value={chequeAmount} onChange={(e) => setChequeAmount(e.target.value)} required />
              <Input placeholder="Name on Cheque (Payer)" value={chequePayer} onChange={(e) => setChequePayer(e.target.value)} required />

              {/* Attaching the cheque to a customer is what makes it show up
                  against their account. One-time (walk-in) buyers are real
                  customer rows, so they can be picked here too; leave it on
                  "Not linked" for a genuinely anonymous cheque. */}
              <div className="col-span-2">
                <Select
                  label="Link to Customer"
                  value={chequeCustomerId}
                  onChange={(e) => handleChequeCustomerChange(e.target.value)}
                  options={[
                    { value: '', label: 'Not linked to a customer account' },
                    ...chequeCustomerOptions
                  ]}
                />
              </div>

              <div className="col-span-2">
                <Button type="submit" size="sm" variant="secondary" isLoading={savingSection === 'cheque'} className="w-full flex justify-center items-center space-x-1">
                  <Plus size={14} />
                  <span>Save Cheque Record</span>
                </Button>
              </div>
            </form>

            {cb.chequeRecords.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-2">No cheque records saved yet.</p>
            ) : (
              <div className="overflow-x-auto max-h-56 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase text-[10px]">
                      <th className="py-1.5">Cheque No</th>
                      <th className="py-1.5">Bank</th>
                      <th className="py-1.5">Payer</th>
                      <th className="py-1.5">Customer</th>
                      <th className="py-1.5 text-right">Amount</th>
                      <th className="py-1.5">Status</th>
                      <th className="py-1.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {cb.chequeRecords.map((c) => (
                      <tr key={c.id}>
                        <td className="py-1.5 font-mono text-slate-800 dark:text-slate-200">{c.cheque_no}</td>
                        <td className="py-1.5 text-slate-500">{c.bank_name}</td>
                        <td className="py-1.5 font-medium">{c.payer_name}</td>
                        <td className="py-1.5 text-slate-500">
                          {c.customer
                            ? `${c.customer.customer_code} — ${c.customer.name}${c.customer.is_one_time ? ' (One-Time)' : ''}`
                            : '—'}
                        </td>
                        <td className="py-1.5 text-right font-bold text-amber-600">{money(c.amount)}</td>
                        <td className="py-1.5">
                          <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase rounded ${
                            c.status === 'pending' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {c.status}
                          </span>
                        </td>
                        <td className="py-1.5 text-right space-x-1 whitespace-nowrap">
                          {c.status === 'pending' && (
                            <button
                              onClick={() => handleDepositCheque(c.id, c.cheque_no)}
                              disabled={savingSection === `cheque-deposit-${c.id}`}
                              title="Deposit cheque to Bank"
                              className="px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold rounded"
                            >
                              Deposit
                            </button>
                          )}
                          <button onClick={() => requestDelete('cheque', c.id, `cheque ${c.cheque_no}`)} className="p-1 text-rose-500 hover:bg-rose-50 rounded">
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          )}

          {activeTab === 'withdrawals' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center space-x-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <ArrowDownLeft className="w-5 h-5 text-rose-500" />
              <div>
                <h3 className="text-base font-bold font-heading text-slate-800 dark:text-slate-100">
                  Section 04: Withdraw Money (Work Expenses)
                </h3>
                <p className="text-[11px] text-slate-400">
                  Money taken <strong>out of the bank</strong> to pay factory running costs — fuel,
                  repairs, materials. Each withdrawal reduces the Bank Balance above; it does not add
                  to Cash Balance, because the money leaves to be spent.
                </p>
              </div>
            </div>

            <form onSubmit={handleAddWithdrawal} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Amount to Withdraw (LKR)"
                  type="number" step="0.01" min="0.01"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  required
                />
                <Select
                  label="Bank to withdraw from (each option shows its remaining balance)"
                  value={withdrawBank}
                  onChange={(e) => setWithdrawBank(e.target.value)}
                  options={[
                    { value: '', label: cb.bankBalancesByName.length ? 'Choose a bank...' : 'No deposits recorded yet' },
                    ...cb.bankBalancesByName.map(b => ({ value: b.bankName, label: `${b.bankName} (${money(b.balance)} available)` }))
                  ]}
                  required
                />
              </div>

              <Input
                label="Purpose of Withdrawing"
                placeholder="e.g. Diesel fuel purchase, Factory repair material"
                value={withdrawPurpose}
                onChange={(e) => setWithdrawPurpose(e.target.value)}
                required
              />

              <Button type="submit" variant="danger" isLoading={savingSection === 'withdrawal'} className="w-full py-2.5 rounded-xl font-bold flex justify-center items-center space-x-2">
                <ArrowDownLeft size={16} />
                <span>Record Withdrawal</span>
              </Button>
            </form>

            {cb.bankWithdrawals.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-2">No withdrawals logged yet.</p>
            ) : (
              <div className="overflow-x-auto max-h-48 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase text-[10px]">
                      <th className="py-1.5">Date & Time</th>
                      <th className="py-1.5">Bank</th>
                      <th className="py-1.5">Purpose</th>
                      <th className="py-1.5 text-right">Amount</th>
                      <th className="py-1.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {cb.bankWithdrawals.map((w) => (
                      <tr key={w.id}>
                        <td className="py-1.5 text-slate-400 whitespace-nowrap flex items-center gap-1">
                          <Clock size={10} />{fmtDateTime(w.withdrawn_at)}
                        </td>
                        <td className="py-1.5 font-medium">{w.bank_name}</td>
                        <td className="py-1.5">{w.purpose}</td>
                        <td className="py-1.5 text-right font-bold text-rose-600">{money(w.amount)}</td>
                        <td className="py-1.5 text-right">
                          <button onClick={() => requestDelete('withdrawal', w.id, `this withdrawal of ${money(w.amount)}`)} className="p-1 text-rose-500 hover:bg-rose-50 rounded">
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          )}

          {activeTab === 'history' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center space-x-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <History className="w-5 h-5 text-navy-600 dark:text-sky-400" />
            <h3 className="text-base font-bold font-heading text-slate-800 dark:text-slate-100">
              All Cash Flow History
            </h3>
          </div>

          {/* Filter Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Select
              label="Period"
              value={periodType}
              onChange={(e) => setPeriodType(e.target.value)}
              options={[
                { value: 'all', label: 'All Time' },
                { value: 'daily', label: 'Daily' },
                { value: 'monthly', label: 'Monthly' },
                { value: 'yearly', label: 'Yearly' }
              ]}
            />

            {periodType === 'daily' && (
              <Input label="Date" type="date" value={periodDate} onChange={(e) => setPeriodDate(e.target.value)} />
            )}
            {periodType === 'monthly' && (
              <Input label="Month" type="month" value={periodMonth} onChange={(e) => setPeriodMonth(e.target.value)} />
            )}
            {periodType === 'yearly' && (
              <Input label="Year" type="number" value={periodYear} onChange={(e) => setPeriodYear(e.target.value)} />
            )}

            <Select
              label="Action Type"
              value={historyActionFilter}
              onChange={(e) => setHistoryActionFilter(e.target.value)}
              options={[
                { value: 'all', label: 'All Actions' },
                { value: 'cash_receive', label: ACTION_LABELS.cash_receive },
                { value: 'bank_deposit', label: ACTION_LABELS.bank_deposit },
                { value: 'cheque_received', label: ACTION_LABELS.cheque_received },
                { value: 'withdrawal', label: ACTION_LABELS.withdrawal }
              ]}
            />

            <Select
              label="User"
              value={historyUserFilter}
              onChange={(e) => setHistoryUserFilter(e.target.value)}
              options={[
                { value: 'all', label: 'All Users' },
                ...historyUsers.map(u => ({ value: u, label: u }))
              ]}
            />
          </div>

          {filteredHistory.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">No matching cash flow history found.</p>
          ) : (
            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-white dark:bg-slate-900">
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase text-[10px]">
                    <th className="py-1.5 pr-2">Date & Time</th>
                    <th className="py-1.5 pr-2">Action</th>
                    <th className="py-1.5 pr-2 text-right">Amount</th>
                    <th className="py-1.5">Done By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredHistory.map((e) => (
                    <tr key={e.id}>
                      <td className="py-1.5 pr-2 text-slate-500 whitespace-nowrap flex items-center gap-1">
                        <Clock size={10} />{fmtDateTime(e.occurredAt)}
                      </td>
                      <td className="py-1.5 pr-2">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{ACTION_LABELS[e.actionType]}</span>
                        <span className="block text-[11px] text-slate-400">{e.detail}</span>
                      </td>
                      <td className={`py-1.5 pr-2 text-right font-bold whitespace-nowrap ${
                        e.direction === 'in' ? 'text-emerald-600' : e.direction === 'out' ? 'text-rose-600' : 'text-amber-600'
                      }`}>
                        {e.direction === 'in' ? '+' : e.direction === 'out' ? '−' : ''}{money(e.amount)}
                      </td>
                      <td className="py-1.5 font-medium text-slate-700 dark:text-slate-300">{e.doneBy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
          )}

          {activeTab === 'opening' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
              <div className="flex items-center space-x-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                <PiggyBank className="w-5 h-5 text-emerald-600" />
                <div>
                  <h3 className="text-base font-bold font-heading text-slate-800 dark:text-slate-100">
                    Initial Collection (Opening Balances)
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    What each store of value already held on the day you started using this system.
                  </p>
                </div>
              </div>

              <div className="p-3 bg-sky-50 dark:bg-sky-950/20 border border-sky-200 dark:border-sky-900/50 rounded-xl text-[11px] text-sky-800 dark:text-sky-300 leading-relaxed">
                Every balance above is worked out from the transactions recorded here, so they all
                started at zero. Enter what was actually in the till, the bank and the cheque drawer
                on your go-live date and each balance will carry it forward from then on. Set these
                once — they are not day-to-day entries.
              </div>

              {!isAdmin ? (
                <p className="text-xs text-slate-400 text-center py-4">
                  Opening balances can only be set by an administrator.
                </p>
              ) : (
                <form onSubmit={handleSaveOpening} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Select
                      label="Balance"
                      value={openingScope}
                      onChange={(e) => setOpeningScope(e.target.value)}
                      options={[
                        { value: 'cash', label: 'Cash in Hand' },
                        { value: 'bank', label: 'Bank Balance' },
                        { value: 'cheques', label: 'Cheques in Hand' }
                      ]}
                    />
                    <Input
                      label="Opening Amount (LKR)"
                      type="number" step="0.01" min="0"
                      value={openingAmount}
                      onChange={(e) => setOpeningAmount(e.target.value)}
                      required
                    />
                    <Input
                      label="As Of Date"
                      type="date"
                      value={openingDate}
                      onChange={(e) => setOpeningDate(e.target.value)}
                      required
                    />
                  </div>

                  {openingScope === 'bank' && (
                    <Input
                      label="Bank Name (so withdrawals can draw on it)"
                      placeholder="e.g. Commercial Bank - Main Branch"
                      value={openingBankName}
                      onChange={(e) => setOpeningBankName(e.target.value)}
                    />
                  )}

                  <Input
                    label="Note (Optional)"
                    placeholder="e.g. Verified against the cash book on go-live"
                    value={openingNote}
                    onChange={(e) => setOpeningNote(e.target.value)}
                  />

                  <Button type="submit" variant="primary" isLoading={savingSection === 'opening'} className="w-full py-2.5 rounded-xl font-bold flex justify-center items-center space-x-2">
                    <PiggyBank size={16} />
                    <span>Save Opening Balance</span>
                  </Button>
                </form>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase text-[10px]">
                      <th className="py-1.5">Balance</th>
                      <th className="py-1.5">As Of</th>
                      <th className="py-1.5">Bank / Note</th>
                      <th className="py-1.5 text-right">Opening Amount</th>
                      <th className="py-1.5">Set By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {OPENING_SCOPES.map(scope => {
                      const row = cb.openingBalances.find(o => o.scope === scope.value);
                      return (
                        <tr key={scope.value}>
                          <td className="py-1.5 font-semibold text-slate-800 dark:text-slate-200">{scope.label}</td>
                          <td className="py-1.5 text-slate-500">{row?.as_of_date || '—'}</td>
                          <td className="py-1.5 text-slate-500">{[row?.bank_name, row?.note].filter(Boolean).join(' — ') || '—'}</td>
                          <td className="py-1.5 text-right font-bold text-emerald-600">{money(row?.amount || 0)}</td>
                          <td className="py-1.5 text-slate-500">{row?.set_by || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      )}

      <ConfirmDialog
        isOpen={!!confirmTarget}
        onClose={() => setConfirmTarget(null)}
        onConfirm={handleConfirmDelete}
        title="Delete record?"
        message={`Are you sure you want to permanently delete ${confirmTarget?.label || 'this record'}? This cannot be undone.`}
        isLoading={isDeleting}
      />
    </div>
  );
}
