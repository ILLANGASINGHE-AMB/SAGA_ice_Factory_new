import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';

export function useDailyReport(reportDateStr) {
  const [loading, setLoading] = useState(true);
  const [savedRecord, setSavedRecord] = useState(null);

  // Raw data from system tables
  const [sales, setSales] = useState([]);
  const [debts, setDebts] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [batches, setBatches] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [invTransactions, setInvTransactions] = useState([]);

  // Manual Input State (for manager entries & cash/bank logs)
  const [manualInputs, setManualInputs] = useState({
    brineCubes: 0,
    freeIssue: 0,
    damagedCubes: 0,
    pmProductionQty: 0,
    otherReceipts: 0,
    bankDepositAmount: 0,
    cashOnHand: 0,
    chequesOnHand: 0,
    employeeLogs: [],
    vehicleLogs: [],
    chequeEntries: [],
    withdrawals: [],
    otherDetails: '',
    verifiedBy: ''
  });

  const targetDateStr = reportDateStr || new Date().toISOString().slice(0, 10);

  // Fetch all relevant data for the date
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [
        { data: salesRes },
        { data: debtsRes },
        { data: settlementsRes },
        { data: batchesRes },
        { data: expensesRes },
        { data: customersRes },
        { data: inventoryRes },
        { data: invTxnRes, error: invTxnErr },
        { data: savedReportRes }
      ] = await Promise.all([
        supabase.from('sales').select('*, customer:customers(*)'),
        supabase.from('debts').select('*, customer:customers(*), sale:sales(*)'),
        supabase.from('debt_settlements').select('*, customer:customers(*)'),
        supabase.from('production_batches').select('*'),
        supabase.from('operating_expenses').select('*'),
        supabase.from('customers').select('*'),
        supabase.from('inventory').select('*'),
        supabase.from('inventory_transactions').select('*, inventory(*)'),
        supabase.from('daily_manager_reports').select('*').eq('report_date', targetDateStr).maybeSingle()
      ]);

      setSales(salesRes || []);
      setDebts(debtsRes || []);
      setSettlements(settlementsRes || []);
      setBatches(batchesRes || []);
      setExpenses(expensesRes || []);
      setCustomers(customersRes || []);
      setInventory(inventoryRes || []);

      // Fallback to local storage if Supabase transactions empty or error
      if (invTxnErr || !invTxnRes || invTxnRes.length === 0) {
        const savedTxns = localStorage.getItem('saga_inventory_transactions');
        setInvTransactions(savedTxns ? JSON.parse(savedTxns) : []);
      } else {
        setInvTransactions(invTxnRes);
      }

      if (savedReportRes) {
        setSavedRecord(savedReportRes);
        setManualInputs({
          brineCubes: savedReportRes.brine_cubes || 0,
          freeIssue: savedReportRes.free_issue || 0,
          damagedCubes: savedReportRes.damaged_cubes || 0,
          pmProductionQty: savedReportRes.pm_production_qty || 0,
          otherReceipts: savedReportRes.other_receipts || 0,
          bankDepositAmount: savedReportRes.bank_deposit_amount || 0,
          cashOnHand: savedReportRes.cash_on_hand || 0,
          chequesOnHand: savedReportRes.cheques_on_hand || 0,
          employeeLogs: Array.isArray(savedReportRes.employee_logs) ? savedReportRes.employee_logs : [],
          vehicleLogs: Array.isArray(savedReportRes.vehicle_logs) ? savedReportRes.vehicle_logs : [],
          chequeEntries: Array.isArray(savedReportRes.cheque_entries) ? savedReportRes.cheque_entries : [],
          withdrawals: Array.isArray(savedReportRes.withdrawals) ? savedReportRes.withdrawals : [],
          otherDetails: savedReportRes.other_details || '',
          verifiedBy: savedReportRes.verified_by || ''
        });
      } else {
        // Fallback to local storage if present
        const localKey = `saga_daily_report_${targetDateStr}`;
        const localData = localStorage.getItem(localKey);
        if (localData) {
          try {
            const parsed = JSON.parse(localData);
            setManualInputs(parsed);
          } catch (e) {
            console.warn("Error parsing local daily report:", e);
          }
        } else {
          setManualInputs({
            brineCubes: 0,
            freeIssue: 0,
            damagedCubes: 0,
            pmProductionQty: 0,
            otherReceipts: 0,
            bankDepositAmount: 0,
            cashOnHand: 0,
            chequesOnHand: 0,
            employeeLogs: [],
            vehicleLogs: [],
            chequeEntries: [],
            withdrawals: [],
            otherDetails: '',
            verifiedBy: ''
          });
        }
      }
    } catch (err) {
      console.error("Failed to fetch daily report data:", err);
      const savedTxns = localStorage.getItem('saga_inventory_transactions');
      setInvTransactions(savedTxns ? JSON.parse(savedTxns) : []);
    } finally {
      setLoading(false);
    }
  }, [targetDateStr]);

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel(`daily-report-realtime-${Math.random()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'debt_settlements' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_batches' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'operating_expenses' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_transactions' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_manager_reports' }, () => fetchData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  // Compute live metrics for targetDateStr
  const reportData = useMemo(() => {
    // Robust local YYYY-MM-DD date formatter
    const toLocalDateStr = (dStr) => {
      if (!dStr) return '';
      const d = new Date(dStr);
      if (isNaN(d.getTime())) return '';
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const isSameDate = (dStr) => {
      if (!dStr) return false;
      return toLocalDateStr(dStr) === targetDateStr;
    };

    // Helper to get inventory item by type
    const mfcItem = inventory.find(i => i.type === 'manufactured');
    const rscItem = inventory.find(i => i.type === 'resell');
    const wstItem = inventory.find(i => i.type === 'waste');

    // 1. Stock / Production Details for targetDateStr
    const todaysBatches = batches.filter(b => isSameDate(b.batch_date));
    const batchProductionQty = todaysBatches.reduce((sum, b) => sum + (Number(b.cubes_produced) || 0), 0);

    let mfcTxnAdditions = 0;
    let rscTxnAdditions = 0;
    let brineTxnAdditions = 0;

    invTransactions.forEach(txn => {
      if (isSameDate(txn.created_at) && (txn.transaction_type === 'add' || Number(txn.quantity_change) > 0)) {
        const invId = txn.inventory_id;
        const qty = Number(txn.quantity_change) || 0;
        
        if (mfcItem && Number(invId) === Number(mfcItem.id)) {
          mfcTxnAdditions += qty;
        } else if (rscItem && Number(invId) === Number(rscItem.id)) {
          rscTxnAdditions += qty;
        } else if (wstItem && Number(invId) === Number(wstItem.id)) {
          brineTxnAdditions += qty;
        }
      }
    });

    // Production = Manufactured Cubes added today
    const todaysProduction = batchProductionQty + mfcTxnAdditions;
    // Purchases = Resell Cubes added today
    const todaysPurchase = rscTxnAdditions;

    const todaysSalesRecords = sales.filter(s => isSameDate(s.sale_date));
    const todaysSalesQty = todaysSalesRecords.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0);

    // Prev Balance = Total current inventory stock (Production Cubes + Purchases Cubes + Brine Cubes)
    const previousDayBalance = inventory.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);

    // Brine Cubes = Brine cubes added today or manual entry
    const brineCubes = Number(manualInputs.brineCubes) > 0 ? Number(manualInputs.brineCubes) : brineTxnAdditions;
    const freeIssue = Number(manualInputs.freeIssue) || 0;
    const damagedCubes = Number(manualInputs.damagedCubes) || 0;

    const closingBalance = previousDayBalance + todaysProduction + todaysPurchase + brineCubes - freeIssue - damagedCubes - todaysSalesQty;

    // 2. Income Details
    const cashSalesRecords = todaysSalesRecords.filter(s => s.payment_type === 'cash');
    const cashSoldQty = cashSalesRecords.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0);
    const cashSalesAmount = cashSalesRecords.reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0);

    const creditSalesRecords = todaysSalesRecords.filter(s => s.payment_type === 'debt');
    const creditSalesAmount = creditSalesRecords.reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0);

    const todaysSettlements = settlements.filter(setl => isSameDate(setl.settlement_date));
    const creditAmountReceived = todaysSettlements.reduce((sum, setl) => sum + (Number(setl.amount_paid) || 0), 0);

    const otherReceipts = Number(manualInputs.otherReceipts) || 0;
    const totalIncome = cashSalesAmount + creditAmountReceived + otherReceipts;

    // 3. Details of Credit Given Today
    const creditGivenList = creditSalesRecords.map((s, idx) => {
      const cust = s.customer || customers.find(c => Number(c.id) === Number(s.customer_id));
      return {
        no: idx + 1,
        location: cust?.address || 'Plant',
        customerName: cust?.name || 'Walk-in',
        phone: cust?.whatsapp_number || 'N/A',
        quantity: s.quantity,
        amount: Number(s.total_amount)
      };
    });
    const totalCreditGivenAmount = creditGivenList.reduce((sum, item) => sum + item.amount, 0);

    // 4. Credit Amount Collection / Repayment
    const creditCollectionList = todaysSettlements.map(setl => {
      const cust = setl.customer || customers.find(c => Number(c.id) === Number(setl.customer_id));
      const matchingDebt = debts.find(d => Number(d.customer_id) === Number(setl.customer_id));
      return {
        name: cust?.name || 'Customer',
        method: 'Cash',
        amountReceived: Number(setl.amount_paid),
        outstandingAmount: matchingDebt ? Number(matchingDebt.remaining_amount) : 0
      };
    });
    const totalCreditCollectedAmount = creditCollectionList.reduce((sum, item) => sum + item.amountReceived, 0);

    // 5. Expense Details
    const todaysExpenses = expenses.filter(exp => isSameDate(exp.expense_date));
    const expenseList = todaysExpenses.map(exp => {
      const amt = Number(exp.amount) || 0;
      const rupees = Math.floor(amt);
      const cents = Math.round((amt - rupees) * 100);
      return {
        code: exp.expense_code,
        description: exp.description,
        rupees,
        cents: String(cents).padStart(2, '0'),
        totalAmount: amt
      };
    });
    const totalExpensesAmount = expenseList.reduce((sum, item) => sum + item.totalAmount, 0);

    // Cash & Bank withdrawals summary
    const withdrawalsList = manualInputs.withdrawals || [];
    const cashWithdrawals = withdrawalsList.filter(w => w.source === 'cash').reduce((sum, w) => sum + (Number(w.amount) || 0), 0);
    const bankWithdrawals = withdrawalsList.filter(w => w.source === 'bank').reduce((sum, w) => sum + (Number(w.amount) || 0), 0);

    // Cheques summary
    const chequeList = manualInputs.chequeEntries || [];
    const totalChequesValue = chequeList.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);

    return {
      reportDate: targetDateStr,
      stockDetails: {
        previousDayBalance,
        todaysProduction,
        todaysPurchase,
        brineCubes,
        freeIssue,
        damagedCubes,
        todaysSalesQty,
        closingBalance,
        pmProductionQty: Number(manualInputs.pmProductionQty) || 0,
        breakdown: {
          mfcAdded: todaysProduction,
          rscAdded: rscTxnAdditions,
          brineAdded: brineTxnAdditions
        }
      },
      incomeDetails: {
        cashSoldQty,
        cashSalesAmount,
        creditSalesAmount,
        creditAmountReceived,
        otherReceipts,
        totalIncome
      },
      creditGivenList,
      totalCreditGivenAmount,
      creditCollectionList,
      totalCreditCollectedAmount,
      expenseList,
      totalExpensesAmount,
      cashDetails: {
        bankDepositAmount: Number(manualInputs.bankDepositAmount) || 0,
        cashOnHand: Number(manualInputs.cashOnHand) || 0,
        chequesOnHand: Number(manualInputs.chequesOnHand) || totalChequesValue,
        cashWithdrawals,
        bankWithdrawals,
        chequeEntries: chequeList,
        withdrawals: withdrawalsList
      },
      employeeLogs: manualInputs.employeeLogs || [],
      vehicleLogs: manualInputs.vehicleLogs || [],
      otherDetails: manualInputs.otherDetails || '',
      verifiedBy: manualInputs.verifiedBy || ''
    };
  }, [targetDateStr, sales, debts, settlements, batches, expenses, customers, inventory, invTransactions, manualInputs]);

  // Save manual updates
  const saveDailyReport = async (updatedInputs) => {
    const payload = {
      ...manualInputs,
      ...updatedInputs
    };

    setManualInputs(payload);

    // Save to LocalStorage immediately
    localStorage.setItem(`saga_daily_report_${targetDateStr}`, JSON.stringify(payload));

    const dbPayload = {
      report_date: targetDateStr,
      brine_cubes: Number(payload.brineCubes) || 0,
      free_issue: Number(payload.freeIssue) || 0,
      damaged_cubes: Number(payload.damagedCubes) || 0,
      pm_production_qty: Number(payload.pmProductionQty) || 0,
      other_receipts: Number(payload.otherReceipts) || 0,
      bank_deposit_amount: Number(payload.bankDepositAmount) || 0,
      cash_on_hand: Number(payload.cashOnHand) || 0,
      cheques_on_hand: Number(payload.chequesOnHand) || 0,
      employee_logs: payload.employeeLogs || [],
      vehicle_logs: payload.vehicleLogs || [],
      cheque_entries: payload.chequeEntries || [],
      withdrawals: payload.withdrawals || [],
      other_details: payload.otherDetails || '',
      verified_by: payload.verifiedBy || '',
      verified_at: new Date().toISOString()
    };

    try {
      const { data, error } = await supabase
        .from('daily_manager_reports')
        .upsert(dbPayload, { onConflict: 'report_date' })
        .select('*')
        .single();

      if (error) throw error;
      if (data) setSavedRecord(data);
    } catch (err) {
      console.warn("Supabase upsert daily report error, stored locally:", err);
    }
  };

  return {
    loading,
    reportData,
    manualInputs,
    saveDailyReport,
    refetch: fetchData
  };
}
