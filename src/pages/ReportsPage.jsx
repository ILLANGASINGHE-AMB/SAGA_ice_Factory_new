import React, { useState, useMemo, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useSettings } from '../hooks/useSettings';
import { useToast } from '../components/Toast';
import { Button } from '../components/Button';
import { Input, Select } from '../components/FormFields';
import { Table } from '../components/Table';
import { Badge } from '../components/Badge';
import { generateReportPDF } from '../utils/pdfGenerator';
import { DailyManagerReportView } from '../components/DailyManagerReportView';
import { FileBarChart2, FileText, Download, Calendar, UserCheck, CreditCard, SlidersHorizontal, ClipboardCheck } from 'lucide-react';

// Standard ISO-8601 week number (yyyy-Www) for a given date, using the
// "nearest Thursday" anchor method. Kept as the single source of truth for
// "what week is this date in" so the default selected week and
// getDatesOfWeek() (which converts a week string back to a date range) never
// disagree — they previously used two different, inconsistent algorithms.
function getISOWeekString(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // Monday=1..Sunday=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // shift to the Thursday of this ISO week
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export function ReportsPage() {
  const { settings } = useSettings();
  const toast = useToast();

  const [activeReport, setActiveReport] = useState('weekly'); // 'weekly', 'monthly', 'full', 'debtors', 'customers'

  // Date parameter states
  const [selectedWeek, setSelectedWeek] = useState(() => getISOWeekString(new Date()));

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; // yyyy-mm
  });

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  
  // Custom Report filter states
  const [customCustomerId, setCustomCustomerId] = useState('all');
  const [customCubeType, setCustomCubeType] = useState('all');
  const [customPaymentType, setCustomPaymentType] = useState('all');
  const [customFromDate, setCustomFromDate] = useState('');
  const [customToDate, setCustomToDate] = useState('');
  const [customIncludeDebts, setCustomIncludeDebts] = useState(false);

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
      setDataLoading(true);
      const [salesRes, debtsRes, settlementsRes, customersRes] = await Promise.all([
        supabase.from('sales').select('*, sale_items(*)').then(r => r.data || []).catch(() => []),
        supabase.from('debts').select('*').then(r => r.data || []).catch(() => []),
        supabase.from('debt_settlements').select('*').then(r => r.data || []).catch(() => []),
        supabase.from('customers').select('*').then(r => r.data || []).catch(() => [])
      ]);

      setSales(salesRes);
      setDebts(debtsRes);
      setSettlements(settlementsRes);
      setCustomers(customersRes);
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
          whatsapp: customer?.whatsapp_number || customer?.contact_number || 'N/A',
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
        const cashPurchased = cSales.filter(s => s.payment_type === 'cash').reduce((sum, s) => sum + s.total_amount, 0);
        const mfcCubes = cSales.reduce((sum, s) => sum + (s.sale_items || []).filter(i => i.cube_type === 'manufactured').reduce((s2, i) => s2 + i.quantity, 0), 0);
        const rscCubes = cSales.reduce((sum, s) => sum + (s.sale_items || []).filter(i => i.cube_type === 'resell').reduce((s2, i) => s2 + i.quantity, 0), 0);

        // Outstanding
        const cDebts = debts.filter(d => d.customer_id === c.id);
        const debtOwed = cDebts.reduce((sum, d) => sum + d.remaining_amount, 0);

        return {
          ...c,
          totalPurchased,
          cubesCount,
          cashPurchased,
          mfcCubes,
          rscCubes,
          debtOwed,
          purchasesCount: cSales.length
        };
      });

      customerListWithDetails.sort((a,b) => b.totalPurchased - a.totalPurchased);
    } else if (activeReport === 'custom') {
      reportTitle = "Customized Analytical Report";
      
      const filterParts = [];

      // 1. Date filter
      if (customFromDate || customToDate) {
        let start = customFromDate ? new Date(customFromDate) : new Date(0);
        if (customFromDate) start.setHours(0,0,0,0);
        let end = customToDate ? new Date(customToDate) : new Date();
        if (customToDate) end.setHours(23,59,59,999);

        filteredSales = sales.filter(s => {
          const d = new Date(s.sale_date);
          return d >= start && d <= end;
        });

        filterParts.push(`Period: ${customFromDate || 'Start'} to ${customToDate || 'Today'}`);
      } else {
        filteredSales = [...sales];
        filterParts.push('Period: All Time');
      }

      // 2. Customer filter
      if (customCustomerId !== 'all') {
        const targetCustId = parseInt(customCustomerId, 10);
        filteredSales = filteredSales.filter(s => s.customer_id === targetCustId);
        const custObj = customers.find(c => c.id === targetCustId);
        filterParts.push(`Customer: ${custObj?.name || 'Walk-in'}`);
      } else {
        filterParts.push('Customer: All');
      }

      // 3. Cube Type filter — a sale matches if any of its line items match
      if (customCubeType !== 'all') {
        filteredSales = filteredSales.filter(s => (s.sale_items || []).some(i => i.cube_type === customCubeType));
        filterParts.push(`Cube: ${customCubeType === 'manufactured' ? 'MFC' : 'RSC'}`);
      } else {
        filterParts.push('Cube: All Types');
      }

      // 4. Payment Type filter
      if (customPaymentType !== 'all') {
        filteredSales = filteredSales.filter(s => s.payment_type === customPaymentType);
        filterParts.push(`Payment: ${customPaymentType.toUpperCase()}`);
      } else {
        filterParts.push('Payment: All Methods');
      }

      dateRangeStr = filterParts.join(' • ');

      // Calculate settlements in scope if dates applied
      settlements.forEach(setl => {
        let inRange = true;
        if (customFromDate) {
          const start = new Date(customFromDate);
          start.setHours(0,0,0,0);
          if (new Date(setl.settlement_date) < start) inRange = false;
        }
        if (customToDate) {
          const end = new Date(customToDate);
          end.setHours(23,59,59,999);
          if (new Date(setl.settlement_date) > end) inRange = false;
        }
        if (customCustomerId !== 'all') {
          if (setl.customer_id !== parseInt(customCustomerId, 10)) inRange = false;
        }
        if (inRange) totalSettled += setl.amount_paid;
      });

      // If Include Debts option is active
      if (customIncludeDebts) {
        let filteredDebts = debts;
        if (customCustomerId !== 'all') {
          filteredDebts = debts.filter(d => d.customer_id === parseInt(customCustomerId, 10));
        }
        debtorsList = filteredDebts.map(d => {
          const cust = customers.find(c => c.id === d.customer_id);
          return {
            id: d.id,
            code: cust?.customer_code || 'N/A',
            name: cust?.name || 'Unknown',
            originalAmount: d.total_amount,
            paidAmount: d.paid_amount,
            amountOwed: d.remaining_amount,
            status: d.status,
            created: new Date(d.created_at).toLocaleDateString()
          };
        });
      }
    }

    // 2. Map financial aggregates
    filteredSales.forEach(s => {
      totalRevenue += s.total_amount;
      if (s.payment_type === 'cash') {
        cashRevenue += s.total_amount;
      } else if (s.payment_type === 'debt') {
        debtRevenue += s.total_amount;
      }

      (s.sale_items || []).forEach(item => {
        if (item.cube_type === 'manufactured') {
          mfcSold += item.quantity;
        } else {
          rscSold += item.quantity;
        }
      });
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
      customDebtDetails: customIncludeDebts ? debtorsList : null,
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
        settings,
        false // Debtors report: matches the on-screen preview, which also hides this summary strip
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
          cashRevenue: previewData.customers.reduce((sum, c) => sum + c.cashPurchased, 0),
          debtRevenue: previewData.customers.reduce((sum, c) => sum + c.debtOwed, 0),
          mfcSold: previewData.customers.reduce((sum, c) => sum + c.mfcCubes, 0),
          rscSold: previewData.customers.reduce((sum, c) => sum + c.rscCubes, 0),
          newCustomersCount: previewData.customers.length,
          totalSettled: 0
        },
        settings,
        false // Customer Details report: matches the on-screen preview, which also hides this summary strip
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
    <div className="grid grid-cols-1 xl:grid-cols-3 landscape:grid-cols-3 gap-4 sm:gap-6">
      
      {/* 1. Selector Section */}
      <div className="space-y-4 sm:space-y-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs p-4 sm:p-5 space-y-3">
          <h3 className="text-sm sm:text-base font-bold font-heading text-slate-800 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-2.5">
            Compile Report
          </h3>
          
          <div className="space-y-2 sm:space-y-2.5">
            <button
              onClick={() => { setActiveReport('daily_manager'); setPreviewData(null); }}
              className={`w-full text-left p-3 sm:p-3.5 rounded-xl border transition flex items-center justify-between cursor-pointer ${
                activeReport === 'daily_manager'
                  ? 'border-navy-500 bg-navy-50/50 dark:bg-navy-950/20 text-navy-800 dark:text-navy-300 font-semibold'
                  : 'border-slate-200 dark:border-slate-800 bg-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40'
              }`}
            >
              <div className="flex items-center space-x-2.5 sm:space-x-3">
                <ClipboardCheck size={18} className="text-emerald-500 shrink-0" />
                <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">Daily Manager Report</span>
              </div>
            </button>

            <button
              onClick={() => { setActiveReport('weekly'); setPreviewData(null); }}
              className={`w-full text-left p-3 sm:p-3.5 rounded-xl border transition flex items-center justify-between cursor-pointer ${
                activeReport === 'weekly'
                  ? 'border-navy-500 bg-navy-50/50 dark:bg-navy-950/20 text-navy-800 dark:text-navy-300 font-semibold'
                  : 'border-slate-200 dark:border-slate-800 bg-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40'
              }`}
            >
              <div className="flex items-center space-x-2.5 sm:space-x-3">
                <Calendar size={18} className="shrink-0" />
                <span className="text-xs sm:text-sm">Weekly Report</span>
              </div>
            </button>

            <button
              onClick={() => { setActiveReport('monthly'); setPreviewData(null); }}
              className={`w-full text-left p-3 sm:p-3.5 rounded-xl border transition flex items-center justify-between cursor-pointer ${
                activeReport === 'monthly'
                  ? 'border-navy-500 bg-navy-50/50 dark:bg-navy-950/20 text-navy-800 dark:text-navy-300 font-semibold'
                  : 'border-slate-200 dark:border-slate-800 bg-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40'
              }`}
            >
              <div className="flex items-center space-x-2.5 sm:space-x-3">
                <Calendar size={18} className="shrink-0" />
                <span className="text-xs sm:text-sm">Monthly Report</span>
              </div>
            </button>

            <button
              onClick={() => { setActiveReport('full'); setPreviewData(null); }}
              className={`w-full text-left p-3 sm:p-3.5 rounded-xl border transition flex items-center justify-between cursor-pointer ${
                activeReport === 'full'
                  ? 'border-navy-500 bg-navy-50/50 dark:bg-navy-950/20 text-navy-800 dark:text-navy-300 font-semibold'
                  : 'border-slate-200 dark:border-slate-800 bg-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40'
              }`}
            >
              <div className="flex items-center space-x-2.5 sm:space-x-3">
                <Calendar size={18} className="shrink-0" />
                <span className="text-xs sm:text-sm">Full Report (Date Range)</span>
              </div>
            </button>

            <button
              onClick={() => { setActiveReport('debtors'); setPreviewData(null); }}
              className={`w-full text-left p-3 sm:p-3.5 rounded-xl border transition flex items-center justify-between cursor-pointer ${
                activeReport === 'debtors'
                  ? 'border-navy-500 bg-navy-50/50 dark:bg-navy-950/20 text-navy-800 dark:text-navy-300 font-semibold'
                  : 'border-slate-200 dark:border-slate-800 bg-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40'
              }`}
            >
              <div className="flex items-center space-x-2.5 sm:space-x-3">
                <CreditCard size={18} className="shrink-0" />
                <span className="text-xs sm:text-sm">Debtors Report</span>
              </div>
            </button>

            <button
              onClick={() => { setActiveReport('customers'); setPreviewData(null); }}
              className={`w-full text-left p-3 sm:p-3.5 rounded-xl border transition flex items-center justify-between cursor-pointer ${
                activeReport === 'customers'
                  ? 'border-navy-500 bg-navy-50/50 dark:bg-navy-950/20 text-navy-800 dark:text-navy-300 font-semibold'
                  : 'border-slate-200 dark:border-slate-800 bg-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40'
              }`}
            >
              <div className="flex items-center space-x-2.5 sm:space-x-3">
                <UserCheck size={18} className="shrink-0" />
                <span className="text-xs sm:text-sm">Customer Details Report</span>
              </div>
            </button>

            <button
              onClick={() => { setActiveReport('custom'); setPreviewData(null); }}
              className={`w-full text-left p-3 sm:p-3.5 rounded-xl border transition flex items-center justify-between cursor-pointer ${
                activeReport === 'custom'
                  ? 'border-navy-500 bg-navy-50/50 dark:bg-navy-950/20 text-navy-800 dark:text-navy-300 font-semibold'
                  : 'border-slate-200 dark:border-slate-800 bg-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40'
              }`}
            >
              <div className="flex items-center space-x-2.5 sm:space-x-3">
                <SlidersHorizontal size={18} className="text-navy-500 shrink-0" />
                <span className="text-xs sm:text-sm font-semibold">Customized Report</span>
              </div>
            </button>
          </div>
        </div>

        {/* Date parameters card depending on type */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs p-4 sm:p-5 space-y-3">
          <h3 className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200">
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

            {activeReport === 'custom' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="From Date"
                    name="customFDate"
                    type="date"
                    value={customFromDate}
                    onChange={(e) => setCustomFromDate(e.target.value)}
                  />
                  <Input
                    label="To Date"
                    name="customTDate"
                    type="date"
                    value={customToDate}
                    onChange={(e) => setCustomToDate(e.target.value)}
                  />
                </div>

                <Select
                  label="Filter by Customer"
                  name="customCustomer"
                  value={customCustomerId}
                  onChange={(e) => setCustomCustomerId(e.target.value)}
                  options={[
                    { value: 'all', label: 'All Customers (All-inclusive)' },
                    ...customers.map(c => ({ value: String(c.id), label: `${c.name} (${c.customer_code})` }))
                  ]}
                />

                <div className="grid grid-cols-2 gap-3">
                  <Select
                    label="Cube Type"
                    name="customCube"
                    value={customCubeType}
                    onChange={(e) => setCustomCubeType(e.target.value)}
                    options={[
                      { value: 'all', label: 'All Types' },
                      { value: 'manufactured', label: 'Production (MFC)' },
                      { value: 'resell', label: 'Resell (RSC)' }
                    ]}
                  />

                  <Select
                    label="Payment Method"
                    name="customPayment"
                    value={customPaymentType}
                    onChange={(e) => setCustomPaymentType(e.target.value)}
                    options={[
                      { value: 'all', label: 'All Methods' },
                      { value: 'cash', label: 'Cash Only' },
                      { value: 'debt', label: 'Credit / Debt' }
                    ]}
                  />
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Include Debt Details</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={customIncludeDebts}
                      onChange={(e) => setCustomIncludeDebts(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-navy-600"></div>
                  </label>
                </div>
              </>
            )}

            {activeReport === 'daily_manager' && (
              <p className="text-xs text-slate-500">
                Daily Manager Report auto-populates live stock balance, cash & credit income, debt recoveries, and operating expenses for any selected date with operational manager entries.
              </p>
            )}

            {activeReport !== 'daily_manager' && (
              <Button
                variant="primary"
                onClick={handleGenerateReport}
                className="w-full flex items-center justify-center space-x-2 py-2 rounded-xl"
              >
                <FileBarChart2 size={16} />
                <span>Compile Preview</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* 2. Preview Panel Section */}
      <div className="xl:col-span-2 space-y-6">
        {activeReport === 'daily_manager' ? (
          <DailyManagerReportView />
        ) : (
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
                      enablePagination={false}
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
                      enablePagination={false}
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
                      enablePagination={false}
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
                          <td className="px-6 py-2.5">
                            {(sale.sale_items?.length || 0) > 1 ? (
                              <Badge type="mixed" label="MIXED" />
                            ) : (
                              <Badge type={sale.cube_type === 'manufactured' ? 'MFC' : 'RSC'} />
                            )}
                          </td>
                          <td className="px-6 py-2.5 font-mono">{sale.quantity.toLocaleString()}</td>
                          <td className="px-6 py-2.5 font-mono font-semibold">LKR {sale.total_amount.toLocaleString()}</td>
                          <td className="px-6 py-2.5"><Badge type={sale.payment_type} /></td>
                          <td className="px-6 py-2.5 font-mono text-slate-400">{new Date(sale.sale_date).toLocaleDateString()}</td>
                        </tr>
                      )}
                    />
                  </div>
                )}

                {/* Conditional Debt Details Table for Custom Reports */}
                {activeReport === 'custom' && previewData?.customDebtDetails && (
                  <div className="space-y-3 pt-4 border-t border-dashed border-slate-200 dark:border-slate-800">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-rose-500">Associated Outstanding Debts</h4>
                    <Table
                      enablePagination={false}
                      headers={[
                        { key: 'code', label: 'Code' },
                        { key: 'name', label: 'Customer' },
                        { key: 'originalAmount', label: 'Original Debt' },
                        { key: 'paidAmount', label: 'Paid' },
                        { key: 'amountOwed', label: 'Remaining Owed' },
                        { key: 'status', label: 'Status' }
                      ]}
                      data={previewData.customDebtDetails}
                      emptyMessage="No associated debt records for selected filters."
                      renderRow={(d) => (
                        <tr key={d.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 text-xs">
                          <td className="px-6 py-2.5 font-mono font-medium text-navy-600 dark:text-navy-400">{d.code}</td>
                          <td className="px-6 py-2.5 font-semibold">{d.name}</td>
                          <td className="px-6 py-2.5 font-mono">LKR {d.originalAmount?.toLocaleString()}</td>
                          <td className="px-6 py-2.5 font-mono text-emerald-600">LKR {d.paidAmount?.toLocaleString()}</td>
                          <td className="px-6 py-2.5 font-bold font-mono text-rose-600 dark:text-rose-400">LKR {d.amountOwed?.toLocaleString()}</td>
                          <td className="px-6 py-2.5"><Badge type={d.status} /></td>
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
                      <p>Production (MFC) Sold: <span className="font-bold">{previewData.summary.mfcSold.toLocaleString()} units</span></p>
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
      )}
    </div>
  </div>
);
}



