import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { todayStr } from '../utils/date';
import { computeCashBankBalances } from '../utils/cashBankMath';
import { logActivity } from '../lib/activityLog';

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
  const [transportTrips, setTransportTrips] = useState([]);
  const [notes, setNotes] = useState([]);
  const [expenseCategories, setExpenseCategories] = useState([]);
  const [expenseItems, setExpenseItems] = useState([]);
  const [expenseLedgerRows, setExpenseLedgerRows] = useState([]);
  const [expenseAmounts, setExpenseAmounts] = useState([]);
  const [cashReceives, setCashReceives] = useState([]);
  const [bankDeposits, setBankDeposits] = useState([]);
  const [chequeRecords, setChequeRecords] = useState([]);
  const [bankWithdrawals, setBankWithdrawals] = useState([]);

  // Manual Input State — only Free Issue and Damaged Cubes are
  // manager-editable in Section 01; Section 06 (Cash/Bank/Cheques) is fully
  // derived from the real Cash & Bank ledger tables (see cashBankMath.js),
  // never manually entered or overwritten.
  const [manualInputs, setManualInputs] = useState({
    freeIssue: 0,
    damagedCubes: 0,
    otherReceipts: 0,
    otherDetails: '',
    verifiedBy: ''
  });

  const targetFromStr = fromDateStr || todayStr();
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
        transportTripsRes,
        notesRes,
        expenseCategoriesRes,
        expenseItemsRes,
        expenseLedgerRes,
        expenseAmountsRes,
        cashReceivesRes,
        bankDepositsRes,
        chequeRecordsRes,
        bankWithdrawalsRes,
        savedReportRes
      ] = await Promise.all([
        supabase.from('sales').select('*, customer:customers(*)').then(res => res.data || []).catch(() => []),
        supabase.from('debts').select('*, customer:customers(*), sale:sales(*)').then(res => res.data || []).catch(() => []),
        supabase.from('debt_settlements').select('*, customer:customers(*)').then(res => res.data || []).catch(() => []),
        supabase.from('customers').select('*').then(res => res.data || []).catch(() => []),
        supabase.from('inventory').select('*').then(res => res.data || []).catch(() => []),
        supabase.from('inventory_transactions').select('*, inventory(*)').then(res => res.data || []).catch(() => []),
        supabase.from('employees').select('*').then(res => res.data || []).catch(() => []),
        supabase.from('employee_attendance').select('*').then(res => res.data || []).catch(() => []),
        supabase.from('transport_trips').select('*').then(res => res.data || []).catch(() => []),
        supabase.from('notes').select('*').then(res => res.data || []).catch(() => []),
        supabase.from('expense_categories').select('*').then(res => res.data || []).catch(() => []),
        supabase.from('expense_items').select('*').then(res => res.data || []).catch(() => []),
        supabase.from('expense_ledger_rows').select('*').then(res => res.data || []).catch(() => []),
        supabase.from('expense_amounts').select('*').then(res => res.data || []).catch(() => []),
        supabase.from('cash_receives').select('*').then(res => res.data || []).catch(() => []),
        supabase.from('bank_deposits').select('*').then(res => res.data || []).catch(() => []),
        supabase.from('cheque_records').select('*').then(res => res.data || []).catch(() => []),
        supabase.from('bank_withdrawals').select('*').then(res => res.data || []).catch(() => []),
        supabase.from('daily_manager_reports').select('*').eq('report_date', targetFromStr).maybeSingle().then(res => res.data || null).catch(() => null)
      ]);

      setSales(salesRes);
      setDebts(debtsRes);
      setSettlements(settlementsRes);
      setCustomers(customersRes);
      setInventory(inventoryRes);
      setEmployees(employeesRes);
      setAttendance(attendanceRes);
      setTransportTrips(transportTripsRes);
      setNotes(notesRes);
      setExpenseCategories(expenseCategoriesRes);
      setExpenseItems(expenseItemsRes);
      setExpenseLedgerRows(expenseLedgerRes);
      setExpenseAmounts(expenseAmountsRes);
      setCashReceives(cashReceivesRes);
      setBankDeposits(bankDepositsRes);
      setChequeRecords(chequeRecordsRes);
      setBankWithdrawals(bankWithdrawalsRes);

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

      setSavedRecord(savedReportRes || null);
      if (savedReportRes) {
        setManualInputs({
          freeIssue: savedReportRes.free_issue ?? localParsed.freeIssue ?? 0,
          damagedCubes: savedReportRes.damaged_cubes ?? localParsed.damagedCubes ?? 0,
          otherReceipts: savedReportRes.other_receipts ?? localParsed.otherReceipts ?? 0,
          otherDetails: savedReportRes.other_details || localParsed.otherDetails || '',
          verifiedBy: savedReportRes.verified_by || localParsed.verifiedBy || ''
        });
      } else if (Object.keys(localParsed).length > 0) {
        setManualInputs(localParsed);
      } else {
        setManualInputs({
          freeIssue: 0,
          damagedCubes: 0,
          otherReceipts: 0,
          otherDetails: '',
          verifiedBy: ''
        });
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'debts' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'debt_settlements' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expense_ledger_rows' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expense_amounts' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_transactions' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employees' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employee_attendance' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transport_trips' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notes' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_receives' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bank_deposits' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cheque_records' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bank_withdrawals' }, () => fetchData())
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

    // Cash/Bank/Cheque balances are running totals, not period deltas — "as
    // of this report's range end" means every ledger entry dated on or
    // before it, same running-balance semantics as useCashBank (Final_Cash_
    // Bank_Cheque_Logic.md). Cheque status itself has no history table, so
    // it's always the current value; only the dated rows are filtered.
    const isUpToRangeEnd = (dStr) => {
      if (!dStr) return false;
      const d = new Date(dStr);
      if (isNaN(d.getTime())) return false;
      return d <= toDateTime;
    };

    // Helper to get inventory item by type
    const mfcItem = inventory.find(i => i.type === 'manufactured');
    const rscItem = inventory.find(i => i.type === 'resell');
    const wstItem = inventory.find(i => i.type === 'waste');
    const dgcItem = inventory.find(i => i.type === 'damaged');

    // 1. Stock / Production Details for the selected range
    let mfcTxnAdditions = 0;
    let rscTxnAdditions = 0;
    let brineTxnAdditions = 0;
    let damagedTxnAdditions = 0;
    // Cubes given away on orders in this range. Free cubes leave Production /
    // Resell stock exactly like sold cubes do, but are not in sales.quantity —
    // so the stock math below has to account for them separately.
    let freeIssueQty = 0;

    invTransactions.forEach(txn => {
      if (!isInRange(txn.created_at)) return;
      const invId = txn.inventory_id;
      const qty = Number(txn.quantity_change) || 0;

      if (txn.transaction_type === 'free_issue') {
        freeIssueQty += Math.abs(qty);
        return;
      }

      if (txn.transaction_type === 'add' || qty > 0) {
        if (mfcItem && Number(invId) === Number(mfcItem.id)) {
          mfcTxnAdditions += qty;
        } else if (rscItem && Number(invId) === Number(rscItem.id)) {
          rscTxnAdditions += qty;
        } else if (wstItem && Number(invId) === Number(wstItem.id)) {
          brineTxnAdditions += qty;
        } else if (dgcItem && Number(invId) === Number(dgcItem.id)) {
          damagedTxnAdditions += qty;
        }
      }
    });

    // Production = Production Cubes added in range
    const todaysProduction = mfcTxnAdditions;
    // Purchases = Resell Cubes added in range
    const todaysPurchase = rscTxnAdditions;

    const todaysSalesRecords = sales.filter(s => isInRange(s.sale_date));
    const todaysSalesQty = todaysSalesRecords.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0);

    // Cubes sent to any customer flagged as a branch (Settings → Set
    // Branch), broken out per branch from the aggregate sales total per the
    // Daily Manager Report spec. Any number of branches can be saved, so
    // this is a list rather than one hardcoded name/total.
    const branchSalesList = customers
      .filter(c => c.is_branch)
      .map(branch => ({
        branchName: branch.name,
        quantity: todaysSalesRecords
          .filter(s => Number(s.customer_id) === Number(branch.id))
          .reduce((sum, s) => sum + (Number(s.quantity) || 0), 0)
      }))
      .filter(b => b.quantity > 0);
    const branchCubes = branchSalesList.reduce((sum, b) => sum + b.quantity, 0);

    // Brine and Damaged Cubes = cubes added to those lines in range. Both are
    // auto-calculated, view-only figures: they are separate stock counts, not
    // deductions from sellable stock, so neither belongs in Closing Balance.
    const brineCubes = brineTxnAdditions;
    const damagedCubes = damagedTxnAdditions;
    // Free Issue used to be a manager-typed number because the system had no
    // record of giveaways. Orders now carry a Free Cubes quantity that really
    // deducts stock and logs a 'free_issue' inventory transaction, so this is
    // derived from that ledger instead of being entered by hand.
    const freeIssue = freeIssueQty;

    // `inventory.quantity` is a LIVE figure — it already reflects the
    // range's production, purchases, and sales the moment they happen (via
    // the atomic RPCs). So the true opening ("previous") balance is today's
    // live total with the range's movements backed OUT, not the live total
    // itself. Re-adding those same movements on top of the live total (the
    // old behavior) double-counted every day there was any activity — see
    // Audit_Issues_And_Fixes.md #4.1.
    //
    // Brine (BNC) and Damaged (DGC) are deliberately excluded from this total
    // — both are view-only figures in every report and must never feed stock
    // math. Free cubes DO belong here: they physically left Production/Resell
    // stock, so they are added back when winding the live total backwards to
    // the opening balance, exactly like sold cubes are.
    const currentTotalStock = (Number(mfcItem?.quantity) || 0) + (Number(rscItem?.quantity) || 0);
    const previousDayBalance = currentTotalStock - todaysProduction - todaysPurchase + todaysSalesQty + freeIssue;

    // closingBalance therefore winds forward to exactly the live total again.
    const closingBalance = previousDayBalance + todaysProduction + todaysPurchase - freeIssue - todaysSalesQty;

    // 2. Income Details
    const cashSalesRecords = todaysSalesRecords.filter(s => s.payment_type === 'cash');
    const cashSoldQty = cashSalesRecords.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0);
    const cashSalesAmount = cashSalesRecords.reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0);

    const creditSalesRecords = todaysSalesRecords.filter(s => s.payment_type === 'debt');
    const creditSalesAmount = creditSalesRecords.reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0);

    const todaysSettlements = settlements.filter(setl => isInRange(setl.settlement_date));

    // "Credit Amount Received" is money COLLECTED, so it must exclude
    // settlements the system applied automatically when a cash order paid down
    // the customer's existing debt: that cash is already in cashSalesAmount as
    // the sale, and adding it again overstated Total Income by the offset.
    const autoAppliedSettlements = todaysSettlements.filter(setl => setl.is_auto_applied);
    const collectedSettlements = todaysSettlements.filter(setl => !setl.is_auto_applied);

    const creditAmountReceived = collectedSettlements.reduce((sum, setl) => sum + (Number(setl.amount_paid) || 0), 0);
    // Debt genuinely written down by cash orders in range — a real reduction,
    // just not a collection. Reported separately rather than folded into income.
    const debtOffsetByCashOrders = autoAppliedSettlements.reduce((sum, setl) => sum + (Number(setl.amount_paid) || 0), 0);

    // Other Receipts used to be a manager-typed number. Cash & Bank Section 01
    // (Other Cash Receives) already records exactly this money — both
    // "Received by Head Office" and "Other Receives" — so it is derived from
    // that ledger instead of being entered by hand, and can no longer drift
    // from what was actually recorded.
    const rangeCashReceives = cashReceives.filter(r => isInRange(r.received_at));
    const headOfficeReceipts = rangeCashReceives
      .filter(r => r.receive_type === 'head_office')
      .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const otherCashReceipts = rangeCashReceives
      .filter(r => r.receive_type !== 'head_office')
      .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const otherReceipts = headOfficeReceipts + otherCashReceipts;

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
        // An auto-applied row isn't a payment method the customer chose — it
        // is this system offsetting a cash order against their old debt.
        method: setl.is_auto_applied
          ? 'Applied from Cash Order'
          : (PAYMENT_METHOD_LABELS[setl.payment_method] || 'Cash'),
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

    // 6. Bank Deposit Details — fully derived from the real Cash & Bank
    // ledger (cash_receives / bank_deposits / cheque_records /
    // bank_withdrawals), using the exact same math as the Cash & Bank page
    // (see cashBankMath.js) so the two pages can never show conflicting
    // figures or double-count. Cash Balance, Bank Balance, and Hand Cheques
    // are three separate stores of value — never summed into one "Total".
    const { cashBalance, bankBalance, handChequesTotal } = computeCashBankBalances({
      cashSalesRows: sales.filter(s => s.payment_type === 'cash' && isUpToRangeEnd(s.sale_date)),
      settlementRows: settlements.filter(s => isUpToRangeEnd(s.settlement_date)),
      cashReceives: cashReceives.filter(r => isUpToRangeEnd(r.received_at)),
      bankDeposits: bankDeposits.filter(d => isUpToRangeEnd(d.deposited_at)),
      chequeRecords: chequeRecords.filter(c => isUpToRangeEnd(c.received_at)),
      bankWithdrawals: bankWithdrawals.filter(w => isUpToRangeEnd(w.withdrawn_at))
    });

    // "Amount Deposited" is a period metric (activity during the selected
    // range), unlike the three running balances above.
    const amountDeposited = bankDeposits
      .filter(d => isInRange(d.deposited_at))
      .reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

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

    // 8. Vehicle Details — sourced from the Transport tab's trip history
    // (transport_trips), not the standalone Vehicles tab.
    const vehicleTripList = transportTrips
      .filter(t => isInRange(t.start_datetime))
      .map(t => ({
        tripId: `TRIP-${String(t.id).padStart(4, '0')}`,
        date: t.start_datetime ? t.start_datetime.slice(0, 10) : '',
        description: t.description || t.end_description || '',
        startKm: Number(t.start_odometer) || 0,
        endKm: t.end_odometer !== null && t.end_odometer !== undefined ? Number(t.end_odometer) : null,
        distance: t.distance_travelled !== null && t.distance_travelled !== undefined ? Number(t.distance_travelled) : null
      }))
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
      .map((trip, idx) => ({ no: idx + 1, ...trip }));
    const totalVehicleDistance = vehicleTripList.reduce((sum, t) => sum + (t.distance || 0), 0);

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
        branchSalesList,
        closingBalance,
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
        debtOffsetByCashOrders,
        otherReceipts,
        // Broken out so the report can show where the receipts came from,
        // matching the two buttons on Cash & Bank Section 01.
        headOfficeReceipts,
        otherCashReceipts,
        totalIncome
      },
      creditGivenList,
      totalCreditGivenAmount,
      creditCollectionList,
      totalCreditCollectedAmount,
      expenseList,
      totalExpensesAmount,
      cashDetails: {
        amountDeposited,
        cashBalance,
        bankBalance,
        handChequesTotal
      },
      employeeAttendanceList,
      vehicleTripList,
      totalVehicleDistance,
      notesList,
      otherDetails: manualInputs.otherDetails || '',
      verifiedBy: manualInputs.verifiedBy || ''
    };
  }, [targetFromStr, targetToStr, fromTime, toTime, sales, debts, settlements, customers, inventory, invTransactions, employees, attendance, transportTrips, notes, expenseCategories, expenseItems, expenseLedgerRows, expenseAmounts, cashReceives, bankDeposits, chequeRecords, bankWithdrawals, manualInputs]);

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
      free_issue: Number(payload.freeIssue) || 0,
      damaged_cubes: Number(payload.damagedCubes) || 0,
      other_receipts: Number(payload.otherReceipts) || 0,
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
        console.warn("Supabase upsert daily report error:", error.message);
      } else if (data) {
        setSavedRecord(data);
      }
      logActivity({ action: 'update', entityType: 'daily_manager_report', entityId: targetFromStr, description: `Saved daily manager report for ${targetFromStr}`, performedBy: payload.verifiedBy });
    } catch (err) {
      console.warn("Supabase upsert daily report error, stored locally:", err);
    }
  };

  return {
    loading,
    reportData,
    manualInputs,
    savedRecord,
    // A report that has been saved with a verifying manager's name is a signed
    // declaration for that day. It stays locked from then on so the figures
    // can't be quietly changed after the fact; an admin can unlock it to make
    // a correction.
    isVerified: Boolean(savedRecord?.verified_by),
    saveDailyReport,
    refetch: fetchData
  };
}
