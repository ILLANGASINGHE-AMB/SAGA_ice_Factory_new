import React, { useState, useEffect, useMemo } from 'react';
import { useDailyReport } from '../hooks/useDailyReport';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { 
  Building2, 
  Landmark, 
  Wallet, 
  CreditCard, 
  DollarSign, 
  Save, 
  Calendar, 
  Plus, 
  Minus, 
  ArrowUpRight, 
  ArrowDownLeft, 
  CheckCircle2, 
  TrendingUp, 
  Receipt, 
  FileText, 
  Trash2, 
  RefreshCcw, 
  Clock 
} from 'lucide-react';

export function CashBankPage() {
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const { loading, reportData, manualInputs, saveDailyReport } = useDailyReport(selectedDate);
  const { user } = useAuth();
  const toast = useToast();

  // Primary Financial States
  const [cashOnHand, setCashOnHand] = useState(0);
  const [bankDepositAmount, setBankDepositAmount] = useState(0);
  const [bankDepositToday, setBankDepositToday] = useState(0);
  const [chequesOnHand, setChequesOnHand] = useState(0);
  const [chequeEntries, setChequeEntries] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [isSaving, setIsSaving] = useState(false);

  // Bank Deposit Form State
  const [depositInput, setDepositInput] = useState('');
  const [depositBankRef, setDepositBankRef] = useState('');

  // Cheque Form State
  const [chequeNo, setChequeNo] = useState('');
  const [chequeBank, setChequeBank] = useState('');
  const [chequeAmount, setChequeAmount] = useState('');
  const [chequePayer, setChequePayer] = useState('');

  // Withdrawal Form State
  const [withdrawType, setWithdrawType] = useState('cash'); // 'cash' | 'bank'
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawDescription, setWithdrawDescription] = useState('');

  // Physical Cash Input State inside form
  const [cashInput, setCashInput] = useState('');

  useEffect(() => {
    if (manualInputs && reportData) {
      const calculatedCashInflow = (reportData.incomeDetails?.cashSalesAmount || 0) + 
                                   (reportData.incomeDetails?.creditAmountReceived || 0) + 
                                   (reportData.incomeDetails?.otherReceipts || 0);
      
      const cashWithdrawals = (manualInputs.withdrawals || [])
        .filter(w => w.source === 'cash')
        .reduce((sum, w) => sum + (Number(w.amount) || 0), 0);
      
      const bankDeposits = Number(manualInputs.bankDepositAmount) || 0;
      const defaultCalculatedCash = Math.max(0, calculatedCashInflow - bankDeposits - cashWithdrawals);

      const activeCash = (manualInputs.cashOnHand !== undefined && manualInputs.cashOnHand !== 0)
        ? Number(manualInputs.cashOnHand)
        : defaultCalculatedCash;

      setCashOnHand(activeCash);
      setCashInput(activeCash.toString());
      setBankDepositAmount(manualInputs.bankDepositAmount || 0);
      setBankDepositToday(manualInputs.bankDepositToday || 0);
      setChequesOnHand(manualInputs.chequesOnHand || 0);
      setChequeEntries(Array.isArray(manualInputs.chequeEntries) ? manualInputs.chequeEntries : []);
      setWithdrawals(Array.isArray(manualInputs.withdrawals) ? manualInputs.withdrawals : []);
    }
  }, [manualInputs, selectedDate, reportData]);

  const safeChequeEntries = useMemo(() => Array.isArray(chequeEntries) ? chequeEntries : [], [chequeEntries]);
  const safeWithdrawals = useMemo(() => Array.isArray(withdrawals) ? withdrawals : [], [withdrawals]);

  // Total calculated cheques value
  const totalChequesValue = useMemo(() => {
    return safeChequeEntries.reduce((sum, c) => sum + (Number(c?.amount) || 0), 0);
  }, [safeChequeEntries]);

  // Auto-calculated Cash Sales & Debt Collections
  const cashSalesAmount = reportData?.incomeDetails?.cashSalesAmount || 0;
  const creditAmountReceived = reportData?.incomeDetails?.creditAmountReceived || 0;
  const otherReceipts = reportData?.incomeDetails?.otherReceipts || 0;
  const todaysTotalCashInflow = cashSalesAmount + creditAmountReceived + otherReceipts;

  // Global Save Handler
  const persistChanges = async (updatedFields) => {
    try {
      setIsSaving(true);
      const payload = {
        cashOnHand: Number(cashOnHand) || 0,
        bankDepositAmount: Number(bankDepositAmount) || 0,
        bankDepositToday: Number(bankDepositToday) || 0,
        chequesOnHand: totalChequesValue,
        chequeEntries,
        withdrawals,
        ...updatedFields
      };

      await saveDailyReport(payload);
      toast.success("All Cash & Bank balances saved!");
    } catch (err) {
      toast.error(err.message || "Failed to save entry");
    } finally {
      setIsSaving(false);
    }
  };

  // 1. ACTION: Save Physical Cash Balance Input
  const handleSavePhysicalCash = async (e) => {
    if (e) e.preventDefault();
    const val = parseFloat(cashInput);
    if (isNaN(val) || val < 0) {
      toast.error("Please enter a valid cash amount");
      return;
    }

    setCashOnHand(val);
    await saveDailyReport({ cashOnHand: val });
    toast.success(`Physical Cash Balance saved as LKR ${val.toLocaleString()}`);
  };

  // 2. ACTION: Deposit Cash into Bank (Bank Balance = Bank Balance + Deposit; Cash Balance = Cash Balance - Deposit)
  const handleBankDepositSubmit = async (e) => {
    e.preventDefault();
    const amount = parseFloat(depositInput);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid deposit amount");
      return;
    }

    const newBankBalance = (Number(bankDepositAmount) || 0) + amount;
    const newBankDepositToday = (Number(bankDepositToday) || 0) + amount;
    const newCashBalance = Math.max(0, (Number(cashOnHand) || 0) - amount);

    setBankDepositAmount(newBankBalance);
    setBankDepositToday(newBankDepositToday);
    setCashOnHand(newCashBalance);
    setCashInput(newCashBalance.toString());

    setDepositInput('');
    setDepositBankRef('');

    await saveDailyReport({
      bankDepositAmount: newBankBalance,
      bankDepositToday: newBankDepositToday,
      cashOnHand: newCashBalance
    });

    toast.success(`Deposited LKR ${amount.toLocaleString()} into Bank! Cash Balance updated.`);
  };

  // 3. ACTION: Add Cheque Record
  const handleAddCheque = async (e) => {
    e.preventDefault();
    const amount = parseFloat(chequeAmount);
    if (!chequeNo || isNaN(amount) || amount <= 0) {
      toast.error("Please enter valid Cheque Number and Amount");
      return;
    }

    const newCheque = {
      id: Date.now(),
      chequeNo,
      bankName: chequeBank || 'General Bank',
      amount,
      payerName: chequePayer || 'Customer',
      date: selectedDate,
      status: 'pending'
    };

    const updatedCheques = [newCheque, ...chequeEntries];
    const newChequeTotal = updatedCheques.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);

    setChequeEntries(updatedCheques);
    setChequesOnHand(newChequeTotal);

    setChequeNo('');
    setChequeBank('');
    setChequeAmount('');
    setChequePayer('');

    await saveDailyReport({
      chequeEntries: updatedCheques,
      chequesOnHand: newChequeTotal
    });

    toast.success(`Cheque ${chequeNo} (LKR ${amount.toLocaleString()}) recorded!`);
  };

  // ACTION: Deposit Cheque into Bank
  const handleDepositCheque = async (chequeId) => {
    const targetCheque = chequeEntries.find(c => c.id === chequeId);
    if (!targetCheque) return;

    const amount = Number(targetCheque.amount) || 0;
    const updatedCheques = chequeEntries.filter(c => c.id !== chequeId);
    const newBankBalance = (Number(bankDepositAmount) || 0) + amount;
    const newChequeTotal = updatedCheques.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);

    setChequeEntries(updatedCheques);
    setBankDepositAmount(newBankBalance);
    setChequesOnHand(newChequeTotal);

    await saveDailyReport({
      chequeEntries: updatedCheques,
      bankDepositAmount: newBankBalance,
      chequesOnHand: newChequeTotal
    });

    toast.success(`Cheque ${targetCheque.chequeNo} (LKR ${amount.toLocaleString()}) deposited into Bank!`);
  };

  const handleRemoveCheque = async (chequeId) => {
    const updatedCheques = chequeEntries.filter(c => c.id !== chequeId);
    const newChequeTotal = updatedCheques.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);

    setChequeEntries(updatedCheques);
    setChequesOnHand(newChequeTotal);

    await saveDailyReport({
      chequeEntries: updatedCheques,
      chequesOnHand: newChequeTotal
    });
  };

  // 4. ACTION: Record Withdrawal (Work / Expense money taken from Cash or Bank)
  const handleWithdrawalSubmit = async (e) => {
    e.preventDefault();
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0 || !withdrawDescription) {
      toast.error("Please enter a valid withdrawal amount and reason description");
      return;
    }

    let newCashBalance = Number(cashOnHand) || 0;
    let newBankBalance = Number(bankDepositAmount) || 0;

    if (withdrawType === 'cash') {
      newCashBalance = Math.max(0, newCashBalance - amount);
      setCashOnHand(newCashBalance);
      setCashInput(newCashBalance.toString());
    } else {
      newBankBalance = Math.max(0, newBankBalance - amount);
      setBankDepositAmount(newBankBalance);
    }

    const newWithdrawal = {
      id: Date.now(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      source: withdrawType,
      amount,
      description: withdrawDescription,
      user: user?.fullName || 'Manager'
    };

    const updatedWithdrawals = [newWithdrawal, ...withdrawals];
    setWithdrawals(updatedWithdrawals);

    setWithdrawAmount('');
    setWithdrawDescription('');

    await saveDailyReport({
      cashOnHand: newCashBalance,
      bankDepositAmount: newBankBalance,
      withdrawals: updatedWithdrawals
    });

    toast.success(`Withdrew LKR ${amount.toLocaleString()} from ${withdrawType.toUpperCase()} for "${withdrawDescription}"!`);
  };

  const handleRemoveWithdrawal = async (id) => {
    const updated = withdrawals.filter(w => w.id !== id);
    setWithdrawals(updated);
    await saveDailyReport({ withdrawals: updated });
  };

  return (
    <div className="space-y-6">
      
      {/* Header Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Landmark className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-xl font-bold font-heading text-slate-900 dark:text-slate-100">
              Cash & Bank Management
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Separate sections for Cash Balance, Bank Deposits, Cheque Register, and Work Withdrawals.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center space-x-2 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
            <Calendar size={16} className="text-slate-500" />
            <input 
              type="date" 
              value={selectedDate} 
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none"
            />
          </div>

          <Button 
            variant="primary" 
            onClick={() => persistChanges()} 
            disabled={isSaving || loading}
            className="flex items-center space-x-2"
          >
            <Save size={16} />
            <span>{isSaving ? 'Syncing...' : 'Save All Balances'}</span>
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-500 animate-pulse">
          Loading Cash & Bank Management for {selectedDate}...
        </div>
      ) : (
        <div className="space-y-6">

          {/* 4 SECTION CARDS GRID - 4-Column Landscape Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 landscape:grid-cols-4 gap-2.5 sm:gap-4">
            
            {/* 1. Cash Balance Card */}
            <div className="bg-emerald-500 text-white rounded-2xl p-3.5 sm:p-4 shadow-xs flex flex-col justify-between relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-emerald-100">01. Cash Balance</span>
                <Wallet className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-100" />
              </div>
              <div className="my-1.5">
                <p className="text-base sm:text-lg md:text-xl font-extrabold font-heading truncate">
                  LKR {(Number(cashOnHand) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
                <span className="text-[10px] text-emerald-100 block mt-0.5 truncate">Physical Cash in Till / Safe</span>
              </div>
              <span className="text-[9px] sm:text-[10px] bg-white/20 px-2 py-0.5 rounded font-semibold self-start text-white truncate">
                Auto-updated on Sales
              </span>
            </div>

            {/* 2. Bank Deposit Card */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 sm:p-4 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">02. Bank Deposit</span>
                <Landmark className="w-4 h-4 sm:w-5 sm:h-5 text-navy-600 dark:text-sky-400" />
              </div>
              <div className="my-1.5">
                <p className="text-base sm:text-lg md:text-xl font-extrabold font-heading text-slate-900 dark:text-slate-100 truncate">
                  LKR {(Number(bankDepositAmount) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
                <span className="text-[10px] text-slate-400 block mt-0.5 truncate">Funds in Bank Account</span>
              </div>
              <span className="text-[9px] sm:text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center truncate">
                <ArrowUpRight size={12} className="mr-0.5 shrink-0" /> Auto-increased on Deposits
              </span>
            </div>

            {/* 3. Cheque Prices Card */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 sm:p-4 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">03. Cheques</span>
                <CreditCard className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500" />
              </div>
              <div className="my-1.5">
                <p className="text-base sm:text-lg md:text-xl font-extrabold font-heading text-slate-900 dark:text-slate-100 truncate">
                  LKR {totalChequesValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
                <span className="text-[10px] text-slate-400 block mt-0.5 truncate">
                  {safeChequeEntries.length} Cheque{safeChequeEntries.length !== 1 ? 's' : ''} on Hand
                </span>
              </div>
              <span className="text-[9px] sm:text-[10px] text-amber-600 font-semibold truncate">
                Separate Cheque Register
              </span>
            </div>

            {/* 4. Withdrawals Card */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 sm:p-4 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">04. Withdrawals</span>
                <ArrowDownLeft className="w-4 h-4 sm:w-5 sm:h-5 text-rose-500" />
              </div>
              <div className="my-1.5">
                <p className="text-base sm:text-lg md:text-xl font-extrabold font-heading text-rose-600 dark:text-rose-400 truncate">
                  LKR {(((reportData?.cashDetails?.cashWithdrawals || 0) + (reportData?.cashDetails?.bankWithdrawals || 0))).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
                <span className="text-[10px] text-slate-400 block mt-0.5 truncate">
                  {safeWithdrawals.length} Withdrawal Log{safeWithdrawals.length !== 1 ? 's' : ''}
                </span>
              </div>
              <span className="text-[9px] sm:text-[10px] text-rose-500 font-semibold truncate">
                Cash: {(reportData?.cashDetails?.cashWithdrawals || 0).toLocaleString()} • Bank: {(reportData?.cashDetails?.bankWithdrawals || 0).toLocaleString()}
              </span>
            </div>

          </div>

          {/* MAIN 4 SECTIONS CONTENT GRID - Side by Side in Landscape */}
          <div className="grid grid-cols-1 lg:grid-cols-2 landscape:grid-cols-2 gap-4 sm:gap-6">


            {/* SECTION 1 & 2: Cash Balance Input & Bank Deposit Form */}
            <div className="space-y-6">
              
              {/* SECTION 1: Cash Balance Input & Inflows */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="flex items-center space-x-2">
                    <Wallet size={18} className="text-emerald-600" />
                    <h3 className="text-base font-bold font-heading text-slate-800 dark:text-slate-100">
                      Section 01: Cash Balance on Hand
                    </h3>
                  </div>
                  <span className="text-xs font-bold text-emerald-600">
                    Total Cash: LKR {(Number(cashOnHand) || 0).toLocaleString()}
                  </span>
                </div>

                <form onSubmit={handleSavePhysicalCash} className="space-y-3 text-xs">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      Enter Physical Cash in Till / Safe (LKR)
                    </label>
                    <div className="flex items-center space-x-2">
                      <input 
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={cashInput}
                        onChange={(e) => setCashInput(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 font-bold text-slate-900 dark:text-slate-100 focus:outline-none"
                        required
                      />
                      <Button type="submit" variant="primary" className="whitespace-nowrap py-2.5 px-4 rounded-xl font-bold">
                        Save Cash
                      </Button>
                    </div>
                  </div>
                </form>

                <div className="grid grid-cols-3 gap-2 text-xs pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
                    <span className="text-[10px] text-slate-400 font-semibold uppercase block">Cash Sales</span>
                    <span className="font-bold text-emerald-600 text-xs mt-0.5 block">
                      +LKR {cashSalesAmount.toLocaleString()}
                    </span>
                  </div>

                  <div className="p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
                    <span className="text-[10px] text-slate-400 font-semibold uppercase block">Debt Recovered</span>
                    <span className="font-bold text-sky-600 text-xs mt-0.5 block">
                      +LKR {creditAmountReceived.toLocaleString()}
                    </span>
                  </div>

                  <div className="p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
                    <span className="text-[10px] text-slate-400 font-semibold uppercase block">Other Receipts</span>
                    <span className="font-bold text-amber-600 text-xs mt-0.5 block">
                      +LKR {otherReceipts.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* SECTION 2: Bank Deposit Form */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
                <div className="flex items-center space-x-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <Landmark className="w-5 h-5 text-navy-600 dark:text-sky-400" />
                  <div>
                    <h3 className="text-base font-bold font-heading text-slate-800 dark:text-slate-100">
                      Section 02: Bank Deposit
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Deposits cash into Bank (Bank = Bank + Deposit) and deducts from Cash (Cash = Cash - Deposit).
                    </p>
                  </div>
                </div>

                <form onSubmit={handleBankDepositSubmit} className="space-y-4 text-xs">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      Amount Newly Deposited to Bank (LKR)
                    </label>
                    <input 
                      type="number"
                      step="0.01"
                      min="1"
                      placeholder="e.g. 50000"
                      value={depositInput}
                      onChange={(e) => setDepositInput(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 font-bold text-slate-900 dark:text-slate-100 focus:outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      Bank Name / Reference Note (Optional)
                    </label>
                    <input 
                      type="text"
                      placeholder="e.g. Commercial Bank - Main Branch Deposit Slip #401"
                      value={depositBankRef}
                      onChange={(e) => setDepositBankRef(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs font-medium focus:outline-none"
                    />
                  </div>

                  <Button type="submit" variant="primary" className="w-full py-2.5 rounded-xl font-bold flex justify-center items-center space-x-2">
                    <Landmark size={16} />
                    <span>Deposit Cash into Bank (Deduct from Cash Balance)</span>
                  </Button>
                </form>
              </div>

            </div>

            {/* SECTION 3 & 4: Cheque Prices Section & Withdraw Money Section */}
            <div className="space-y-6">

              {/* SECTION 3: Cheque Prices / Register Section */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="flex items-center space-x-2">
                    <CreditCard className="w-5 h-5 text-amber-500" />
                    <h3 className="text-base font-bold font-heading text-slate-800 dark:text-slate-100">
                      Section 03: Cheque Prices Register
                    </h3>
                  </div>
                  <span className="text-xs font-bold text-amber-600">
                    Total: LKR {totalChequesValue.toLocaleString()}
                  </span>
                </div>

                {/* Add Cheque Form */}
                <form onSubmit={handleAddCheque} className="grid grid-cols-2 gap-2 text-xs">
                  <input 
                    type="text"
                    placeholder="Cheque No."
                    value={chequeNo}
                    onChange={(e) => setChequeNo(e.target.value)}
                    className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 font-mono text-xs focus:outline-none"
                    required
                  />
                  <input 
                    type="text"
                    placeholder="Bank Name"
                    value={chequeBank}
                    onChange={(e) => setChequeBank(e.target.value)}
                    className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none"
                  />
                  <input 
                    type="number"
                    step="0.01"
                    placeholder="Amount (LKR)"
                    value={chequeAmount}
                    onChange={(e) => setChequeAmount(e.target.value)}
                    className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 font-bold text-xs focus:outline-none"
                    required
                  />
                  <input 
                    type="text"
                    placeholder="Customer / Payer Name"
                    value={chequePayer}
                    onChange={(e) => setChequePayer(e.target.value)}
                    className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none"
                  />
                  <div className="col-span-2">
                    <Button type="submit" size="sm" variant="secondary" className="w-full flex justify-center items-center space-x-1">
                      <Plus size={14} />
                      <span>Save Cheque Record</span>
                    </Button>
                  </div>
                </form>

                {/* Cheques Table */}
                {safeChequeEntries.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-2">No cheque records saved for today.</p>
                ) : (
                  <div className="overflow-x-auto max-h-40 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase text-[10px]">
                          <th className="py-1.5">Cheque No</th>
                          <th className="py-1.5">Bank</th>
                          <th className="py-1.5">Payer</th>
                          <th className="py-1.5 text-right">Amount</th>
                          <th className="py-1.5 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {safeChequeEntries.map((c) => (
                          <tr key={c.id}>
                            <td className="py-1.5 font-mono text-slate-800 dark:text-slate-200">{c.chequeNo}</td>
                            <td className="py-1.5 text-slate-500">{c.bankName}</td>
                            <td className="py-1.5 font-medium">{c.payerName}</td>
                            <td className="py-1.5 text-right font-bold text-amber-600">LKR {Number(c.amount).toLocaleString()}</td>
                            <td className="py-1.5 text-right space-x-1">
                              <button 
                                onClick={() => handleDepositCheque(c.id)}
                                title="Deposit cheque to Bank"
                                className="px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold rounded"
                              >
                                Deposit
                              </button>
                              <button 
                                onClick={() => handleRemoveCheque(c.id)}
                                className="p-1 text-rose-500 hover:bg-rose-50 rounded"
                              >
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

              {/* SECTION 4: Withdraw Section (Money taken from Bank or Cash for work) */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
                <div className="flex items-center space-x-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <ArrowDownLeft className="w-5 h-5 text-rose-500" />
                  <div>
                    <h3 className="text-base font-bold font-heading text-slate-800 dark:text-slate-100">
                      Section 04: Withdraw Money (Work Expenses)
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Record money taken from Cash or Bank for factory work & expenses.
                    </p>
                  </div>
                </div>

                <form onSubmit={handleWithdrawalSubmit} className="space-y-3 text-xs">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                        Select Source Type
                      </label>
                      <select 
                        value={withdrawType}
                        onChange={(e) => setWithdrawType(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none"
                      >
                        <option value="cash">Cash Balance</option>
                        <option value="bank">Bank Deposit Balance</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                        Withdrawal Amount (LKR)
                      </label>
                      <input 
                        type="number"
                        step="0.01"
                        min="1"
                        placeholder="e.g. 5000"
                        value={withdrawAmount}
                        onChange={(e) => setWithdrawAmount(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 font-bold text-xs text-slate-900 dark:text-slate-100 focus:outline-none"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      Description / Reason for Withdrawal
                    </label>
                    <input 
                      type="text"
                      placeholder="e.g. Diesel fuel purchase, Factory repair material, Staff advance"
                      value={withdrawDescription}
                      onChange={(e) => setWithdrawDescription(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none"
                      required
                    />
                  </div>

                  <Button type="submit" variant="danger" className="w-full py-2 rounded-xl font-bold flex justify-center items-center space-x-2">
                    <ArrowDownLeft size={16} />
                    <span>Record Withdrawal (Deduct from {withdrawType.toUpperCase()})</span>
                  </Button>
                </form>

                {/* Withdrawals Log Table */}
                {safeWithdrawals.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-2">No money withdrawals logged for today.</p>
                ) : (
                  <div className="overflow-x-auto max-h-40 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase text-[10px]">
                          <th className="py-1.5">Time</th>
                          <th className="py-1.5">Source</th>
                          <th className="py-1.5">Reason / Description</th>
                          <th className="py-1.5 text-right">Amount</th>
                          <th className="py-1.5 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {safeWithdrawals.map((w) => (
                          <tr key={w.id}>
                            <td className="py-1.5 font-mono text-slate-400">{w.time}</td>
                            <td className="py-1.5">
                              <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase rounded ${
                                w.source === 'cash' ? 'bg-emerald-100 text-emerald-800' : 'bg-sky-100 text-sky-800'
                              }`}>
                                {w.source}
                              </span>
                            </td>
                            <td className="py-1.5 font-medium">{w.description}</td>
                            <td className="py-1.5 text-right font-bold text-rose-600">LKR {Number(w.amount).toLocaleString()}</td>
                            <td className="py-1.5 text-right">
                              <button onClick={() => handleRemoveWithdrawal(w.id)} className="p-1 text-rose-500 hover:bg-rose-50 rounded">
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

    </div>
  );
}
