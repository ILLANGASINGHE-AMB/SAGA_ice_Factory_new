import React, { useState, useEffect } from 'react';
import { useDailyReport } from '../hooks/useDailyReport';
import { useSettings } from '../hooks/useSettings';
import { useAuth } from '../context/AuthContext';
import { todayStr } from '../utils/date';
import { useToast } from '../components/Toast';
import { Button } from '../components/Button';
import { generateDailyManagerReportPDF } from '../utils/pdfGenerator';
import {
  ClipboardCheck,
  Save,
  Download,
  Calendar,
  CheckCircle2,
  Boxes,
  DollarSign,
  CreditCard,
  Receipt,
  Users,
  Truck,
  Clock,
  StickyNote
} from 'lucide-react';

export function DailyManagerReportView() {
  const [fromDate, setFromDate] = useState(todayStr);
  const [toDate, setToDate] = useState(todayStr);
  const [fromTime, setFromTime] = useState('00:00');
  const [toTime, setToTime] = useState('23:59');
  const { loading, reportData, manualInputs, isVerified, savedRecord, saveDailyReport } = useDailyReport(fromDate, toDate, fromTime, toTime);
  const { settings } = useSettings();
  const { isAdmin, user } = useAuth();
  const toast = useToast();

  // Local form state synced with manualInputs — only Free Issue and Damaged
  // Cubes are manager-editable in Section 01; the rest there is read-only.
  const [freeIssue, setFreeIssue] = useState(0);
  const [damagedCubes, setDamagedCubes] = useState(0);
  const [otherReceipts, setOtherReceipts] = useState(0);
  const [otherDetails, setOtherDetails] = useState('');
  const [verifiedBy, setVerifiedBy] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Once a day's report carries a verifying manager's name it is a signed
  // declaration, so its manager entries lock. An admin can reopen it to make a
  // correction — everyone else sees a read-only record.
  // The unlock is scoped to the exact range it was granted for, so moving to
  // another day re-locks automatically rather than leaving it editable.
  const rangeKey = `${fromDate}|${toDate}`;
  const [unlockedRange, setUnlockedRange] = useState(null);
  const isLocked = isVerified && unlockedRange !== rangeKey;

  useEffect(() => {
    if (manualInputs) {
      setFreeIssue(manualInputs.freeIssue || 0);
      setDamagedCubes(manualInputs.damagedCubes || 0);
      setOtherReceipts(manualInputs.otherReceipts || 0);
      setOtherDetails(manualInputs.otherDetails || '');
      setVerifiedBy(manualInputs.verifiedBy || user?.fullName || '');
    }
  }, [manualInputs, fromDate, toDate, user?.fullName]);

  // Handle Save
  const handleSave = async () => {
    try {
      setIsSaving(true);
      await saveDailyReport({
        freeIssue: Number(freeIssue) || 0,
        damagedCubes: Number(damagedCubes) || 0,
        otherReceipts: Number(otherReceipts) || 0,
        otherDetails,
        verifiedBy
      });
      toast.success(`Daily Report for ${fromDate} saved successfully!`);
    } catch (err) {
      toast.error(err.message || "Failed to save Daily Report");
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Download PDF
  const handleDownloadPDF = () => {
    try {
      const doc = generateDailyManagerReportPDF(reportData, settings);
      doc.save(`Daily_Report_${fromDate}_to_${toDate}.pdf`);
      toast.info(`Downloaded Daily Report PDF for ${fromDate} to ${toDate}`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate PDF");
    }
  };

  const dateRangeLabel = fromDate === toDate ? fromDate : `${fromDate} to ${toDate}`;

  return (
    <div className="space-y-6">
      {/* Top Header Card & Actions */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <ClipboardCheck className="w-6 h-6 text-navy-600 dark:text-sky-400" />
            <h2 className="text-xl font-bold font-heading text-slate-900 dark:text-slate-100">
              Daily Manager Report
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Auto-populated from system sales, debts, and production logs with manager entries.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center space-x-2 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
            <Calendar size={16} className="text-slate-500" />
            <input
              type="date"
              value={fromDate}
              max={toDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none"
            />
            <span className="text-xs text-slate-400">to</span>
            <input
              type="date"
              value={toDate}
              min={fromDate}
              onChange={(e) => setToDate(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none"
            />
          </div>

          <div className="flex items-center space-x-2 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
            <Clock size={16} className="text-slate-500" />
            <input
              type="time"
              value={fromTime}
              onChange={(e) => setFromTime(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none"
            />
            <span className="text-xs text-slate-400">to</span>
            <input
              type="time"
              value={toTime}
              onChange={(e) => setToTime(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none"
            />
          </div>

          <Button
            variant="secondary"
            onClick={handleSave}
            disabled={isSaving || loading || isLocked}
            title={isLocked ? 'This report is verified and locked' : undefined}
            className="flex items-center space-x-2"
          >
            <Save size={16} />
            <span>{isSaving ? 'Saving...' : isLocked ? 'Verified & Locked' : 'Save Data'}</span>
          </Button>

          <Button
            variant="primary"
            onClick={handleDownloadPDF}
            disabled={loading}
            className="flex items-center space-x-2"
          >
            <Download size={16} />
            <span>Export PDF</span>
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-500 animate-pulse">
          Compiling Daily Manager Report metrics...
        </div>
      ) : (
        <div className="space-y-6">

          {/* SECTION 01: Stock / Production Details */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center space-x-2 font-heading font-bold text-sm text-slate-800 dark:text-slate-100">
                <Boxes size={18} className="text-navy-600 dark:text-sky-400" />
                <span>01. STOCK / PRODUCTION DETAILS</span>
              </div>
              <span className="text-xs text-slate-400">Live Auto-Calculated + Manager Entries</span>
            </div>

              {/* High Density Stock Balance Chips - 8-Col Landscape Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 landscape:grid-cols-8 gap-2 text-xs">
                <div className="bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-[10px] text-slate-500 uppercase font-semibold block truncate">Prev Bal</span>
                  <p className="font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100 mt-0.5 truncate">
                    {reportData.stockDetails.previousDayBalance.toLocaleString()}
                  </p>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-[10px] text-emerald-600 font-semibold uppercase block truncate">Production</span>
                  <p className="font-bold text-xs sm:text-sm text-emerald-600 dark:text-emerald-400 mt-0.5 truncate">
                    +{reportData.stockDetails.todaysProduction.toLocaleString()}
                  </p>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-[10px] text-slate-500 uppercase font-semibold block truncate">Purchases</span>
                  <p className="font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100 mt-0.5 truncate">
                    +{reportData.stockDetails.todaysPurchase.toLocaleString()}
                  </p>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-700/60" title="View only — never included in Closing Balance">
                  <span className="text-[10px] text-amber-600 font-semibold uppercase block truncate">Brine (View Only)</span>
                  <p className="font-bold text-xs sm:text-sm text-amber-600 dark:text-amber-400 mt-0.5 truncate">
                    {reportData.stockDetails.brineCubes.toLocaleString()}
                  </p>
                </div>

                <div className="bg-amber-50/50 dark:bg-amber-950/20 p-2 rounded-xl border border-amber-200 dark:border-amber-900/50">
                  <label className="text-[10px] text-amber-700 dark:text-amber-400 font-semibold uppercase block truncate">Free Issue</label>
                  <input
                    type="number"
                    value={freeIssue}
                    onChange={(e) => setFreeIssue(e.target.value)}
                    disabled={isLocked}
                    className="w-full mt-0.5 disabled:opacity-60 disabled:cursor-not-allowed bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-800 rounded px-1.5 py-0.5 text-xs font-bold focus:outline-none"
                  />
                </div>

                <div className="bg-rose-50/50 dark:bg-rose-950/20 p-2 rounded-xl border border-rose-200 dark:border-rose-900/50">
                  <label className="text-[10px] text-rose-700 dark:text-rose-400 font-semibold uppercase block truncate">Damaged</label>
                  <input
                    type="number"
                    value={damagedCubes}
                    onChange={(e) => setDamagedCubes(e.target.value)}
                    disabled={isLocked}
                    className="w-full mt-0.5 disabled:opacity-60 disabled:cursor-not-allowed bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-800 rounded px-1.5 py-0.5 text-xs font-bold focus:outline-none"
                  />
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-[10px] text-rose-600 font-semibold uppercase block truncate">Sales</span>
                  <p className="font-bold text-xs sm:text-sm text-rose-600 dark:text-rose-400 mt-0.5 truncate">
                    -{reportData.stockDetails.todaysSalesQty.toLocaleString()}
                  </p>
                </div>

                <div className="bg-navy-50 dark:bg-navy-950/40 p-2.5 rounded-xl border border-navy-200 dark:border-navy-900/50">
                  <span className="text-[10px] text-navy-700 dark:text-sky-300 font-bold uppercase block truncate">Closing Bal</span>
                  <p className="font-bold text-xs sm:text-sm text-navy-700 dark:text-sky-300 mt-0.5 truncate">
                    {reportData.stockDetails.closingBalance.toLocaleString()}
                  </p>
                </div>
              </div>

              {/* No of Cubes Sent to Branch — one line per branch saved in Settings, plus a total */}
              <div className="pt-2 space-y-1">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">No of Cubes Sent to Branch:</span>
                {reportData.stockDetails.branchSalesList.length === 0 ? (
                  <p className="text-xs text-slate-400">No cubes sent to any branch for {dateRangeLabel}.</p>
                ) : (
                  <div className="space-y-0.5 max-w-xs">
                    {reportData.stockDetails.branchSalesList.map((b, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs">
                        <span className="text-slate-600 dark:text-slate-400">No of Cubes Sent to {b.branchName}</span>
                        <span className="font-bold font-mono text-navy-700 dark:text-sky-300">{b.quantity.toLocaleString()}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between text-xs pt-1 mt-1 border-t border-slate-200 dark:border-slate-800 font-bold">
                      <span className="text-slate-700 dark:text-slate-300">Total Cubes Sent:-</span>
                      <span className="text-navy-700 dark:text-sky-300">{reportData.stockDetails.branchCubes.toLocaleString()}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* SECTION 02: Income Details - 5-Col Landscape Grid */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
                <div className="flex items-center space-x-2 font-heading font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-100">
                  <DollarSign size={18} className="text-emerald-500" />
                  <span>02. INCOME DETAILS</span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 landscape:grid-cols-5 gap-2.5 text-xs">
                <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-[10px] text-slate-500 font-semibold uppercase block truncate">Cash Sold Qty</span>
                  <p className="font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100 mt-0.5 truncate">
                    {reportData.incomeDetails.cashSoldQty.toLocaleString()} cubes
                  </p>
                </div>

                <div className="p-2.5 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-xl border border-emerald-200 dark:border-emerald-900/50">
                  <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold uppercase block truncate">Cash Received</span>
                  <p className="font-bold text-xs sm:text-sm text-emerald-600 dark:text-emerald-400 mt-0.5 truncate">
                    LKR {reportData.incomeDetails.cashSalesAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                </div>

                <div className="p-2.5 bg-sky-50/50 dark:bg-sky-950/20 rounded-xl border border-sky-200 dark:border-sky-900/50">
                  <span className="text-[10px] text-sky-700 dark:text-sky-400 font-semibold uppercase block truncate">Credit Received</span>
                  <p className="font-bold text-xs sm:text-sm text-sky-600 dark:text-sky-400 mt-0.5 truncate">
                    LKR {reportData.incomeDetails.creditAmountReceived.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                </div>

                <div className="p-2 bg-amber-50/50 dark:bg-amber-950/20 rounded-xl border border-amber-200 dark:border-amber-900/50">
                  <label className="text-[10px] text-amber-700 dark:text-amber-400 font-semibold uppercase block truncate">Other Receipts</label>
                  <input
                    type="number"
                    value={otherReceipts}
                    onChange={(e) => setOtherReceipts(e.target.value)}
                    disabled={isLocked}
                    className="w-full mt-0.5 disabled:opacity-60 disabled:cursor-not-allowed bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-800 rounded px-1.5 py-0.5 text-xs font-bold focus:outline-none"
                  />
                </div>

                <div className="p-2.5 bg-emerald-500 text-white rounded-xl shadow-xs">
                  <span className="text-[10px] uppercase font-bold text-emerald-100 block truncate">Total Income</span>
                  <p className="font-bold text-xs sm:text-sm mt-0.5 truncate">
                    LKR {reportData.incomeDetails.totalIncome.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            </div>

            {/* SECTION 03 & 04: Credit Details Tables Grid - Side by Side in Landscape */}
            <div className="grid grid-cols-1 lg:grid-cols-2 landscape:grid-cols-2 gap-4 sm:gap-6">


            {/* 03. Debt Details */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center space-x-2 font-heading font-bold text-sm text-slate-800 dark:text-slate-100">
                  <CreditCard size={18} className="text-amber-500" />
                  <span>03. DEBT DETAILS</span>
                </div>
                <span className="text-xs font-bold text-amber-600">
                  Total: LKR {reportData.totalCreditGivenAmount.toLocaleString()}
                </span>
              </div>

              {reportData.creditGivenList.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">No debt given recorded for {dateRangeLabel}.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase text-[10px]">
                        <th className="py-2">No.</th>
                        <th className="py-2">Customer Name</th>
                        <th className="py-2">Phone No</th>
                        <th className="py-2 text-right">Cubes</th>
                        <th className="py-2 text-right">Amount (LKR)</th>
                        <th className="py-2 text-right">Debt Balance (LKR)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {reportData.creditGivenList.map(c => (
                        <tr key={c.no}>
                          <td className="py-2 font-mono text-slate-400">{c.no}</td>
                          <td className="py-2 font-medium">{c.customerName}</td>
                          <td className="py-2 text-slate-500">{c.phone}</td>
                          <td className="py-2 text-right font-mono">{c.quantity}</td>
                          <td className="py-2 text-right font-bold text-slate-800 dark:text-slate-200">
                            {c.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-2 text-right font-mono text-amber-600">
                            {c.totalDebtBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* 04. Debt Settle Details */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center space-x-2 font-heading font-bold text-sm text-slate-800 dark:text-slate-100">
                  <Receipt size={18} className="text-sky-500" />
                  <span>04. DEBT SETTLE DETAILS</span>
                </div>
                <span className="text-xs font-bold text-sky-600">
                  Collected: LKR {reportData.totalCreditCollectedAmount.toLocaleString()}
                </span>
              </div>

              {reportData.creditCollectionList.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">No debt settlements collected for {dateRangeLabel}.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase text-[10px]">
                        <th className="py-2">Customer</th>
                        <th className="py-2">Method</th>
                        <th className="py-2">Settlement Date</th>
                        <th className="py-2 text-right">Debt Amount</th>
                        <th className="py-2 text-right">Paid</th>
                        <th className="py-2 text-right">Remaining</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {reportData.creditCollectionList.map((c, i) => (
                        <tr key={i}>
                          <td className="py-2 font-medium">{c.name}</td>
                          <td className="py-2 text-slate-500">{c.method}</td>
                          <td className="py-2 text-slate-500">{c.settlementDate}</td>
                          <td className="py-2 text-right font-mono text-slate-500">
                            LKR {c.debtAmount.toLocaleString()}
                          </td>
                          <td className="py-2 text-right font-bold text-emerald-600">
                            LKR {c.amountReceived.toLocaleString()}
                          </td>
                          <td className="py-2 text-right font-mono text-slate-500">
                            LKR {c.outstandingAmount.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>

          {/* SECTION 05: Expense Details & SECTION 06: Cash & Bank Details */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* 05. Expenses (2 cols) */}
            <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center space-x-2 font-heading font-bold text-sm text-slate-800 dark:text-slate-100">
                  <Receipt size={18} className="text-rose-500" />
                  <span>05. EXPENSE DETAILS</span>
                </div>
                <span className="text-xs font-bold text-rose-600">
                  Total: LKR {reportData.totalExpensesAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>

              {reportData.expenseList.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">No expenses logged for {dateRangeLabel}.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase text-[10px]">
                        <th className="py-2">No.</th>
                        <th className="py-2">Date</th>
                        <th className="py-2">Description</th>
                        <th className="py-2">Category</th>
                        <th className="py-2">Type</th>
                        <th className="py-2 text-right">Amount (LKR)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {reportData.expenseList.map((e) => (
                        <tr key={e.no}>
                          <td className="py-2 font-mono text-slate-400">{e.no}</td>
                          <td className="py-2 text-slate-500">{e.date}</td>
                          <td className="py-2 font-medium">{e.description}</td>
                          <td className="py-2 text-slate-500">{e.category}</td>
                          <td className="py-2 text-slate-500">{e.expenseType}</td>
                          <td className="py-2 text-right font-bold">{e.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* 06. Bank Deposit Details (1 col) — fully derived from the real
                Cash & Bank ledger (Cash Balance / Bank Balance / Hand
                Cheques are three separate stores of value, never summed) */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center space-x-2 font-heading font-bold text-sm text-slate-800 dark:text-slate-100">
                  <DollarSign size={18} className="text-emerald-600" />
                  <span>06. BANK DEPOSIT DETAILS</span>
                </div>
                <span className="text-[10px] bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 font-bold px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                  Live from Cash & Bank
                </span>
              </div>

              <div className="space-y-3 text-xs">
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">
                    Amount Deposited ({dateRangeLabel})
                  </span>
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-100 block mt-0.5">
                    LKR {reportData.cashDetails.amountDeposited.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="p-3 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-xl border border-emerald-200 dark:border-emerald-900/50">
                  <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 block">
                    Cash Balance (as of {toDate})
                  </span>
                  <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400 block mt-0.5">
                    LKR {reportData.cashDetails.cashBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="p-3 bg-sky-50/50 dark:bg-sky-950/20 rounded-xl border border-sky-200 dark:border-sky-900/50">
                  <span className="text-[11px] font-semibold text-sky-700 dark:text-sky-400 block">
                    Bank Balance (as of {toDate})
                  </span>
                  <span className="text-sm font-bold text-sky-700 dark:text-sky-400 block mt-0.5">
                    LKR {reportData.cashDetails.bankBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="p-3 bg-amber-50/50 dark:bg-amber-950/20 rounded-xl border border-amber-200 dark:border-amber-900/50">
                  <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 block">
                    Hand Cheque Amount (as of {toDate})
                  </span>
                  <span className="text-sm font-bold text-amber-700 dark:text-amber-400 block mt-0.5">
                    LKR {reportData.cashDetails.handChequesTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

          </div>

          {/* SECTION 07: Employee Details */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center space-x-2 font-heading font-bold text-sm text-slate-800 dark:text-slate-100">
                <Users size={18} className="text-navy-600 dark:text-sky-400" />
                <span>07. EMPLOYEE DETAILS</span>
              </div>
              <span className="text-[10px] bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 font-bold px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                From Employee Attendance History
              </span>
            </div>

            {reportData.employeeAttendanceList.length === 0 ? (
              <p className="text-xs text-slate-400 py-3 text-center">No employee attendance recorded for {dateRangeLabel}.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase text-[10px]">
                      <th className="py-2">Employee Name</th>
                      <th className="py-2">Date</th>
                      <th className="py-2">Start Time</th>
                      <th className="py-2">End Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {reportData.employeeAttendanceList.map((emp, index) => (
                      <tr key={index}>
                        <td className="py-2 font-medium">{emp.employeeName}</td>
                        <td className="py-2 text-slate-500">{emp.date}</td>
                        <td className="py-2 font-mono">{emp.startTime}</td>
                        <td className="py-2 font-mono">{emp.endTime}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* SECTION 08: Vehicle Details */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center space-x-2 font-heading font-bold text-sm text-slate-800 dark:text-slate-100">
                <Truck size={18} className="text-amber-500" />
                <span>08. VEHICLE DETAILS</span>
              </div>
              <span className="text-xs font-bold text-amber-600">
                Total Distance: {reportData.totalVehicleDistance.toLocaleString()} km
              </span>
            </div>

            {reportData.vehicleTripList.length === 0 ? (
              <p className="text-xs text-slate-400 py-3 text-center">No vehicle trips recorded for {dateRangeLabel}.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase text-[10px]">
                      <th className="py-2">No.</th>
                      <th className="py-2">Trip ID</th>
                      <th className="py-2">Date</th>
                      <th className="py-2">Description</th>
                      <th className="py-2 text-right">Start Km</th>
                      <th className="py-2 text-right">End Km</th>
                      <th className="py-2 text-right">Distance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {reportData.vehicleTripList.map((trip) => (
                      <tr key={trip.no}>
                        <td className="py-2 font-mono text-slate-400">{trip.no}</td>
                        <td className="py-2 font-mono">{trip.tripId}</td>
                        <td className="py-2 text-slate-500">{trip.date}</td>
                        <td className="py-2 font-medium">{trip.description || '-'}</td>
                        <td className="py-2 text-right font-mono">{trip.startKm.toLocaleString()}</td>
                        <td className="py-2 text-right font-mono">{trip.endKm !== null ? trip.endKm.toLocaleString() : '-'}</td>
                        <td className="py-2 text-right font-bold">{trip.distance !== null ? `${trip.distance.toLocaleString()} km` : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* SECTION 09 & 10: Notes & Declaration */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* 09. Notes */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-3">
              <div className="flex items-center space-x-2 font-heading font-bold text-sm text-slate-800 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-3">
                <StickyNote size={18} className="text-slate-500" />
                <span>09. NOTES</span>
              </div>

              {reportData.notesList.length === 0 ? (
                <p className="text-xs text-slate-400 py-2 text-center">No notes recorded for {dateRangeLabel}.</p>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {reportData.notesList.map((n, idx) => (
                    <div key={idx} className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60 rounded-xl p-2.5 text-xs">
                      <p className="text-slate-800 dark:text-slate-100">{n.text}</p>
                      <p className="text-[10px] text-slate-400 mt-1">
                        {n.createdBy} &middot; {new Date(n.createdAt).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-2">
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                  Additional Incident Notes (optional)
                </label>
                <textarea
                  rows={3}
                  placeholder="Record any special incidents, plant issues, power outages, or other important events..."
                  value={otherDetails}
                  onChange={(e) => setOtherDetails(e.target.value)}
                  disabled={isLocked}
                  className="w-full disabled:opacity-60 disabled:cursor-not-allowed bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-900 dark:text-slate-100 focus:outline-none"
                />
              </div>
            </div>

            {/* 10. Declaration / Verification */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center space-x-2 font-heading font-bold text-sm text-slate-800 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <CheckCircle2 size={18} className="text-emerald-500" />
                  <span>10. DECLARATION / VERIFICATION</span>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  I hereby certify that I have personally checked and verified the above information and that all the information provided in this Daily Report is correct.
                </p>
              </div>

              <div className="space-y-3 pt-2">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                    Verifying Manager Name
                  </label>
                  <input
                    type="text"
                    placeholder="Enter manager name..."
                    value={verifiedBy}
                    onChange={(e) => setVerifiedBy(e.target.value)}
                    disabled={isLocked}
                    className="w-full disabled:opacity-60 disabled:cursor-not-allowed bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none"
                  />
                </div>

                {isLocked ? (
                  <div className="space-y-2 pt-2">
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 rounded-xl text-[11px] text-emerald-800 dark:text-emerald-300">
                      <strong>Verified and locked.</strong> This report was signed off by{' '}
                      {savedRecord?.verified_by || 'a manager'}
                      {savedRecord?.updated_at ? ` on ${new Date(savedRecord.updated_at).toLocaleString()}` : ''}.
                      Its entries can no longer be changed.
                    </div>
                    {isAdmin && (
                      <Button variant="secondary" onClick={() => setUnlockedRange(rangeKey)} className="w-full">
                        <Save size={16} className="mr-2" />
                        <span>Unlock to Correct</span>
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-between pt-2">
                    <Button variant="secondary" onClick={handleSave} disabled={isSaving} className="w-full">
                      <Save size={16} className="mr-2" />
                      <span>{isSaving ? 'Saving Daily Report...' : 'Save & Verify Report'}</span>
                    </Button>
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
