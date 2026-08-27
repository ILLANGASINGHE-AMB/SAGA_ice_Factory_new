import { supabase } from '../lib/supabase';

// What a customer still owes, and when that figure last moved.
//
// Every printed document — a sales invoice, a debt statement, a settlement
// receipt — now states the customer's outstanding balance alongside the
// transaction it is about, so the piece of paper answers "and what do I still
// owe?" without the customer having to ask. The balance is meaningless without
// a timestamp (it changes with every order and every payment), so the two
// always travel together.
//
// `total` counts only debts that are still open; `updatedAt` is taken across
// ALL of the customer's debts, settled ones included, so a customer who has
// just cleared everything still gets "LKR 0.00, as of <when they cleared it>"
// rather than a blank.

function summarise(rows) {
  let total = 0;
  let updatedAt = null;

  (rows || []).forEach(d => {
    if (d.status !== 'settled') total += Number(d.remaining_amount) || 0;

    // last_activity_at is stamped on every settlement; created_at is the
    // fallback for a debt nothing has happened to yet.
    const moved = d.last_activity_at || d.created_at;
    if (!moved) return;
    if (!updatedAt || new Date(moved) > new Date(updatedAt)) updatedAt = moved;
  });

  return { total, updatedAt };
}

/** From an already-loaded `debts` array (the useDebts cache). */
export function customerDebtSummary(debts, customerId) {
  if (!customerId) return { total: 0, updatedAt: null };
  return summarise(
    (debts || []).filter(d => Number(d.customer_id) === Number(customerId))
  );
}

/**
 * Straight from the database, for the paths that generate a PDF without the
 * ledger loaded (placing an order, editing a sale, recording a settlement).
 * Best-effort: a failure yields zeros rather than blocking the document, which
 * is already being produced after the money has moved.
 */
export async function fetchCustomerDebtSummary(customerId) {
  if (!customerId) return { total: 0, updatedAt: null };
  try {
    const { data, error } = await supabase
      .from('debts')
      .select('remaining_amount, status, last_activity_at, created_at')
      .eq('customer_id', customerId);
    if (error) throw error;
    return summarise(data);
  } catch (err) {
    console.warn("Could not read the customer's outstanding debt for this document:", err);
    return { total: 0, updatedAt: null };
  }
}

/**
 * The two fields every document generator and preview reads. Kept as one
 * helper so a call site can never attach one without the other.
 */
export function debtFieldsFor(debts, customerId) {
  const { total, updatedAt } = customerDebtSummary(debts, customerId);
  return { customer_debt_total: total, customer_debt_updated_at: updatedAt };
}

/**
 * What to print in a "Sale Code" column for a debt.
 *
 * An initial debt is an opening balance carried forward from the old book and
 * has no sale behind it, so the sale-code fallback (`DEBT-12`) told the reader
 * nothing. Every ledger, statement and receipt names it the same way.
 */
export function debtReference(debt) {
  if (!debt) return '—';
  if (debt.is_opening_balance) return 'Initial Debt';
  return debt.sale?.sale_code || `DEBT-${debt.id}`;
}
