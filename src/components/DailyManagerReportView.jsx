import React, { useState, useEffect } from 'react';
import { useDailyReport } from '../hooks/useDailyReport';
import { useSettings } from '../hooks/useSettings';
import { useToast } from '../components/Toast';
import { Button } from '../components/Button';
import { Input } from '../components/FormFields';
import { generateDailyManagerReportPDF } from '../utils/pdfGenerator';
import { 
  ClipboardCheck, 
  Save, 
  Download, 
  Plus, 
  Trash2, 
  Calendar, 
  CheckCircle2, 
  Boxes, 
  DollarSign, 
  CreditCard, 
  Receipt, 
  Users, 
  Truck, 
  FileText,
  Clock
} from 'lucide-react';

export function DailyManagerReportView() {
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const { loading, reportData, manualInputs, saveDailyReport } = useDailyReport(selectedDate);
  const { settings } = useSettings();
  const toast = useToast();

  // Local form state synced with manualInputs
  const [brineCubes, setBrineCubes] = useState(0);
  const [freeIssue, setFreeIssue] = useState(0);
  const [damagedCubes, setDamagedCubes] = useState(0);
  const [pmProductionQty, setPmProductionQty] = useState(0);
  const [otherReceipts, setOtherReceipts] = useState(0);
  const [bankDepositAmount, setBankDepositAmount] = useState(0);
  const [bankDepositToday, setBankDepositToday] = useState(0);
  const [cashOnHand, setCashOnHand] = useState(0);
  const [chequesOnHand, setChequesOnHand] = useState(0);
  const [employeeLogs, setEmployeeLogs] = useState([]);
  const [vehicleLogs, setVehicleLogs] = useState([]);
  const [otherDetails, setOtherDetails] = useState('');
  const [verifiedBy, setVerifiedBy] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (manualInputs) {
      setBrineCubes(manualInputs.brineCubes || reportData?.stockDetails?.brineCubes || 0);
      setFreeIssue(manualInputs.freeIssue || 0);
      setDamagedCubes(manualInputs.damagedCubes || 0);
      setPmProductionQty(manualInputs.pmProductionQty || 0);
      setOtherReceipts(manualInputs.otherReceipts || 0);
      setBankDepositAmount(reportData?.cashDetails?.bankDepositAmount ?? manualInputs.bankDepositAmount ?? 0);
      setBankDepositToday(reportData?.cashDetails?.bankDepositToday ?? manualInputs.bankDepositToday ?? 0);
      setCashOnHand(reportData?.cashDetails?.cashOnHand ?? manualInputs.cashOnHand ?? 0);
      setChequesOnHand(reportData?.cashDetails?.chequesOnHand ?? manualInputs.chequesOnHand ?? 0);
      setEmployeeLogs(manualInputs.employeeLogs || []);
      setVehicleLogs(manualInputs.vehicleLogs || []);
      setOtherDetails(manualInputs.otherDetails || '');
      setVerifiedBy(manualInputs.verifiedBy || '');
    }
  }, [manualInputs, selectedDate, reportData]);



  // Handle Save
  const handleSave = async () => {
    try {
      setIsSaving(true);
      await saveDailyReport({
        brineCubes: Number(brineCubes) || 0,
        brineCubesConfirmed: true,
        freeIssue: Number(freeIssue) || 0,
        damagedCubes: Number(damagedCubes) || 0,
        pmProductionQty: Number(pmProductionQty) || 0,
        otherReceipts: Number(otherReceipts) || 0,
        bankDepositAmount: Number(bankDepositAmount) || 0,
        bankDepositToday: Number(bankDepositToday) || 0,
        cashOnHand: Number(cashOnHand) || 0,
        chequesOnHand: Number(chequesOnHand) || 0,
        employeeLogs,
        vehicleLogs,
        otherDetails,
        verifiedBy
      });
      toast.success(`Daily Report for ${selectedDate} saved successfully!`);
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
      doc.save(`Daily_Report_${selectedDate}.pdf`);
      toast.info(`Downloaded Daily Report PDF for ${selectedDate}`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate PDF");
    }
  };

  // Employee Log Handlers
  const addEmployeeRow = () => {
    setEmployeeLogs([...employeeLogs, { name: '', position: '', startTime: '08:00', finishTime: '17:00' }]);
  };
  const updateEmployeeRow = (index, field, value) => {
    const updated = [...employeeLogs];
    updated[index][field] = value;
    setEmployeeLogs(updated);
  };
  const removeEmployeeRow = (index) => {
    setEmployeeLogs(employeeLogs.filter((_, i) => i !== index));
  };

  // Vehicle Log Handlers
  const addVehicleRow = () => {
    setVehicleLogs([...vehicleLogs, { reason: '', route: '', startReading: '', endReading: '' }]);
  };
  const updateVehicleRow = (index, field, value) => {
    const updated = [...vehicleLogs];
    updated[index][field] = value;
    setVehicleLogs(updated);
  };
  const removeVehicleRow = (index) => {
    setVehicleLogs(vehicleLogs.filter((_, i) => i !== index));
  };

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
              value={selectedDate} 
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none"
            />
          </div>

          <Button 
            variant="secondary" 
            onClick={handleSave} 
            disabled={isSaving || loading}
            className="flex items-center space-x-2"
          >
            <Save size={16} />
            <span>{isSaving ? 'Saving...' : 'Save Data'}</span>
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

                <div className="bg-amber-50/50 dark:bg-amber-950/20 p-2 rounded-xl border border-amber-200 dark:border-amber-900/50">
                  <label className="text-[10px] text-amber-700 dark:text-amber-400 font-semibold uppercase block truncate">Brine</label>
                  <input 
                    type="number" 
                    value={brineCubes} 
                    onChange={(e) => setBrineCubes(e.target.value)}
                    className="w-full mt-0.5 bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-800 rounded px-1.5 py-0.5 text-xs font-bold focus:outline-none"
                  />
                </div>

                <div className="bg-amber-50/50 dark:bg-amber-950/20 p-2 rounded-xl border border-amber-200 dark:border-amber-900/50">
                  <label className="text-[10px] text-amber-700 dark:text-amber-400 font-semibold uppercase block truncate">Free Issue</label>
                  <input 
                    type="number" 
                    value={freeIssue} 
                    onChange={(e) => setFreeIssue(e.target.value)}
                    className="w-full mt-0.5 bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-800 rounded px-1.5 py-0.5 text-xs font-bold focus:outline-none"
                  />
                </div>

                <div className="bg-rose-50/50 dark:bg-rose-950/20 p-2 rounded-xl border border-rose-200 dark:border-rose-900/50">
                  <label className="text-[10px] text-rose-700 dark:text-rose-400 font-semibold uppercase block truncate">Damaged</label>
                  <input 
                    type="number" 
                    value={damagedCubes} 
                    onChange={(e) => setDamagedCubes(e.target.value)}
                    className="w-full mt-0.5 bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-800 rounded px-1.5 py-0.5 text-xs font-bold focus:outline-none"
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

              <div className="pt-2 flex items-center space-x-3">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">PM Production Quantity:</span>
                <input 
                  type="number"
                  value={pmProductionQty}
                  onChange={(e) => setPmProductionQty(e.target.value)}
                  placeholder="Enter PM batch quantity..."
                  className="w-48 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs font-medium focus:outline-none min-h-[36px]"
                />
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
                    className="w-full mt-0.5 bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-800 rounded px-1.5 py-0.5 text-xs font-bold focus:outline-none"
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

            
            {/* 03. Credit Given Today */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center space-x-2 font-heading font-bold text-sm text-slate-800 dark:text-slate-100">
                  <CreditCard size={18} className="text-amber-500" />
                  <span>03. CREDIT GIVEN TODAY</span>
                </div>
                <span className="text-xs font-bold text-amber-600">
                  Total: LKR {reportData.totalCreditGivenAmount.toLocaleString()}
                </span>
              </div>

              {reportData.creditGivenList.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">No credit sales recorded on {selectedDate}.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase text-[10px]">
                        <th className="py-2">No.</th>
                        <th className="py-2">Customer Name</th>
                        <th className="py-2 text-right">Qty</th>
                        <th className="py-2 text-right">Amount (LKR)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {reportData.creditGivenList.map(c => (
                        <tr key={c.no}>
                          <td className="py-2 font-mono text-slate-400">{c.no}</td>
                          <td className="py-2 font-medium">{c.customerName}</td>
                          <td className="py-2 text-right font-mono">{c.quantity}</td>
                          <td className="py-2 text-right font-bold text-slate-800 dark:text-slate-200">
                            {c.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* 04. Credit Amount Collections */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center space-x-2 font-heading font-bold text-sm text-slate-800 dark:text-slate-100">
                  <Receipt size={18} className="text-sky-500" />
                  <span>04. CREDIT COLLECTIONS TODAY</span>
                </div>
                <span className="text-xs font-bold text-sky-600">
                  Collected: LKR {reportData.totalCreditCollectedAmount.toLocaleString()}
                </span>
              </div>

              {reportData.creditCollectionList.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">No debt settlements collected on {selectedDate}.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase text-[10px]">
                        <th className="py-2">Customer</th>
                        <th className="py-2">Method</th>
                        <th className="py-2 text-right">Received</th>
                        <th className="py-2 text-right">Remaining</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {reportData.creditCollectionList.map((c, i) => (
                        <tr key={i}>
                          <td className="py-2 font-medium">{c.name}</td>
                          <td className="py-2 text-slate-500">{c.method}</td>
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

          {/* SECTION 05: Expense Details & SECTION 06: Cash Details */}
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
                <p className="text-xs text-slate-400 py-4 text-center">No operating expenses logged on {selectedDate}.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase text-[10px]">
                        <th className="py-2">Bill / Code</th>
                        <th className="py-2">Description</th>
                        <th className="py-2 text-right">Rupees (LKR)</th>
                        <th className="py-2 text-center">Cents</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {reportData.expenseList.map((e, idx) => (
                        <tr key={idx}>
                          <td className="py-2 font-mono text-slate-400">{e.code}</td>
                          <td className="py-2 font-medium">{e.description}</td>
                          <td className="py-2 text-right font-bold">{e.rupees.toLocaleString()}</td>
                          <td className="py-2 text-center font-mono text-slate-400">{e.cents}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* 06. Cash & Bank Details (1 col) */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center space-x-2 font-heading font-bold text-sm text-slate-800 dark:text-slate-100">
                  <DollarSign size={18} className="text-emerald-600" />
                  <span>06. CASH & BANK DETAILS</span>
                </div>
                <span className="text-[10px] bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 font-bold px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                  Auto-filled
                </span>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                    Amount Deposited in Bank (LKR)
                  </label>
                  <input 
                    type="number"
                    value={bankDepositAmount}
                    onChange={(e) => setBankDepositAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 font-bold text-slate-800 dark:text-slate-100 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                    Amount Deposite Today (LKR)
                  </label>
                  <input 
                    type="number"
                    value={bankDepositToday}
                    onChange={(e) => setBankDepositToday(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 font-bold text-slate-800 dark:text-slate-100 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                    Cash Balance on Hand (LKR)
                  </label>
                  <input 
                    type="number"
                    value={cashOnHand}
                    onChange={(e) => setCashOnHand(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 font-bold text-slate-800 dark:text-slate-100 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                    Value of Cheques on Hand (LKR)
                  </label>
                  <input 
                    type="number"
                    value={chequesOnHand}
                    onChange={(e) => setChequesOnHand(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 font-bold text-slate-800 dark:text-slate-100 focus:outline-none"
                  />
                </div>
              </div>
            </div>


          </div>

          {/* SECTION 07: Employee Work Details */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center space-x-2 font-heading font-bold text-sm text-slate-800 dark:text-slate-100">
                <Users size={18} className="text-navy-600 dark:text-sky-400" />
                <span>07. EMPLOYEE WORK DETAILS</span>
              </div>
              <Button size="sm" variant="secondary" onClick={addEmployeeRow} className="flex items-center space-x-1">
                <Plus size={14} />
                <span>Add Employee</span>
              </Button>
            </div>

            {employeeLogs.length === 0 ? (
              <p className="text-xs text-slate-400 py-3 text-center">No employee work logs added for today.</p>
            ) : (
              <div className="space-y-2">
                {employeeLogs.map((emp, index) => (
                  <div key={index} className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-center bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
                    <input 
                      type="text"
                      placeholder="Employee Name"
                      value={emp.name}
                      onChange={(e) => updateEmployeeRow(index, 'name', e.target.value)}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-medium focus:outline-none"
                    />
                    <input 
                      type="text"
                      placeholder="Location / Position"
                      value={emp.position}
                      onChange={(e) => updateEmployeeRow(index, 'position', e.target.value)}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-medium focus:outline-none"
                    />
                    <div className="flex items-center space-x-1 text-xs">
                      <input 
                        type="time"
                        value={emp.startTime}
                        onChange={(e) => updateEmployeeRow(index, 'startTime', e.target.value)}
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 focus:outline-none"
                      />
                      <span className="text-slate-400">to</span>
                      <input 
                        type="time"
                        value={emp.finishTime}
                        onChange={(e) => updateEmployeeRow(index, 'finishTime', e.target.value)}
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 focus:outline-none"
                      />
                    </div>
                    <div className="flex justify-end">
                      <button onClick={() => removeEmployeeRow(index)} className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SECTION 08: Vehicle Travel Details */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center space-x-2 font-heading font-bold text-sm text-slate-800 dark:text-slate-100">
                <Truck size={18} className="text-amber-500" />
                <span>08. VEHICLE TRAVEL DETAILS</span>
              </div>
              <Button size="sm" variant="secondary" onClick={addVehicleRow} className="flex items-center space-x-1">
                <Plus size={14} />
                <span>Add Travel Log</span>
              </Button>
            </div>

            {vehicleLogs.length === 0 ? (
              <p className="text-xs text-slate-400 py-3 text-center">No vehicle travel logs added for today.</p>
            ) : (
              <div className="space-y-2">
                {vehicleLogs.map((veh, index) => (
                  <div key={index} className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-center bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
                    <input 
                      type="text"
                      placeholder="Reason for Journey"
                      value={veh.reason}
                      onChange={(e) => updateVehicleRow(index, 'reason', e.target.value)}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-medium focus:outline-none"
                    />
                    <input 
                      type="text"
                      placeholder="Location / Route"
                      value={veh.route}
                      onChange={(e) => updateVehicleRow(index, 'route', e.target.value)}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-medium focus:outline-none"
                    />
                    <div className="flex items-center space-x-1 text-xs">
                      <input 
                        type="number"
                        placeholder="Start Meter"
                        value={veh.startReading}
                        onChange={(e) => updateVehicleRow(index, 'startReading', e.target.value)}
                        className="w-1/2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 focus:outline-none"
                      />
                      <input 
                        type="number"
                        placeholder="End Meter"
                        value={veh.endReading}
                        onChange={(e) => updateVehicleRow(index, 'endReading', e.target.value)}
                        className="w-1/2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 focus:outline-none"
                      />
                    </div>
                    <div className="flex justify-end">
                      <button onClick={() => removeVehicleRow(index)} className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SECTION 09 & 10: Other Details & Declaration */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* 09. Other Details */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-3">
              <div className="flex items-center space-x-2 font-heading font-bold text-sm text-slate-800 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-3">
                <FileText size={18} className="text-slate-500" />
                <span>09. OTHER DETAILS / INCIDENTS</span>
              </div>
              <textarea 
                rows={4}
                placeholder="Record any special incidents, plant issues, power outages, or other important events..."
                value={otherDetails}
                onChange={(e) => setOtherDetails(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-900 dark:text-slate-100 focus:outline-none"
              />
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
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-between pt-2">
                  <Button variant="secondary" onClick={handleSave} disabled={isSaving} className="w-full">
                    <Save size={16} className="mr-2" />
                    <span>{isSaving ? 'Saving Daily Report...' : 'Save & Verify Report'}</span>
                  </Button>
                </div>
              </div>
            </div>

          </div>

        </div>
      )}
    </div>
  );
}
