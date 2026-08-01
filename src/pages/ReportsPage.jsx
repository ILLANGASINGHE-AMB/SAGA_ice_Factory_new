import React, { useState, useMemo, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useSettings } from '../hooks/useSettings';
import { useToast } from '../components/Toast';
import { Button } from '../components/Button';
import { Input, Select } from '../components/FormFields';
import { Table } from '../components/Table';
import { Badge } from '../components/Badge';
import { generateReportPDF } from '../utils/pdfGenerator';
import { FileBarChart2, FileText, Download, Calendar, UserCheck, CreditCard } from 'lucide-react';

export function ReportsPage() {
  const { settings } = useSettings();
  const toast = useToast();

  const [activeReport, setActiveReport] = useState('weekly'); // 'weekly', 'monthly', 'full', 'debtors', 'customers'
  
  // Date parameter states
  const [selectedWeek, setSelectedWeek] = useState(() => {
    // Current week date format: yyyy-Www (e.g. 2026-W24)
    const d = new Date();
    const oneJan = new Date(d.getFullYear(), 0, 1);
    const numberOfDays = Math.floor((d - oneJan) / (24 * 60 * 60 * 1000));
    const weekVal = Math.ceil((d.getDay() + 1 + numberOfDays) / 7);
    return `${d.getFullYear()}-W${String(weekVal).padStart(2, '0')}`;
  });

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; // yyyy-mm
  });

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  
  // Preview data state
  const [previewData, setPreviewData] = useState(null);

  // Fetch complete data dynamically on parameters changes
  const [sales, setSales] = useState([]);
  const [debts, setDebts] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);

  const fetchAllData = async () => {
    try {
      const [
        { data: salesRes, error: salesErr },
        { data: debtsRes, error: debtsErr },
        { data: settlementsRes, error: settlementsErr },
        { data: customersRes, error: customersErr }
      ] = await Promise.all([
        supabase.from('sales').select('*'),
        supabase.from('debts').select('*'),
        supabase.from('debt_settlements').select('*'),
        supabase.from('customers').select('*')
      ]);

      if (salesErr) throw salesErr;
      if (debtsErr) throw debtsErr;
      if (settlementsErr) throw settlementsErr;
      if (customersErr) throw customersErr;

      setSales(salesRes || []);
      setDebts(debtsRes || []);
      setSettlements(settlementsRes || []);
      setCustomers(customersRes || []);
    } catch (err) {
      console.error("Failed to fetch reports data:", err);
    } finally {
      setDataLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();

    const channel = supabase
      .channel(`reports-realtime-${Math.random()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => fetchAllData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'debts' }, () => fetchAllData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'debt_settlements' }, () => fetchAllData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, () => fetchAllData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Check week ISO number calculations
  const getDatesOfWeek = (weekStr) => {
    if (!weekStr) return { start: new Date(), end: new Date() };
    const [year, week] = weekStr.split('-W');
    const y = parseInt(year, 10);
    const w = parseInt(week, 10);
    
    // Simple rough date conversion for selected week
    const simple = new Date(y, 0, 1 + (w - 1) * 7);
    const dow = simple.getDay();
    const ISOweekStart = simple;
    if (dow <= 4) {
      ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
    } else {
      ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
    }
    
    const start = new Date(ISOweekStart);
    start.setHours(0,0,0,0);
    
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23,59,59,999);
    
    return { start, end };
  };

  // Run calculation to generate current active report details
  const handleGenerateReport = () => {
    if (!sales || !customers || !debts || !settlements) return;

    let filteredSales = [];
    let dateRangeStr = '';
    let reportTitle = '';
    
    // Summary values
    let totalRevenue = 0;
    let cashRevenue = 0;
    let debtRevenue = 0;
    let mfcSold = 0;
    let rscSold = 0;
    let newCustomersCount = 0;
    let totalSettled = 0;
    let debtorsList = [];
    let customerListWithDetails = [];

    if (activeReport === 'weekly') {
      const { start, end } = getDatesOfWeek(selectedWeek);
      dateRangeStr = `${start.toLocaleDateString()} to ${end.toLocaleDateString()}`;
      reportTitle = "Weekly Production Report";

      filteredSales = sales.filter(s => {
        const d = new Date(s.sale_date);
        return d >= start && d <= end;
      });

      // Count new customers in this range
      newCustomersCount = customers.filter(c => {
        const d = new Date(c.created_at);
        return d >= start && d <= end;
      }).length;

      // Settlements collection in this range
      settlements.forEach(setl => {
        const d = new Date(setl.settlement_date);
        if (d >= start && d <= end) {
          totalSettled += setl.amount_paid;
        }
      });

    } else if (activeReport === 'monthly') {
      const [year, month] = selectedMonth.split('-');
      const y = parseInt(year, 10);
      const m = parseInt(month, 10) - 1;
      
      const start = new Date(y, m, 1, 0, 0, 0, 0);
      const end = new Date(y, m + 1, 0, 23, 59, 59, 999);
      
      dateRangeStr = start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      reportTitle = "Monthly Factory Performance Report";

      filteredSales = sales.filter(s => {
        const d = new Date(s.sale_date);
        return d >= start && d <= end;
      });

      newCustomersCount = customers.filter(c => {
        const d = new Date(c.created_at);
        return d >= start && d <= end;
      }).length;

      settlements.forEach(setl => {
        const d = new Date(setl.settlement_date);
        if (d >= start && d <= end) {
          totalSettled += setl.amount_paid;
        }
      });

    } else if (activeReport === 'full') {
      if (!fromDate || !toDate) {
        toast.error("Please enter a valid starting and ending date");
        return;
      }
      const start = new Date(fromDate);
      start.setHours(0,0,0,0);
      const end = new Date(toDate);
      end.setHours(23,59,59,999);

      dateRangeStr = `${start.toLocaleDateString()} to ${end.toLocaleDateString()}`;
      reportTitle = "Full Ledger Period Report";

      filteredSales = sales.filter(s => {
        const d = new Date(s.sale_date);
        return d >= start && d <= end;
      });

      newCustomersCount = customers.filter(c => {
        const d = new Date(c.created_at);
        return d >= start && d <= end;
      }).length;

      settlements.forEach(setl => {
        const d = new Date(setl.settlement_date);
        if (d >= start && d <= end) {
          totalSettled += setl.amount_paid;
        }
      });

    } else if (activeReport === 'debtors') {
      reportTitle = "Outstanding Debtors Report";
      dateRangeStr = `As of ${new Date().toLocaleDateString()}`;
      
      // All customers with status pending/partial
      const activeDebts = debts.filter(d => d.status === 'pending' || d.status === 'partial');
      
      // Aggregate by customer
      const custDebtAgg = {};
      activeDebts.forEach(d => {
        if (!custDebtAgg[d.customer_id]) {
          custDebtAgg[d.customer_id] = 0;
        }
        custDebtAgg[d.customer_id] += d.remaining_amount;
      });

      debtorsList = Object.keys(custDebtAgg).map(custId => {
        const customer = customers.find(c => c.id === parseInt(custId, 10));
        return {
          id: custId,
          code: customer?.customer_code || 'N/A',
          name: customer?.name || 'Unknown',
          whatsapp: customer?.whatsapp_number || 'N/A',
          amountOwed: custDebtAgg[custId]
        };
      });

      // Sort by debt size
      debtorsList.sort((a, b) => b.amountOwed - a.amountOwed);
      
    } else if (activeReport === 'customers') {
      reportTitle = "Customer Ledger Purchase History";
      dateRangeStr = `Complete registry records`;

      customerListWithDetails = customers.map(c => {
        // Purchases
        const cSales = sales.filter(s => s.customer_id === c.id);
        const totalPurchased = cSales.reduce((sum, s) => sum + s.total_amount, 0);
        const cubesCount = cSales.reduce((sum, s) => sum + s.quantity, 0);
        
        // Outstanding
        const cDebts = debts.filter(d => d.customer_id === c.id);
        const debtOwed = cDebts.reduce((sum, d) => sum + d.remaining_amount, 0);

        return {
          ...c,
          totalPurchased,
          cubesCount,
          debtOwed,
          purchasesCount: cSales.length
        };
      });

      customerListWithDetails.sort((a,b) => b.totalPurchased - a.totalPurchased);
    }

    // 2. Map financial aggregates
    filteredSales.forEach(s => {
      totalRevenue += s.total_amount;
      if (s.payment_type === 'cash') {
        cashRevenue += s.total_amount;
      } else if (s.payment_type === 'debt') {
        debtRevenue += s.total_amount;
      }

      if (s.cube_type === 'manufactured') {
        mfcSold += s.quantity;
      } else {
        rscSold += s.quantity;
      }
    });

    const custMap = new Map(customers.map(c => [c.id, c]));
    const mappedSales = filteredSales.map(s => ({
      ...s,
      customerName: custMap.get(s.customer_id)?.name || 'Walk-in'
    }));

    setPreviewData({
      reportTitle,
      dateRangeStr,
      sales: mappedSales,
      debtors: debtorsList,
      customers: customerListWithDetails,
      summary: {
        totalRevenue,
        cashRevenue,
        debtRevenue,
        mfcSold,
        rscSold,
        newCustomersCount,
        totalSettled
      }
    });

    toast.success("Analytical report compiled successfully!");
  };

  // Download compiled PDF
  const handleDownloadPDF = () => {
    if (!previewData) return;
    
    let doc;
    if (activeReport === 'debtors') {
      // Custom format for debtors report table
      const formattedSales = previewData.debtors.map(d => ({
        sale_date: new Date(),
        sale_code: 'DEBT',
        customerName: d.name,
        cube_type: 'DEBT',
        quantity: 0,
        total_amount: d.amountOwed,
        payment_type: 'DEBT'
      }));
      doc = generateReportPDF(
        previewData.reportTitle,
        previewData.dateRangeStr,
        formattedSales,
        {
          totalRevenue: previewData.debtors.reduce((sum, d) => sum + d.amountOwed, 0),
          cashRevenue: 0,
          debtRevenue: previewData.debtors.reduce((sum, d) => sum + d.amountOwed, 0),
          mfcSold: 0,
          rscSold: 0,
          newCustomersCount: 0,
          totalSettled: 0
        },
        settings
      );
    } else if (activeReport === 'customers') {
      const formattedSales = previewData.customers.map(c => ({
        sale_date: new Date(c.created_at),
        sale_code: c.customer_code,
        customerName: c.name,
        cube_type: 'CUST',
        quantity: c.cubesCount,
        total_amount: c.totalPurchased,
        payment_type: c.purchasesCount + ' orders'
      }));
      doc = generateReportPDF(
        previewData.reportTitle,
        previewData.dateRangeStr,
        formattedSales,
        {
          totalRevenue: previewData.customers.reduce((sum, c) => sum + c.totalPurchased, 0),
          cashRevenue: 0,
          debtRevenue: previewData.customers.reduce((sum, c) => sum + c.debtOwed, 0),
          mfcSold: previewData.customers.reduce((sum, c) => sum + c.cubesCount, 0),
          rscSold: 0,
          newCustomersCount: previewData.customers.length,
          totalSettled: 0
        },
        settings
      );
    } else {
      doc = generateReportPDF(
        previewData.reportTitle,
        previewData.dateRangeStr,
        previewData.sales,
        previewData.summary,
        settings
      );
    }

    doc.save(`${activeReport}_report_${Date.now()}.pdf`);
    toast.info("Downloaded PDF report successfully.");
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      
      {/* 1. Selector Section */}
      <div className="space-y-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6 space-y-4">
          <h3 className="text-base font-bold font-heading text-slate-800 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-3">
            Compile Report
          </h3>
          
          <div className="space-y-3">
            <button
              onClick={() => { setActiveReport('weekly'); setPreviewData(null); }}
              className={`w-full text-left p-4 rounded-xl border transition flex items-center justify-between ${
                activeReport === 'weekly'
                  ? 'border-navy-500 bg-navy-50/50 dark:bg-navy-950/20 text-navy-800 dark:text-navy-300 font-semibold'
                  : 'border-slate-200 dark:border-slate-800 bg-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40'
              }`}
            >
              <div className="flex items-center space-x-3">
                <Calendar size={18} />
                <span className="text-sm">Weekly Report</span>
              </div>
            </button>

            <button
              onClick={() => { setActiveReport('monthly'); setPreviewData(null); }}
              className={`w-full text-left p-4 rounded-xl border transition flex items-center justify-between ${
                activeReport === 'monthly'
                  ? 'border-navy-500 bg-navy-50/50 dark:bg-navy-950/20 text-navy-800 dark:text-navy-300 font-semibold'
                  : 'border-slate-200 dark:border-slate-800 bg-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40'
              }`}
            >
              <div className="flex items-center space-x-3">
                <Calendar size={18} />
                <span className="text-sm">Monthly Report</span>
              </div>
            </button>

            <button
              onClick={() => { setActiveReport('full'); setPreviewData(null); }}
              className={`w-full text-left p-4 rounded-xl border transition flex items-center justify-between ${
                activeReport === 'full'
                  ? 'border-navy-500 bg-navy-50/50 dark:bg-navy-950/20 text-navy-800 dark:text-navy-300 font-semibold'
                  : 'border-slate-200 dark:border-slate-800 bg-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40'
              }`}
            >
              <div className="flex items-center space-x-3">
                <Calendar size={18} />
                <span className="text-sm">Full Report (Date Range)</span>
              </div>
            </button>

            <button
              onClick={() => { setActiveReport('debtors'); setPreviewData(null); }}
              className={`w-full text-left p-4 rounded-xl border transition flex items-center justify-between ${
                activeReport === 'debtors'
                  ? 'border-navy-500 bg-navy-50/50 dark:bg-navy-950/20 text-navy-800 dark:text-navy-300 font-semibold'
                  : 'border-slate-200 dark:border-slate-800 bg-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40'
              }`}
            >
              <div className="flex items-center space-x-3">
                <CreditCard size={18} />
                <span className="text-sm">Debtors Report</span>
              </div>
            </button>

            <button
              onClick={() => { setActiveReport('customers'); setPreviewData(null); }}
              className={`w-full text-left p-4 rounded-xl border transition flex items-center justify-between ${
                activeReport === 'customers'
                  ? 'border-navy-500 bg-navy-50/50 dark:bg-navy-950/20 text-navy-800 dark:text-navy-300 font-semibold'
                  : 'border-slate-200 dark:border-slate-800 bg-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40'
              }`}
            >
              <div className="flex items-center space-x-3">
                <UserCheck size={18} />
                <span className="text-sm">Customer Details Report</span>
              </div>
            </button>
          </div>
        </div>

        {/* Date parameters card depending on type */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6 space-y-4">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Set Parameters
          </h3>
          
          <div className="space-y-4">
            {activeReport === 'weekly' && (
              <Input
                label="Select Week"
                name="weekSelect"
                type="week"
                value={selectedWeek}
                onChange={(e) => setSelectedWeek(e.target.value)}
              />
            )}

            {activeReport === 'monthly' && (
              <Input
                label="Select Month"
                name="monthSelect"
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
              />
            )}

            {activeReport === 'full' && (
              <>
                <Input
                  label="From Date"
                  name="fDate"
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />
                <Input
                  label="To Date"
                  name="tDate"
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                />
              </>
            )}

            {(activeReport === 'debtors' || activeReport === 'customers') && (
              <p className="text-xs text-slate-400">
                This report generates aggregate details based on the current complete ledger status.
              </p>
            )}

            <Button
              variant="primary"
              onClick={handleGenerateReport}
              className="w-full flex items-center justify-center space-x-2 py-2 rounded-xl"
            >
              <FileBarChart2 size={16} />
              <span>Compile Preview</span>
            </Button>
          </div>
        </div>
      </div>

      {/* 2. Preview Panel Section */}
      <div className="xl:col-span-2 space-y-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6 min-h-[500px] flex flex-col justify-between">
          
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 mb-4">
            <div className="flex items-center space-x-2 text-slate-800 dark:text-slate-200">
              <FileText size={20} className="text-navy-500" />
              <h3 className="text-base font-bold font-heading">
                Report Live Preview
              </h3>
            </div>
            {previewData && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleDownloadPDF}
                className="flex items-center space-x-1.5 border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200"
              >
                <Download size={14} />
                <span>Download PDF</span>
              </Button>
            )}
          </div>

          {/* Report body HTML representation */}
          <div className="flex-1 overflow-y-auto max-h-[55vh] pr-2">
            {!previewData ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 py-24 space-y-3">
                <FileBarChart2 size={48} className="stroke-[1.2]" />
                <h4 className="text-sm font-semibold">Report Not Generated</h4>
                <p className="text-xs max-w-xs mx-auto">
                  Choose parameters and click 'Compile Preview' to load the factory statement report.
                </p>
              </div>
            ) : (
              <div className="space-y-6 text-slate-800 dark:text-slate-200">
                {/* Brand Header */}
                <div className="flex justify-between items-start pb-4 border-b border-dashed border-slate-200 dark:border-slate-800">
                  <div>
                    <h2 className="text-xl font-bold font-heading text-slate-900 dark:text-slate-50">
                      {settings?.company_name || 'Sagacious Ice Factory'}
                    </h2>
                    <span className="text-xs text-slate-400">{settings?.company_address || 'Colombo, Sri Lanka'}</span>
                  </div>
                  <div className="text-right">
                    <h3 className="text-sm font-bold font-heading tracking-wide uppercase text-navy-600 dark:text-navy-400">
                      {previewData.reportTitle}
                    </h3>
                    <span className="text-xs font-mono text-slate-400">{previewData.dateRangeStr}</span>
                  </div>
                </div>

                {/* Summary Strip */}
                {activeReport !== 'debtors' && activeReport !== 'customers' && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-slate-50 dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-800">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-medium">Total Invoiced</span>
                      <span className="text-sm font-bold font-mono text-slate-900 dark:text-slate-50">LKR {previewData.summary.totalRevenue.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-medium">Cash Collected</span>
                      <span className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400">LKR {previewData.summary.cashRevenue.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-medium">Debt Balance</span>
                      <span className="text-sm font-bold font-mono text-rose-600 dark:text-rose-400">LKR {previewData.summary.debtRevenue.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-medium">Settlements Collected</span>
                      <span className="text-sm font-bold font-mono text-teal-600 dark:text-teal-400">LKR {previewData.summary.totalSettled.toLocaleString()}</span>
                    </div>
                  </div>
                )}

                {/* Main Tables */}
                {activeReport === 'debtors' ? (
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Ledger Debtors</h4>
                    <Table
                      headers={[
                        { key: 'code', label: 'Code' },
                        { key: 'name', label: 'Name' },
                        { key: 'whatsapp', label: 'WhatsApp' },
                        { key: 'amountOwed', label: 'Outstanding Owed' }
                      ]}
                      data={previewData.debtors}
                      emptyMessage="No customer debts logged."
                      renderRow={(debtor) => (
                        <tr key={debtor.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 text-xs">
                          <td className="px-6 py-2.5 font-mono font-medium text-navy-600 dark:text-navy-400">{debtor.code}</td>
                          <td className="px-6 py-2.5 font-semibold">{debtor.name}</td>
                          <td className="px-6 py-2.5 font-mono">{debtor.whatsapp}</td>
                          <td className="px-6 py-2.5 font-bold font-mono text-rose-600 dark:text-rose-400">LKR {debtor.amountOwed.toLocaleString()}</td>
                        </tr>
                      )}
                    />
                  </div>
                ) : activeReport === 'customers' ? (
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Customer Performance Ledger</h4>
                    <Table
                      headers={[
                        { key: 'customer_code', label: 'Code' },
                        { key: 'name', label: 'Customer' },
                        { key: 'purchasesCount', label: 'Sales Orders' },
                        { key: 'cubesCount', label: 'Cubes Purchased' },
                        { key: 'totalPurchased', label: 'Total Billed' },
                        { key: 'debtOwed', label: 'Remaining Debt' }
                      ]}
                      data={previewData.customers}
                      emptyMessage="No customer records in system registry."
                      renderRow={(cust) => (
                        <tr key={cust.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 text-xs">
                          <td className="px-6 py-2.5 font-mono font-medium text-navy-600 dark:text-navy-400">{cust.customer_code}</td>
                          <td className="px-6 py-2.5 font-semibold">{cust.name}</td>
                          <td className="px-6 py-2.5 font-mono">{cust.purchasesCount} orders</td>
                          <td className="px-6 py-2.5 font-mono">{cust.cubesCount.toLocaleString()} cubes</td>
                          <td className="px-6 py-2.5 font-mono font-semibold">LKR {cust.totalPurchased.toLocaleString()}</td>
                          <td className="px-6 py-2.5 font-mono font-bold text-rose-600 dark:text-rose-400">LKR {cust.debtOwed.toLocaleString()}</td>
                        </tr>
                      )}
                    />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Sales Transactions Table</h4>
                    <Table
                      headers={[
                        { key: 'sale_code', label: 'Sale Ref' },
                        { key: 'customerName', label: 'Customer' },
                        { key: 'cube_type', label: 'Type' },
                        { key: 'quantity', label: 'Qty' },
                        { key: 'total_amount', label: 'Amount' },
                        { key: 'payment_type', label: 'Billing' },
                        { key: 'sale_date', label: 'Date' }
                      ]}
                      data={previewData.sales}
                      emptyMessage="No sales recorded in period."
                      renderRow={(sale) => (
                        <tr key={sale.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 text-xs">
                          <td className="px-6 py-2.5 font-mono font-medium text-navy-600 dark:text-navy-400">{sale.sale_code}</td>
                          <td className="px-6 py-2.5 font-semibold">{sale.customerName}</td>
                          <td className="px-6 py-2.5"><Badge type={sale.cube_type === 'manufactured' ? 'MFC' : 'RSC'} /></td>
                          <td className="px-6 py-2.5 font-mono">{sale.quantity.toLocaleString()}</td>
                          <td className="px-6 py-2.5 font-mono font-semibold">LKR {sale.total_amount.toLocaleString()}</td>
                          <td className="px-6 py-2.5"><Badge type={sale.payment_type} /></td>
                          <td className="px-6 py-2.5 font-mono text-slate-400">{new Date(sale.sale_date).toLocaleDateString()}</td>
                        </tr>
                      )}
                    />
                  </div>
                )}
                
                {/* Aggregates footer details */}
                {activeReport !== 'debtors' && activeReport !== 'customers' && (
                  <div className="border-t border-slate-200 dark:border-slate-800 pt-4 grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-slate-400 uppercase tracking-wider block text-[10px] mb-1 font-semibold">Production Cube Volumes</span>
                      <p>Manufactured (MFC) Sold: <span className="font-bold">{previewData.summary.mfcSold.toLocaleString()} units</span></p>
                      <p>Resell (RSC) Sold: <span className="font-bold">{previewData.summary.rscSold.toLocaleString()} units</span></p>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-400 uppercase tracking-wider block text-[10px] mb-1 font-semibold">Period Inflows</span>
                      <p>New Customers Registered: <span className="font-bold">{previewData.summary.newCustomersCount} clients</span></p>
                      <p>Credit Settled Payments: <span className="font-bold">LKR {previewData.summary.totalSettled.toLocaleString()}</span></p>
                    </div>
                  </div>
                )}

              </div>
            )}
          </div>
          
          {/* Stamp footer */}
          <div className="border-t border-slate-200 dark:border-slate-800 pt-4 flex justify-between items-center text-[10px] text-slate-400">
            <span>Sagacious Ice Factory Ledger Reports</span>
            <span>Generated: {new Date().toLocaleString()}</span>
          </div>

        </div>
      </div>

    </div>
  );
}
