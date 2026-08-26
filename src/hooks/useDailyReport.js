import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { coalesceRefetch } from '../lib/realtimeRefetch';
import { todayStr, previousLocalDateStr, toLocalDateTimeStr, toLocalDateTimeStrFrom } from '../utils/date';
import { computeCashBankBalances } from '../utils/cashBankMath';
import { logActivity } from '../lib/activityLog';

const PAYMENT_METHOD_LABELS = {
  cash: 'Cash',
  bank_transfer: 'Bank',
  cheque: 'Cheque',
  card: 'Card',
  other: 'Other'
};

// The Daily Manager Report always covers one fixed business-day window: 8AM
// the previous calendar day through 8AM the selected day. The caller picks
// only which day the report is FOR — there is no other window to configure,
// so the window itself is a constant here rather than parameters a caller
// could get wrong or drift out of sync with another one.
export function useDailyReport(selectedDateStr) {
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
  const [openingBalances, setOpeningBalances] = useState([]);
  // A report built from partial data is worse than no report — a manager signs
  // this document. Any source that fails to load is recorded here and the view
  // refuses to render rather than quietly omitting whatever didn't arrive.
  const [loadError, setLoadError] = useState(null);

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

  // targetToStr is the day the report is labeled/saved under — the date the
  // admin actually picks. targetFromStr is always the calendar day before
  // it; the two are never independently selectable.
  const targetToStr = selectedDateStr || todayStr();
  const targetFromStr = previousLocalDateStr(targetToStr);
  const fromTime = '08:00';
  const toTime = '08:00';

  // Fetch every source the report needs. Each query reports its own failure
  // instead of collapsing to [] — nineteen independent `.catch(() => [])`
  // calls meant any subset could fail and the report still rendered, complete
  // and plausible, silently missing whatever hadn't loaded.
  const fetchData = useCallback(async () => {
    const failures = [];
    const q = (label, builder, fallback = []) =>
      builder
        .then(res => {
          if (res.error) {
            failures.push(`${label}: ${res.error.message}`);
            return fallback;
          }
          return res.data ?? fallback;
        })
        .catch(err => {
          failures.push(`${label}: ${err?.message || err}`);
          return fallback;
        });

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
        openingBalancesRes,
        savedReportRes
      ] = await Promise.all([
        q('Sales', supabase.from('sales').select('*, customer:customers(*)')),
        q('Debts', supabase.from('debts').select('*, customer:customers(*), sale:sales(*)')),
        q('Debt settlements', supabase.from('debt_settlements').select('*, customer:customers(*)')),
        q('Customers', supabase.from('customers').select('*')),
        q('Inventory', supabase.from('inventory').select('*')),
        q('Inventory transactions', supabase.from('inventory_transactions').select('*, inventory(*)')),
        q('Employees', supabase.from('employees').select('*')),
        q('Attendance', supabase.from('employee_attendance').select('*')),
        q('Transport trips', supabase.from('transport_trips').select('*')),
        q('Notes', supabase.from('notes').select('*')),
        q('Expense categories', supabase.from('expense_categories').select('*')),
        q('Expense items', supabase.from('expense_items').select('*')),
        q('Expense ledger', supabase.from('expense_ledger_rows').select('*')),
        q('Expense amounts', supabase.from('expense_amounts').select('*')),
        q('Cash receives', supabase.from('cash_receives').select('*')),
        q('Bank deposits', supabase.from('bank_deposits').select('*')),
        q('Cheque records', supabase.from('cheque_records').select('*')),
        q('Bank withdrawals', supabase.from('bank_withdrawals').select('*')),
        // FIN-06: without these the report's Cash / Bank / Hand Cheques
        // balances were each understated by exactly the opening amount, and
        // disagreed with the Cash & Bank page reading the same shared math.
        q('Opening balances', supabase.from('opening_balances').select('*')),
        q('Saved report', supabase.from('daily_manager_reports').select('*').eq('report_date', targetToStr).maybeSingle(), null)
      ]);

      setSales(salesRes);
      setDebts(debtsRes);
      setSettlements(settlementsRes);
      setCustomers(customersRes);
      setInventory(inventoryRes);
      setInvTransactions(invTxnRes);
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
      setOpeningBalances(openingBalancesRes);

      setLoadError(failures.length ? failures.join('; ') : null);

      setSavedRecord(savedReportRes || null);
      setManualInputs({
        freeIssue: savedReportRes?.free_issue ?? 0,
        damagedCubes: savedReportRes?.damaged_cubes ?? 0,
        otherReceipts: savedReportRes?.other_receipts ?? 0,
        otherDetails: savedReportRes?.other_details || '',
        verifiedBy: savedReportRes?.verified_by || ''
      });
    } catch (err) {
      console.error("Failed to fetch daily report data:", err);
      setLoadError(err?.message || "Failed to load the daily report");
    } finally {
      setLoading(false);
    }
  }, [targetToStr]);

  useEffect(() => {
    const refetchData = coalesceRefetch(fetchData);
    // This effect's job is to subscribe to an external system (Supabase:
    // an initial fetch plus a realtime channel) and push what it reports
    // back into React state — the case the rule explicitly allows for. It
    // is not derived state being patched in after a render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();

    const channel = supabase
      .channel(`daily-report-realtime-${Math.random()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, refetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'debts' }, refetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'debt_settlements' }, refetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, refetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, refetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expense_ledger_rows' }, refetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expense_amounts' }, refetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_transactions' }, refetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employees' }, refetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employee_attendance' }, refetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transport_trips' }, refetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notes' }, refetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_receives' }, refetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bank_deposits' }, refetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cheque_records' }, refetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bank_withdrawals' }, refetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_manager_reports' }, refetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'opening_balances' }, refetchData)
      .subscribe();

    return () => {
      refetchData.cancel();
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

    // Opening and closing stock are derived from the TRANSACTION LEDGER, not
    // from live `inventory.quantity`. The old formula wound the live total
    // backwards by the movements inside the window only — movements AFTER the
    // window were never backed out, so opening was wrong by everything that
    // happened since, and closing algebraically collapsed straight back to
    // today's live total (substitute the terms and they cancel). A signed-off
    // report for a past day therefore quoted a closing figure that changed
    // every time it was reopened.
    //
    // inventory_transactions stores new_quantity per row, so:
    //   opening = new_quantity of the last transaction before the window
    //   closing = opening + the window's own movements
    // Brine (BNC) and Damaged (DGC) stay excluded — both are view-only counts
    // that must never feed stock math.
    const stockPoolIds = [mfcItem?.id, rscItem?.id]
      .filter(id => id !== undefined && id !== null)
      .map(Number);

    const openingForPool = (invId) => {
      let latest = null;
      invTransactions.forEach(txn => {
        if (Number(txn.inventory_id) !== Number(invId)) return;
        const t = new Date(txn.created_at);
        if (isNaN(t.getTime()) || t >= fromDateTime) return;
        if (!latest || t > latest.time || (t.getTime() === latest.time.getTime() && Number(txn.id) > Number(latest.id))) {
          latest = { time: t, id: txn.id, qty: Number(txn.new_quantity) || 0 };
        }
      });
      return latest ? latest.qty : 0;
    };

    const movementForPool = (invId) => invTransactions.reduce((sum, txn) => {
      if (Number(txn.inventory_id) !== Number(invId)) return sum;
      if (!isInRange(txn.created_at)) return sum;
      return sum + (Number(txn.quantity_change) || 0);
    }, 0);

    const previousDayBalance = stockPoolIds.reduce((sum, id) => sum + openingForPool(id), 0);
    const closingBalance = previousDayBalance + stockPoolIds.reduce((sum, id) => sum + movementForPool(id), 0);

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
    //
    // "Remaining Debt" on a settlement row is a point-in-time figure: what was
    // still owing on that debt *immediately after that payment*. Reading the
    // debt's live `remaining_amount` printed today's balance against every
    // historical row instead, so once a debt was cleared the whole column read
    // LKR 0.00 — including rows where only part of the debt had been paid at
    // the time (a LKR 5,000 payment against a LKR 32,500 debt still showed
    // nothing left owing). Replay each debt's settlements in order to recover
    // the balance each one actually left behind.
    const settlementsByDebt = new Map();
    for (const setl of settlements) {
      const key = Number(setl.debt_id);
      if (!settlementsByDebt.has(key)) settlementsByDebt.set(key, []);
      settlementsByDebt.get(key).push(setl);
    }
    const balanceAfterSettlement = new Map();
    for (const [debtId, rows] of settlementsByDebt) {
      const debt = debts.find(d => Number(d.id) === debtId);
      let running = debt ? Number(debt.total_amount) || 0 : 0;
      rows
        .slice()
        // Ties on the timestamp fall back to insertion order, so two payments
        // taken within the same second still replay the way they landed.
        .sort((a, b) => new Date(a.settlement_date) - new Date(b.settlement_date) || Number(a.id) - Number(b.id))
        .forEach(row => {
          running = Math.max(0, running - (Number(row.amount_paid) || 0));
          balanceAfterSettlement.set(Number(row.id), running);
        });
    }

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
        isAutoApplied: Boolean(setl.is_auto_applied),
        method: setl.is_auto_applied
          ? 'Applied from Cash Order'
          : (PAYMENT_METHOD_LABELS[setl.payment_method] || 'Cash'),
        settlementDate: toLocalDateTimeStr(setl.settlement_date),
        debtAmount: matchingDebt ? Number(matchingDebt.total_amount) : 0,
        amountReceived: Number(setl.amount_paid),
        outstandingAmount: balanceAfterSettlement.get(Number(setl.id)) ?? (matchingDebt ? Number(matchingDebt.remaining_amount) : 0)
      };
    });
    // The list stays complete — an auto-applied row explains a debt reduction
    // the manager would otherwise see no reason for, and it is already
    // labelled "Applied from Cash Order" above. The TOTAL, though, is money
    // collected, and must exclude those: that cash arrived as the sale and is
    // already counted in cashSalesAmount. Summing the whole list made this
    // figure disagree with "Credit Amount Received" on the same page, which
    // has always filtered them out. Same defect as FIN-11 / FIN-12.
    const totalCreditCollectedAmount = creditCollectionList
      .filter(item => !item.isAutoApplied)
      .reduce((sum, item) => sum + item.amountReceived, 0);
    const totalCreditOffsetAmount = creditCollectionList
      .filter(item => item.isAutoApplied)
      .reduce((sum, item) => sum + item.amountReceived, 0);

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
          date: toLocalDateTimeStrFrom(row?.entry_date, row?.created_at),
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
    // Expense cells belonging to ledger rows dated up to the range end, tagged
    // with where the money came from. Cash Balance never subtracted expenses
    // at all before this: every rupee spent out of the till still showed as
    // sitting in it, drifting by the whole operating expense total each month.
    const expenseRowsUpToRangeEnd = expenseAmounts
      .filter(a => {
        const row = expenseLedgerRows.find(r => Number(r.id) === Number(a.ledger_row_id));
        return row?.entry_date && row.entry_date <= targetToStr;
      })
      .map(a => {
        const row = expenseLedgerRows.find(r => Number(r.id) === Number(a.ledger_row_id));
        return { amount: a.amount, payment_source: row?.payment_source || 'cash' };
      });

    const {
      cashBalance,
      bankBalance,
      handChequesTotal,
      cashExpensesTotal,
      bankExpensesTotal
    } = computeCashBankBalances({
      cashSalesRows: sales.filter(s => s.payment_type === 'cash' && isUpToRangeEnd(s.sale_date)),
      settlementRows: settlements.filter(s => isUpToRangeEnd(s.settlement_date)),
      cashReceives: cashReceives.filter(r => isUpToRangeEnd(r.received_at)),
      bankDeposits: bankDeposits.filter(d => isUpToRangeEnd(d.deposited_at)),
      chequeRecords: chequeRecords.filter(c => isUpToRangeEnd(c.received_at)),
      bankWithdrawals: bankWithdrawals.filter(w => isUpToRangeEnd(w.withdrawn_at)),
      expenseRows: expenseRowsUpToRangeEnd,
      // Same argument the Cash & Bank page passes. Omitting it here (it
      // defaulted to []) understated all three balances by exactly the opening
      // amounts — two screens, one shared function, two different answers.
      openingBalances
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
        tripId: t.trip_code || `SIFT_${String(t.id).padStart(4, '0')}`,
        date: toLocalDateTimeStr(t.start_datetime),
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
      reportDate: targetToStr,
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
      // The debt genuinely written down by cash orders in this window. Real,
      // but not collected — reported alongside rather than folded in.
      totalCreditOffsetAmount,
      expenseList,
      totalExpensesAmount,
      // Income and expenses used to sit side by side as two independent
      // figures that were never netted against each other anywhere in the
      // system. This is the missing bottom line.
      netPosition: totalIncome - totalExpensesAmount,
      cashDetails: {
        amountDeposited,
        cashBalance,
        bankBalance,
        handChequesTotal,
        cashExpensesTotal,
        bankExpensesTotal
      },
      employeeAttendanceList,
      vehicleTripList,
      totalVehicleDistance,
      notesList,
      otherDetails: manualInputs.otherDetails || '',
      verifiedBy: manualInputs.verifiedBy || ''
    };
  }, [targetFromStr, targetToStr, fromTime, toTime, sales, debts, settlements, customers, inventory, invTransactions, employees, attendance, transportTrips, notes, expenseCategories, expenseItems, expenseLedgerRows, expenseAmounts, cashReceives, bankDeposits, chequeRecords, bankWithdrawals, openingBalances, manualInputs]);

  // Save manual updates. A failed upsert is a failed save: it is no longer
  // console.warn'd, written to the activity log as if it succeeded, and
  // reported to the operator as success. The localStorage mirror is gone too
  // — it let two browsers show two different "saved" reports for the same
  // date, neither matching the database.
  const saveDailyReport = async (updatedInputs) => {
    const payload = {
      ...manualInputs,
      ...updatedInputs
    };

    const dbPayload = {
      report_date: targetToStr,
      free_issue: Number(payload.freeIssue) || 0,
      damaged_cubes: Number(payload.damagedCubes) || 0,
      other_receipts: Number(payload.otherReceipts) || 0,
      other_details: payload.otherDetails || '',
      verified_by: payload.verifiedBy || '',
      verified_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('daily_manager_reports')
      .upsert(dbPayload, { onConflict: 'report_date' })
      .select('*')
      .maybeSingle();

    if (error) throw new Error(error.message || "Failed to save the daily manager report");

    setManualInputs(payload);
    if (data) setSavedRecord(data);
    logActivity({ action: 'update', entityType: 'daily_manager_report', entityId: targetToStr, description: `Saved daily manager report for ${targetToStr}`, performedBy: payload.verifiedBy });
    return data;
  };

  return {
    loading,
    // Non-null when any of the report's sources failed to load. The view
    // refuses to render the document rather than presenting an incomplete one
    // for a manager to sign.
    loadError,
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
