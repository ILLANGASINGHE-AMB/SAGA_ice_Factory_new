import { useState } from 'react';
import { useCashBank } from '../hooks/useCashBank';
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
  Clock
} from 'lucide-react';

const nowLocalDatetime = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

const fmtDateTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
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

export function CashBankPage() {
  const cb = useCashBank();
  const { user } = useAuth();
  const toast = useToast();

  const [savingSection, setSavingSection] = useState(null);
  const [confirmTarget, setConfirmTarget] = useState(null); // { type, id, label }
  const [isDeleting, setIsDeleting] = useState(false);

  // Section 01: Other Cash Receives
  const [receiveAmount, setReceiveAmount] = useState('');
  const [receiveAt, setReceiveAt] = useState(nowLocalDatetime());
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
      setReceiveAt(nowLocalDatetime());
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
      await cb.addChequeRecord({ chequeNo, bankName: chequeBank, amount: chequeAmount, payerName: chequePayer, createdBy });
      toast.success(`Cheque ${chequeNo} (LKR ${Number(chequeAmount).toLocaleString()}) recorded!`);
      setChequeNo('');
      setChequeBank('');
      setChequeAmount('');
      setChequePayer('');
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
          Live running balances across Cash, Bank Deposits, Cheques and Withdrawals — every entry is saved permanently.
        </p>
      </div>

      {cb.isLoading ? (
        <div className="p-12 text-center text-slate-500 animate-pulse">
          Loading Cash & Bank Management...
        </div>
      ) : (
        <div className="space-y-6">

          {/* 4 STAT CARDS */}
          <div className="grid grid-cols-2 md:grid-cols-4 landscape:grid-cols-4 gap-2.5 sm:gap-4">
            <StatCard
              label="01. Cash Balance"
              icon={<Wallet className="w-4 h-4 sm:w-5 sm:h-5" />}
              value={cb.cashBalance}
              subtitle="Auto-updated on Cash Orders, Debt Settle & Receives"
              tone="emerald"
            />
            <StatCard
              label="02. Bank Deposit"
              icon={<Landmark className="w-4 h-4 sm:w-5 sm:h-5 text-navy-600 dark:text-sky-400" />}
              value={cb.bankBalance}
              subtitle={`${cb.bankDeposits.length} deposit${cb.bankDeposits.length !== 1 ? 's' : ''} on record`}
            />
            <StatCard
              label="03. Hand Cheques"
              icon={<CreditCard className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500" />}
              value={cb.handChequesTotal}
              subtitle={`${cb.chequesPending.length} cheque${cb.chequesPending.length !== 1 ? 's' : ''} on hand`}
            />
            <StatCard
              label="04. Withdrawals"
              icon={<ArrowDownLeft className="w-4 h-4 sm:w-5 sm:h-5 text-rose-500" />}
              value={cb.bankWithdrawalsTotal}
              subtitle={`${cb.bankWithdrawals.length} withdrawal${cb.bankWithdrawals.length !== 1 ? 's' : ''} logged`}
            />
          </div>

          {/* SECTIONS GRID */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">

            <div className="space-y-6">

              {/* SECTION 01: Other Cash Receives */}
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

              {/* SECTION 02: Bank Deposit */}
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

            </div>

            <div className="space-y-6">

              {/* SECTION 03: Cheque Prices Register */}
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
                  <Input placeholder="Customer / Payer Name" value={chequePayer} onChange={(e) => setChequePayer(e.target.value)} required />
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

              {/* SECTION 04: Withdraw Money */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
                <div className="flex items-center space-x-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <ArrowDownLeft className="w-5 h-5 text-rose-500" />
                  <div>
                    <h3 className="text-base font-bold font-heading text-slate-800 dark:text-slate-100">
                      Section 04: Withdraw Money (Work Expenses)
                    </h3>
                    <p className="text-[11px] text-slate-400">Admin use only — withdraws from an existing bank deposit balance.</p>
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
                      label="Select Bank to Withdraw From"
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

            </div>

          </div>

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
