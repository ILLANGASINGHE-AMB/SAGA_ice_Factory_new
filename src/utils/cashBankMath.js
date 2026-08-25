// Shared Cash / Bank / Hand-Cheques balance math — single source of truth
// so useCashBank (live, all-time) and useDailyReport (as-of a report date)
// can never drift on how these three balances are computed.
//
// Per Final_Cash_Bank_Cheque_Logic.md: Cash Balance, Bank Balance, and Hand
// Cheques are three SEPARATE stores of value. A cheque deposit must never
// touch Cash Balance; the same money must never be counted twice.

export function computeCashBankBalances({
  cashSalesRows = [],
  settlementRows = [],
  cashReceives = [],
  bankDeposits = [],
  chequeRecords = [],
  bankWithdrawals = [],
  // Expenses, as {amount, payment_source} rows — one per expense_amounts cell
  // joined to its ledger row. Money spent out of the till has to leave Cash
  // Balance and money spent out of the bank has to leave Bank Balance;
  // before this the whole Expenses module was a parallel ledger that never
  // touched either, so every rupee spent still showed as sitting in the till
  // and the physical cash count could never reconcile with the screen.
  expenseRows = [],
  // "Initial Collection": what each store of value already held when the
  // factory started using the system. Balances here are otherwise derived
  // purely from recorded transactions, so without these every balance starts
  // at zero regardless of what was actually in the till, the bank, or the
  // cheque drawer on day one.
  openingBalances = []
}) {
  const opening = (scope) => {
    const row = openingBalances.find(o => o.scope === scope);
    return Number(row?.amount) || 0;
  };
  const openingCash = opening('cash');
  const openingBank = opening('bank');
  const openingCheques = opening('cheques');

  const cashSalesTotal = cashSalesRows.reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0);
  const debtSettlementsTotal = settlementRows.reduce((sum, s) => sum + (Number(s.amount_paid) || 0), 0);
  const cashReceivesTotal = cashReceives.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  // A debt settlement only lands in the till when it was actually paid in
  // cash. A settlement taken as a bank/online transfer arrives as its own
  // bank_deposits row (cash_method 'debt_settlement'), and one taken as a
  // cheque arrives as a pending cheque_records row — counting either here as
  // well would book the same money into two stores of value at once.
  // Anything else ('card', 'other', legacy rows with no method) keeps the
  // original cash treatment so historical balances are unchanged.
  // A settlement created automatically by a cash order paying down the
  // customer's existing debt is NOT money arriving at the till — that cash was
  // already counted in cashSalesTotal above as the sale itself. Counting it
  // here too inflated Cash Balance by the offset amount on every such order.
  // The debt reduction it represents is real and untouched; only the "cash in"
  // reading of it is wrong.
  const settlementsAutoApplied = settlementRows.filter(s => s.is_auto_applied);
  const settlementAutoAppliedTotal = settlementsAutoApplied.reduce((sum, s) => sum + (Number(s.amount_paid) || 0), 0);

  const settlementsToCash = settlementRows.filter(
    s => !s.is_auto_applied && s.payment_method !== 'bank_transfer' && s.payment_method !== 'cheque'
  );
  const settlementsToBank = settlementRows.filter(s => !s.is_auto_applied && s.payment_method === 'bank_transfer');
  const settlementsToCheques = settlementRows.filter(s => !s.is_auto_applied && s.payment_method === 'cheque');

  const settlementCashTotal = settlementsToCash.reduce((sum, s) => sum + (Number(s.amount_paid) || 0), 0);
  const settlementBankTotal = settlementsToBank.reduce((sum, s) => sum + (Number(s.amount_paid) || 0), 0);
  const settlementChequeTotal = settlementsToCheques.reduce((sum, s) => sum + (Number(s.amount_paid) || 0), 0);

  // Only cash physically banked (sales/other cash) leaves the till — a
  // "cheques already deposited" bank deposit never touched cash on hand, and
  // neither did a debt settled by online transfer straight into the bank.
  const cashDepositedTotal = bankDeposits
    .filter(d => d.cash_method !== 'cheques' && d.cash_method !== 'debt_settlement')
    .reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

  const bankDepositsTotal = bankDeposits.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
  const bankWithdrawalsTotal = bankWithdrawals.reduce((sum, w) => sum + (Number(w.amount) || 0), 0);

  const cashExpensesTotal = expenseRows
    .filter(e => (e.payment_source || 'cash') === 'cash')
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const bankExpensesTotal = expenseRows
    .filter(e => e.payment_source === 'bank')
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const expensesTotal = cashExpensesTotal + bankExpensesTotal;

  const chequesPending = chequeRecords.filter(c => c.status === 'pending');
  const chequesPendingTotal = chequesPending.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);

  // A Section 02 deposit made via the per-cheque "Deposit" button is already
  // linked to that cheque_records row (deposit_id), so it's already reflected
  // by chequesPendingTotal excluding that now-deposited cheque. A deposit made
  // instead through the general Section 02 form with method 'cheques' has no
  // linked cheque record — it still represents cheques-on-hand being banked,
  // so it must reduce Hand Cheques by that amount directly.
  const linkedChequeDepositIds = new Set(chequeRecords.filter(c => c.deposit_id != null).map(c => c.deposit_id));
  const unlinkedChequeDepositsTotal = bankDeposits
    .filter(d => d.cash_method === 'cheques' && !linkedChequeDepositIds.has(d.id))
    .reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

  const handChequesTotal = Math.max(0, openingCheques + chequesPendingTotal - unlinkedChequeDepositsTotal);
  const cashBalance = Math.max(0, openingCash + cashSalesTotal + settlementCashTotal + cashReceivesTotal - cashDepositedTotal - cashExpensesTotal);
  const bankBalance = openingBank + bankDepositsTotal - bankWithdrawalsTotal - bankExpensesTotal;

  return {
    cashSalesTotal,
    debtSettlementsTotal,
    settlementCashTotal,
    settlementBankTotal,
    settlementChequeTotal,
    settlementAutoAppliedTotal,
    cashReceivesTotal,
    cashDepositedTotal,
    bankDepositsTotal,
    bankWithdrawalsTotal,
    chequesPending,
    chequesPendingTotal,
    unlinkedChequeDepositsTotal,
    handChequesTotal,
    cashExpensesTotal,
    bankExpensesTotal,
    expensesTotal,
    cashBalance,
    bankBalance,
    openingCash,
    openingBank,
    openingCheques
  };
}

// A settlement counts as cash COLLECTED only when someone actually handed
// money over at the counter. Excluded:
//   - is_auto_applied rows — a cash order paying down the customer's own old
//     debt. That cash is already counted as the sale itself.
//   - bank_transfer / cheque rows — real money, but it never reached the till.
// Exported so the Dashboard and Customer Profile stop re-deriving (and
// mis-deriving) the same rule.
export function isCollectedCashSettlement(settlement) {
  return !settlement.is_auto_applied
    && settlement.payment_method !== 'bank_transfer'
    && settlement.payment_method !== 'cheque';
}

// Every settlement that represents money the customer actually paid, by any
// method — i.e. everything except the system's own auto-applied offsets.
export function isCustomerPayment(settlement) {
  return !settlement.is_auto_applied;
}
