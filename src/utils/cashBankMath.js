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

  // Only cash physically banked (sales/other cash) leaves the till — a
  // "cheques already deposited" bank deposit never touched cash on hand.
  const cashDepositedTotal = bankDeposits
    .filter(d => d.cash_method !== 'cheques')
    .reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

  const bankDepositsTotal = bankDeposits.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
  const bankWithdrawalsTotal = bankWithdrawals.reduce((sum, w) => sum + (Number(w.amount) || 0), 0);

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
  const cashBalance = Math.max(0, openingCash + cashSalesTotal + debtSettlementsTotal + cashReceivesTotal - cashDepositedTotal);
  const bankBalance = openingBank + bankDepositsTotal - bankWithdrawalsTotal;

  return {
    cashSalesTotal,
    debtSettlementsTotal,
    cashReceivesTotal,
    cashDepositedTotal,
    bankDepositsTotal,
    bankWithdrawalsTotal,
    chequesPending,
    chequesPendingTotal,
    unlinkedChequeDepositsTotal,
    handChequesTotal,
    cashBalance,
    bankBalance,
    openingCash,
    openingBank,
    openingCheques
  };
}
