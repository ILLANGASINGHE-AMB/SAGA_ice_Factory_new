import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';

const PAYMENT_METHOD_LABELS = {
  cash: 'Cash',
  bank_transfer: 'Bank',
  cheque: 'Cheque',
  card: 'Card',
  other: 'Other'
};

export function useDailyReport(fromDateStr, toDateStr, fromTime, toTime) {
  const [loading, setLoading] = useState(true);
  const [savedRecord, setSavedRecord] = useState(null);

  // Raw data from system tables
  const [sales, setSales] = useState([]);
  const [debts, setDebts] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [invTransactions, setInvTransactions] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [trips, setTrips] = useState([]);
  const [notes, setNotes] = useState([]);
  const [expenseCategories, setExpenseCategories] = useState([]);
  const [expenseItems, setExpenseItems] = useState([]);
  const [expenseLedgerRows, setExpenseLedgerRows] = useState([]);
  const [expenseAmounts, setExpenseAmounts] = useState([]);

  // Manual Input State (for manager entries & cash/bank logs)
  const [manualInputs, setManualInputs] = useState({
    brineCubes: 0,
    brineCubesConfirmed: false,
    freeIssue: 0,
    damagedCubes: 0,
    pmProductionQty: 0,
    otherReceipts: 0,
    bankDepositAmount: 0,
    bankDepositToday: 0,
    cashDepositedToday: 0,
    cashOnHand: 0,
    cashOnHandConfirmed: false,
    chequesOnHand: 0,
    chequeEntries: [],
    withdrawals: [],
    otherDetails: '',
    verifiedBy: ''
  });

  const targetFromStr = fromDateStr || new Date().toISOString().slice(0, 10);
  const targetToStr = toDateStr || targetFromStr;

  // Fetch all relevant data for the range with bulletproof per-table error catching
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [
        salesRes,
        debtsRes,
        settlementsRes,
        customersRes,
        inventoryRes,
        invTxnRes,
        employeesRes,
        attendanceRes,
        vehiclesRes,
        tripsRes,
        notesRes,
        expenseCategoriesRes,
        expenseItemsRes,
        expenseLedgerRes,
        expenseAmountsRes,
        savedReportRes,
        previousReportRes
      ] = await Promise.all([
        supabase.from('sales').select('*, customer:customers(*)').then(res => res.data || []).catch(() => []),
        supabase.from('debts').select('*, customer:customers(*), sale:sales(*)').then(res => res.data || []).catch(() => []),
        supabase.from('debt_settlements').select('*, customer:customers(*)').then(res => res.data || []).catch(() => []),
        supabase.from('customers').select('*').then(res => res.data || []).catch(() => []),
        supabase.from('inventory').select('*').then(res => res.data || []).catch(() => []),
        supabase.from('inventory_transactions').select('*, inventory(*)').then(res => res.data || []).catch(() => []),
        supabase.from('employees').select('*').then(res => res.data || []).catch(() => []),
        supabase.from('employee_attendance').select('*').then(res => res.data || []).catch(() => []),
        supabase.from('vehicles').select('*').then(res => res.data || []).catch(() => []),
        supabase.from('vehicle_trips').select('*').then(res => res.data || []).catch(() => []),
        supabase.from('notes').select('*').then(res => res.data || []).catch(() => []),
        supabase.from('expense_categories').select('*').then(res => res.data || []).catch(() => []),
        supabase.from('expense_items').select('*').then(res => res.data || []).catch(() => []),
        supabase.from('expense_ledger_rows').select('*').then(res => res.data || []).catch(() => []),
        supabase.from('expense_amounts').select('*').then(res => res.data || []).catch(() => []),
        supabase.from('daily_manager_reports').select('*').eq('report_date', targetFromStr).maybeSingle().then(res => res.data || null).catch(() => null),
        // Most recent PRIOR day's saved report, used to carry forward the
        // true running cash/bank balances (closing balance -> next day's
        // opening balance) when today has no saved report yet. Without this,
        // a new day silently starts assuming an empty till/bank account.
        supabase.from('daily_manager_reports')
          .select('cash_on_hand, bank_deposit_amount, cheques_on_hand, cash_on_hand_confirmed')
          .lt('report_date', targetFromStr)
          .order('report_date', { ascending: false })
          .limit(1)
          .maybeSingle()
          .then(res => res.data || null)
          .catch(() => null)
      ]);

      setSales(salesRes);
      setDebts(debtsRes);
      setSettlements(settlementsRes);
      setCustomers(customersRes);
      setInventory(inventoryRes);
      setEmployees(employeesRes);
      setAttendance(attendanceRes);
      setVehicles(vehiclesRes);
      setTrips(tripsRes);
      setNotes(notesRes);
      setExpenseCategories(expenseCategoriesRes);
      setExpenseItems(expenseItemsRes);
      setExpenseLedgerRows(expenseLedgerRes);
      setExpenseAmounts(expenseAmountsRes);

      // Fallback to local storage if Supabase transactions empty or error
      if (!invTxnRes || invTxnRes.length === 0) {
        const savedTxns = localStorage.getItem('saga_inventory_transactions');
        setInvTransactions(savedTxns ? JSON.parse(savedTxns) : []);
      } else {
        setInvTransactions(invTxnRes);
      }

      const localKey = `saga_daily_report_${targetFromStr}`;
      const localData = localStorage.getItem(localKey);
      let localParsed = {};
      if (localData) {
        try { localParsed = JSON.parse(localData); } catch (e) {}
      }

      if (savedReportRes) {
        setSavedRecord(savedReportRes);
        setManualInputs({
          brineCubes: savedReportRes.brine_cubes ?? localParsed.brineCubes ?? 0,
          // Default true when the column is absent/null (pre-migration
          // rows), same reasoning as cash_on_hand_confirmed above.
          brineCubesConfirmed: savedReportRes.brine_cubes_confirmed ?? localParsed.brineCubesConfirmed ?? true,
          freeIssue: savedReportRes.free_issue ?? localParsed.freeIssue ?? 0,
          damagedCubes: savedReportRes.damaged_cubes ?? localParsed.damagedCubes ?? 0,
          pmProductionQty: savedReportRes.pm_production_qty ?? localParsed.pmProductionQty ?? 0,
          otherReceipts: savedReportRes.other_receipts ?? localParsed.otherReceipts ?? 0,
          bankDepositAmount: savedReportRes.bank_deposit_amount ?? localParsed.bankDepositAmount ?? 0,
          bankDepositToday: savedReportRes.bank_deposit_today ?? localParsed.bankDepositToday ?? 0,
          cashDepositedToday: savedReportRes.cash_deposited_today ?? localParsed.cashDepositedToday ?? 0,
          cashOnHand: savedReportRes.cash_on_hand ?? localParsed.cashOnHand ?? 0,
          // Default true when the column is absent/null (pre-migration rows)
          // so an already-saved cash_on_hand value keeps being trusted as-is
          // rather than retroactively treated as "unconfirmed".
          cashOnHandConfirmed: savedReportRes.cash_on_hand_confirmed ?? localParsed.cashOnHandConfirmed ?? true,
          chequesOnHand: savedReportRes.cheques_on_hand ?? localParsed.chequesOnHand ?? 0,
          chequeEntries: Array.isArray(savedReportRes.cheque_entries) && savedReportRes.cheque_entries.length > 0 ? savedReportRes.cheque_entries : (localParsed.chequeEntries || []),
          withdrawals: Array.isArray(savedReportRes.withdrawals) && savedReportRes.withdrawals.length > 0 ? savedReportRes.withdrawals : (localParsed.withdrawals || []),
          otherDetails: savedReportRes.other_details || localParsed.otherDetails || '',
          verifiedBy: savedReportRes.verified_by || localParsed.verifiedBy || ''
        });
      } else {
        if (Object.keys(localParsed).length > 0) {
          setManualInputs(localParsed);
        } else {
          // No saved report for this date yet (DB or local). Carry forward
          // yesterday's (or the most recent prior day's) closing cash/bank
          // balances as today's opening balances, instead of silently
          // starting from zero as if the till and bank account were empty.
          // bankDepositToday, cashDepositedToday, cheques and withdrawals
          // are genuinely day-scoped activity and always start fresh. Only
          // carry forward as "confirmed" if the prior day's own cash figure
          // was itself a real confirmed entry, not just an unconfirmed
          // auto-calculated guess that never got saved explicitly.
          const priorConfirmed = !!previousReportRes?.cash_on_hand_confirmed;
          setManualInputs({
            brineCubes: 0,
            brineCubesConfirmed: false,
            freeIssue: 0,
            damagedCubes: 0,
            pmProductionQty: 0,
            otherReceipts: 0,
            bankDepositAmount: previousReportRes?.bank_deposit_amount ?? 0,
            bankDepositToday: 0,
            cashDepositedToday: 0,
            cashOnHand: priorConfirmed ? (previousReportRes?.cash_on_hand ?? 0) : 0,
            cashOnHandConfirmed: priorConfirmed,
            chequesOnHand: previousReportRes?.cheques_on_hand ?? 0,
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
  }, [targetFromStr]);

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel(`daily-report-realtime-${Math.random()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'debt_settlements' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expense_ledger_rows' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expense_amounts' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_transactions' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employee_attendance' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicle_trips' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notes' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_manager_reports' }, () => fetchData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  // Compute live metrics for the selected [fromDate, toDate] x [fromTime, toTime] window
  const reportData = useMemo(() => {
    const fromDateTime = new Date(`${targetFromStr}T${fromTime || '00:00'}:00`);
    const toDateTime = new Date(`${targetToStr}T${toTime || '23:59'}:59`);

    // For timestamptz columns (sale_date, settlement_date, created_at) — full date+time range.
    const isInRange = (dStr) => {
      if (!dStr) return false;
      const d = new Date(dStr);
      if (isNaN(d.getTime())) return false;
      return d >= fromDateTime && d <= toDateTime;
    };

    // For plain `date` columns (entry_date, attendance_date, trip_date) which carry no
    // time-of-day to filter against — date-only range, ISO strings compare lexicographically.
    const isInDateRange = (dateStr) => {
      if (!dateStr) return false;
      return dateStr >= targetFromStr && dateStr <= targetToStr;
    };

    // Helper to get inventory item by type
    const mfcItem = inventory.find(i => i.type === 'manufactured');
    const rscItem = inventory.find(i => i.type === 'resell');
    const wstItem = inventory.find(i => i.type === 'waste');

    // 1. Stock / Production Details for the selected range
    let mfcTxnAdditions = 0;
    let rscTxnAdditions = 0;
    let brineTxnAdditions = 0;

    invTransactions.forEach(txn => {
      if (isInRange(txn.created_at) && (txn.transaction_type === 'add' || Number(txn.quantity_change) > 0)) {
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

    // Production = Production Cubes added in range
    const todaysProduction = mfcTxnAdditions;
    // Purchases = Resell Cubes added in range
    const todaysPurchase = rscTxnAdditions;

    const todaysSalesRecords = sales.filter(s => isInRange(s.sale_date));
    const todaysSalesQty = todaysSalesRecords.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0);

    // Cubes sent to the "Branch PK" customer specifically, broken out from
    // the aggregate sales total per the Daily Manager Report spec.
    const branchCubes = todaysSalesRecords
      .filter(s => (s.customer?.name || customers.find(c => Number(c.id) === Number(s.customer_id))?.name) === 'Branch PK')
      .reduce((sum, s) => sum + (Number(s.quantity) || 0), 0);

    // Brine Cubes = Brine cubes added in range or manual entry
    // A manager explicitly entering 0 to correct the auto-calculated value
    // must be honored — checking `> 0` would treat that 0 as "not entered"
    // and silently revert to the auto value. brineCubesConfirmed is the
    // explicit signal for "this was actually saved", set only when the
    // Daily Manager Report form itself is saved.
    const brineCubes = manualInputs.brineCubesConfirmed ? (Number(manualInputs.brineCubes) || 0) : brineTxnAdditions;
    const freeIssue = Number(manualInputs.freeIssue) || 0;
    const damagedCubes = Number(manualInputs.damagedCubes) || 0;

    // `inventory.quantity` is a LIVE figure — it already reflects the
    // range's production, purchases, brine additions, and sales the moment
    // they happen (via the atomic RPCs). So the true opening ("previous")
    // balance is today's live total with the range's movements backed OUT,
    // not the live total itself. Re-adding those same movements on top of
    // the live total (the old behavior) double-counted every day there was
    // any activity — see Audit_Issues_And_Fixes.md #4.1.
    const currentTotalStock = inventory.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
    const previousDayBalance = currentTotalStock - todaysProduction - todaysPurchase - brineCubes + todaysSalesQty;

    // closingBalance therefore reduces to currentTotalStock minus whatever
    // was reported as free-issued/damaged — those are pure manual report
    // entries that never touch the actual inventory table, so they're the
    // only genuine adjustment left to apply on top of the live total.
    const closingBalance = previousDayBalance + todaysProduction + todaysPurchase + brineCubes - freeIssue - damagedCubes - todaysSalesQty;

    // 2. Income Details
    const cashSalesRecords = todaysSalesRecords.filter(s => s.payment_type === 'cash');
    const cashSoldQty = cashSalesRecords.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0);
    const cashSalesAmount = cashSalesRecords.reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0);

    const creditSalesRecords = todaysSalesRecords.filter(s => s.payment_type === 'debt');
    const creditSalesAmount = creditSalesRecords.reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0);

    const todaysSettlements = settlements.filter(setl => isInRange(setl.settlement_date));
    const creditAmountReceived = todaysSettlements.reduce((sum, setl) => sum + (Number(setl.amount_paid) || 0), 0);

    const otherReceipts = Number(manualInputs.otherReceipts) || 0;
    const totalIncome = cashSalesAmount + creditAmountReceived + otherReceipts;

    // 3. Details of Credit Given Today
    const creditGivenList = creditSalesRecords.map((s, idx) => {
      const cust = s.customer || customers.find(c => Number(c.id) === Number(s.customer_id));
      // Cumulative outstanding balance for this customer across ALL their
      // debts (not just this one sale's debt) — the spec's "Total Debt
      // Balance LKR" is a running balance, distinct from today's amount.
      const totalDebtBalance = debts
        .filter(d => Number(d.customer_id) === Number(cust?.id))
        .reduce((sum, d) => sum + (Number(d.remaining_amount) || 0), 0);
      return {
        no: idx + 1,
        location: cust?.address || 'Plant',
        customerName: cust?.name || 'Walk-in',
        phone: cust?.whatsapp_number || cust?.contact_number || 'N/A',
        quantity: s.quantity,
        amount: Number(s.total_amount),
        totalDebtBalance
      };
    });
    const totalCreditGivenAmount = creditGivenList.reduce((sum, item) => sum + item.amount, 0);

    // 4. Credit Amount Collection / Repayment
    const creditCollectionList = todaysSettlements.map(setl => {
      const cust = setl.customer || customers.find(c => Number(c.id) === Number(setl.customer_id));
      // Match by debt_id (the settlement's actual debt), not customer_id — a
      // customer can have multiple debts, and matching by customer alone
      // could pick a different (possibly already-settled) debt, reporting
      // the wrong outstanding balance for this specific repayment.
      const matchingDebt = debts.find(d => Number(d.id) === Number(setl.debt_id));
      return {
        name: cust?.name || 'Customer',
        method: PAYMENT_METHOD_LABELS[setl.payment_method] || 'Cash',
        settlementDate: setl.settlement_date ? setl.settlement_date.slice(0, 10) : '',
        debtAmount: matchingDebt ? Number(matchingDebt.total_amount) : 0,
        amountReceived: Number(setl.amount_paid),
        outstandingAmount: matchingDebt ? Number(matchingDebt.remaining_amount) : 0
      };
    });
    const totalCreditCollectedAmount = creditCollectionList.reduce((sum, item) => sum + item.amountReceived, 0);

    // 5. Expense Details — sourced from the Cash Book grid schema
    // (expense_ledger_rows x expense_amounts), which replaced the old flat
    // operating_expenses table. One ledger row (date + description) can
    // carry amounts across several expense items/categories, so each
    // non-zero amount becomes its own report line.
    const expenseCategoryById = new Map(expenseCategories.map(c => [c.id, c]));
    const expenseItemById = new Map(expenseItems.map(i => [i.id, i]));
    const rangeLedgerRows = expenseLedgerRows.filter(r => isInDateRange(r.entry_date));
    const rangeLedgerRowIds = new Set(rangeLedgerRows.map(r => r.id));
    const ledgerRowById = new Map(rangeLedgerRows.map(r => [r.id, r]));

    const expenseList = expenseAmounts
      .filter(a => rangeLedgerRowIds.has(a.ledger_row_id) && Number(a.amount) > 0)
      .map(a => {
        const row = ledgerRowById.get(a.ledger_row_id);
        const item = expenseItemById.get(a.expense_item_id);
        const category = item ? expenseCategoryById.get(item.category_id) : null;
        return {
          date: row?.entry_date || '',
          description: row?.description || item?.name || '',
          category: category?.name || 'Uncategorized',
          expenseType: item?.name || 'Other',
          amount: Number(a.amount) || 0
        };
      })
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
      .map((item, idx) => ({ no: idx + 1, ...item }));
    const totalExpensesAmount = expenseList.reduce((sum, item) => sum + item.amount, 0);

    // Cash & Bank withdrawals summary
    const withdrawalsList = manualInputs.withdrawals || [];
    const cashWithdrawals = withdrawalsList.filter(w => w.source === 'cash').reduce((sum, w) => sum + (Number(w.amount) || 0), 0);
    const bankWithdrawals = withdrawalsList.filter(w => w.source === 'bank').reduce((sum, w) => sum + (Number(w.amount) || 0), 0);

    // Cheques summary
    const chequeList = manualInputs.chequeEntries || [];
    const totalChequesValue = chequeList.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);

    const bankDepositAmount = Number(manualInputs.bankDepositAmount) || 0;
    const cashOnHand = Number(manualInputs.cashOnHand) || 0;
    const chequesOnHand = Number(manualInputs.chequesOnHand) || totalChequesValue;
    const totalBankDeposit = bankDepositAmount + cashOnHand + chequesOnHand;

    // 7. Employee Details — real attendance history, not manual entry
    const employeeById = new Map(employees.map(e => [e.id, e]));
    const employeeAttendanceList = attendance
      .filter(a => isInDateRange(a.attendance_date))
      .map(a => ({
        employeeName: employeeById.get(a.employee_id)?.name || 'Unknown',
        date: a.attendance_date,
        startTime: (a.start_time || '').slice(0, 5) || '-',
        endTime: (a.end_time || '').slice(0, 5) || '-'
      }))
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    // 8. Vehicle Details — real trip history, not manual entry
    const vehicleById = new Map(vehicles.map(v => [v.id, v]));
    const vehicleTripList = trips
      .filter(t => isInDateRange(t.trip_date))
      .map(t => ({
        tripId: `TRIP-${String(t.id).padStart(4, '0')}`,
        date: t.trip_date,
        vehicleNo: vehicleById.get(t.vehicle_id)?.vehicle_no || '',
        description: t.description || '',
        startKm: Number(t.start_odometer) || 0,
        endKm: Number(t.end_odometer) || 0,
        distance: Number(t.distance_travelled ?? (t.end_odometer - t.start_odometer)) || 0
      }))
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
      .map((trip, idx) => ({ no: idx + 1, ...trip }));
    const totalVehicleDistance = vehicleTripList.reduce((sum, t) => sum + t.distance, 0);

    // 9. Notes — real ledger from the Notes & Messages tab
    const notesList = notes
      .filter(n => isInRange(n.created_at))
      .map(n => ({
        text: n.note_text,
        createdBy: n.created_by,
        createdAt: n.created_at
      }))
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    return {
      reportDate: targetFromStr,
      reportDateFrom: targetFromStr,
      reportDateTo: targetToStr,
      reportTimeFrom: fromTime || '00:00',
      reportTimeTo: toTime || '23:59',
      stockDetails: {
        previousDayBalance,
        todaysProduction,
        todaysPurchase,
        brineCubes,
        freeIssue,
        damagedCubes,
        todaysSalesQty,
        branchCubes,
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
        bankDepositAmount,
        bankDepositToday: Number(manualInputs.bankDepositToday) || 0,
        cashDepositedToday: Number(manualInputs.cashDepositedToday) || 0,
        cashOnHand,
        cashOnHandConfirmed: !!manualInputs.cashOnHandConfirmed,
        chequesOnHand,
        totalBankDeposit,
        cashWithdrawals,
        bankWithdrawals,
        chequeEntries: chequeList,
        withdrawals: withdrawalsList
      },
      employeeAttendanceList,
      vehicleTripList,
      totalVehicleDistance,
      notesList,
      otherDetails: manualInputs.otherDetails || '',
      verifiedBy: manualInputs.verifiedBy || ''
    };
  }, [targetFromStr, targetToStr, fromTime, toTime, sales, debts, settlements, customers, inventory, invTransactions, employees, attendance, vehicles, trips, notes, expenseCategories, expenseItems, expenseLedgerRows, expenseAmounts, manualInputs]);

  // Save manual updates with safe column handling
  const saveDailyReport = async (updatedInputs) => {
    const payload = {
      ...manualInputs,
      ...updatedInputs
    };

    setManualInputs(payload);

    // Save to LocalStorage immediately
    localStorage.setItem(`saga_daily_report_${targetFromStr}`, JSON.stringify(payload));

    const dbPayload = {
      report_date: targetFromStr,
      brine_cubes: Number(payload.brineCubes) || 0,
      brine_cubes_confirmed: !!payload.brineCubesConfirmed,
      free_issue: Number(payload.freeIssue) || 0,
      damaged_cubes: Number(payload.damagedCubes) || 0,
      pm_production_qty: Number(payload.pmProductionQty) || 0,
      other_receipts: Number(payload.otherReceipts) || 0,
      bank_deposit_amount: Number(payload.bankDepositAmount) || 0,
      bank_deposit_today: Number(payload.bankDepositToday) || 0,
      cash_deposited_today: Number(payload.cashDepositedToday) || 0,
      cash_on_hand: Number(payload.cashOnHand) || 0,
      cash_on_hand_confirmed: !!payload.cashOnHandConfirmed,
      cheques_on_hand: Number(payload.chequesOnHand) || 0,
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

      if (error) {
        console.warn("Supabase upsert daily report warning (trying basic payload):", error.message);
        // Fallback without new jsonb columns if they don't exist yet on DB
        const basicPayload = {
          report_date: targetFromStr,
          brine_cubes: Number(payload.brineCubes) || 0,
          brine_cubes_confirmed: !!payload.brineCubesConfirmed,
          free_issue: Number(payload.freeIssue) || 0,
          damaged_cubes: Number(payload.damagedCubes) || 0,
          pm_production_qty: Number(payload.pmProductionQty) || 0,
          other_receipts: Number(payload.otherReceipts) || 0,
          bank_deposit_amount: Number(payload.bankDepositAmount) || 0,
          bank_deposit_today: Number(payload.bankDepositToday) || 0,
          cash_deposited_today: Number(payload.cashDepositedToday) || 0,
          cash_on_hand: Number(payload.cashOnHand) || 0,
          cash_on_hand_confirmed: !!payload.cashOnHandConfirmed,
          cheques_on_hand: Number(payload.chequesOnHand) || 0,
          other_details: payload.otherDetails || '',
          verified_by: payload.verifiedBy || ''
        };
        const { data: bData } = await supabase
          .from('daily_manager_reports')
          .upsert(basicPayload, { onConflict: 'report_date' })
          .select('*')
          .single();
        if (bData) setSavedRecord(bData);
      } else if (data) {
        setSavedRecord(data);
      }
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
