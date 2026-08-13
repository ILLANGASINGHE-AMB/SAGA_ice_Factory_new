import React, { useState, useEffect } from 'react';
import { useDailyReport } from '../hooks/useDailyReport';
import { useToast } from '../components/Toast';
import { Button } from '../components/Button';
import { Input } from '../components/FormFields';
import { 
  Building2, 
  Landmark, 
  Wallet, 
  CreditCard, 
  DollarSign, 
  Save, 
  Calendar, 
  ArrowUpRight, 
  CheckCircle2, 
  TrendingUp, 
  Receipt 
} from 'lucide-react';

export function CashBankPage() {
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const { loading, reportData, manualInputs, saveDailyReport } = useDailyReport(selectedDate);
  const toast = useToast();

  const [bankDepositAmount, setBankDepositAmount] = useState(0);
  const [cashOnHand, setCashOnHand] = useState(0);
  const [chequesOnHand, setChequesOnHand] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (manualInputs) {
      setBankDepositAmount(manualInputs.bankDepositAmount || 0);
      setCashOnHand(manualInputs.cashOnHand || 0);
      setChequesOnHand(manualInputs.chequesOnHand || 0);
    }
  }, [manualInputs, selectedDate]);

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    try {
      setIsSaving(true);
      await saveDailyReport({
        bankDepositAmount: Number(bankDepositAmount) || 0,
        cashOnHand: Number(cashOnHand) || 0,
        chequesOnHand: Number(chequesOnHand) || 0
      });
      toast.success(`Cash & Bank details saved for ${selectedDate}!`);
    } catch (err) {
      toast.error(err.message || "Failed to save Cash & Bank details");
    } finally {
      setIsSaving(false);
    }
  };

  const totalLiquidAssets = (Number(bankDepositAmount) || 0) + (Number(cashOnHand) || 0) + (Number(chequesOnHand) || 0);

  return (
    <div className="space-y-6">
      
      {/* Header Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Landmark className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-xl font-bold font-heading text-slate-900 dark:text-slate-100">
              Cash & Bank Details
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Linked directly with Section 06 of the Daily Manager Report.
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
            onClick={handleSave} 
            disabled={isSaving || loading}
            className="flex items-center space-x-2"
          >
            <Save size={16} />
            <span>{isSaving ? 'Saving...' : 'Save Cash & Bank Entry'}</span>
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-500 animate-pulse">
          Loading Cash & Bank Reconciliation for {selectedDate}...
        </div>
      ) : (
        <div className="space-y-6">

          {/* Liquid Assets Summary Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            <div className="bg-emerald-500 text-white rounded-2xl p-5 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-100">Total Liquid Assets</span>
                <Wallet className="w-5 h-5 text-emerald-100" />
              </div>
              <p className="text-2xl font-extrabold font-heading mt-3">
                LKR {totalLiquidAssets.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
              <span className="text-[10px] text-emerald-100 mt-1">Bank + Cash + Cheques</span>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-bold uppercase tracking-wider">Bank Deposit</span>
                <Landmark className="w-5 h-5 text-navy-600 dark:text-sky-400" />
              </div>
              <p className="text-xl font-bold font-heading text-slate-900 dark:text-slate-100 mt-2">
                LKR {(Number(bankDepositAmount) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
              <span className="text-[10px] text-slate-400 mt-1">Deposited in Bank Today</span>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-bold uppercase tracking-wider">Cash on Hand</span>
                <Wallet className="w-5 h-5 text-emerald-600" />
              </div>
              <p className="text-xl font-bold font-heading text-slate-900 dark:text-slate-100 mt-2">
                LKR {(Number(cashOnHand) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
              <span className="text-[10px] text-slate-400 mt-1">Physical Cash in Safe/Till</span>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-bold uppercase tracking-wider font-heading">Cheques on Hand</span>
                <CreditCard className="w-5 h-5 text-amber-500" />
              </div>
              <p className="text-xl font-bold font-heading text-slate-900 dark:text-slate-100 mt-2">
                LKR {(Number(chequesOnHand) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
              <span className="text-[10px] text-slate-400 mt-1">Undeposited Customer Cheques</span>
            </div>

          </div>

          {/* Main Reconciliation & Entry Form */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Form Inputs Section */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-5">
              <div className="flex items-center space-x-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                <Building2 className="w-5 h-5 text-navy-600 dark:text-sky-400" />
                <h3 className="text-base font-bold font-heading text-slate-800 dark:text-slate-100">
                  Daily Reconciliation Entry ({selectedDate})
                </h3>
              </div>

              <form onSubmit={handleSave} className="space-y-4 text-xs">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">
                    Amount Deposited in Bank (LKR)
                  </label>
                  <input 
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={bankDepositAmount}
                    onChange={(e) => setBankDepositAmount(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 dark:text-slate-100 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">
                    Cash Balance on Hand (LKR)
                  </label>
                  <input 
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={cashOnHand}
                    onChange={(e) => setCashOnHand(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 dark:text-slate-100 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">
                    Value of Cheques on Hand (LKR)
                  </label>
                  <input 
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={chequesOnHand}
                    onChange={(e) => setChequesOnHand(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 dark:text-slate-100 focus:outline-none"
                  />
                </div>

                <div className="pt-3">
                  <Button variant="primary" type="submit" disabled={isSaving} className="w-full py-2.5 rounded-xl font-bold flex justify-center items-center space-x-2">
                    <Save size={16} />
                    <span>{isSaving ? 'Saving Entry...' : 'Save & Sync with Daily Report'}</span>
                  </Button>
                </div>
              </form>
            </div>

            {/* Auto System Cash Inflow Reference */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
              <div className="flex items-center space-x-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                <TrendingUp className="w-5 h-5 text-emerald-600" />
                <h3 className="text-base font-bold font-heading text-slate-800 dark:text-slate-100">
                  Live Cash Inflows for {selectedDate}
                </h3>
              </div>

              <div className="space-y-3 text-xs">
                <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl flex items-center justify-between border border-slate-200/60 dark:border-slate-700/60">
                  <div className="flex items-center space-x-2">
                    <Receipt size={16} className="text-emerald-500" />
                    <div>
                      <span className="font-semibold text-slate-800 dark:text-slate-200 block">Cash Sales Inflow</span>
                      <span className="text-[10px] text-slate-400">Direct sales paid in cash</span>
                    </div>
                  </div>
                  <span className="font-bold font-mono text-sm text-emerald-600">
                    LKR {reportData.incomeDetails.cashSalesAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl flex items-center justify-between border border-slate-200/60 dark:border-slate-700/60">
                  <div className="flex items-center space-x-2">
                    <CreditCard size={16} className="text-sky-500" />
                    <div>
                      <span className="font-semibold text-slate-800 dark:text-slate-200 block">Debt Recoveries</span>
                      <span className="text-[10px] text-slate-400">Credit settlements collected today</span>
                    </div>
                  </div>
                  <span className="font-bold font-mono text-sm text-sky-600">
                    LKR {reportData.incomeDetails.creditAmountReceived.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl flex items-center justify-between border border-slate-200/60 dark:border-slate-700/60">
                  <div className="flex items-center space-x-2">
                    <DollarSign size={16} className="text-amber-500" />
                    <div>
                      <span className="font-semibold text-slate-800 dark:text-slate-200 block">Other Receipts</span>
                      <span className="text-[10px] text-slate-400 font-medium">Miscellaneous income</span>
                    </div>
                  </div>
                  <span className="font-bold font-mono text-sm text-amber-600">
                    LKR {reportData.incomeDetails.otherReceipts.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 rounded-xl border border-emerald-200 dark:border-emerald-900/50 flex items-center justify-between">
                  <span className="font-bold text-xs text-emerald-800 dark:text-emerald-300 uppercase tracking-wider">Total Cash Income</span>
                  <span className="font-extrabold font-heading text-lg text-emerald-600 dark:text-emerald-400">
                    LKR {reportData.incomeDetails.totalIncome.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

          </div>

        </div>
      )}
    </div>
  );
}
