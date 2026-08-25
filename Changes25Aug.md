# Changes — 25 August 2026

Four pieces of work:

1. **Dashboard "Settle Debts" quick action** — register a debt payment straight
   from the dashboard without first hunting the customer down in the ledger.
2. **Settlement payment methods now route the money correctly** — Cash,
   Bank/Online Transfer and Cheque each land in their own store of value in
   Cash & Bank Management, instead of everything being booked as cash.
3. **Cash & Bank role visibility** — the bank position and withdrawals are now
   administrator-only.
4. **Damaged Cubes + pooled ordering with Free Cubes** (`v2_NewChanges.md`) —
   a fourth inventory line, a Total Cubes figure, and a New Order form that
   takes one quantity at one rate plus free cubes, drawn Production-first.

**Status:** production build passes (`npm run build`, ✓ built). ESLint reports
the same problems as before the changes (`React` unused in both pages,
`AlertCircle` / `ArrowUpRight` in the dashboard, the pre-existing
`set-state-in-effect` in `useDebts`) — no new lint errors.
**Not verified:** nothing was run against the live Supabase instance, so
neither the settlement path nor the new ledger inserts were exercised at
runtime.

**17 files changed · 2 new migrations**

---

## ⚠️ Two migrations to apply

`20260825010000_debt_settlement_payment_routing.sql` (Part 2) and
`20260825020000_damaged_cubes_and_pooled_orders.sql` (Part 4). Both are
detailed in their sections below. `supabase_schema.sql` has been updated to
match both, so a fresh provision already includes them.

## ⚠️ Part 2 needs a migration

`supabase/migrations/20260825010000_debt_settlement_payment_routing.sql`.
Bank-transfer and cheque settlements **will fail to record in Cash & Bank until
it is applied** (the settlement itself still saves — see *Failure handling*
below). `supabase_schema.sql` has been updated to match, so a fresh provision
already includes it.

| Change | Why |
|---|---|
| `bank_deposits.cash_method` gains `'debt_settlement'` | Kept distinct from `'sales'`/`'other'`, which mean *cash physically left the till for the bank* and therefore **reduce** Cash Balance. A debt paid by online transfer never passed through the till, so it must not |
| `bank_deposits.settlement_id` → `debt_settlements(id)`, nullable, `on delete set null` | Traces a deposit back to the settlement that produced it |
| `cheque_records.settlement_id` → `debt_settlements(id)`, nullable, `on delete set null` | Same, for a cheque taken against a debt |

`debt_settlements.payment_method` already permitted
`cash / bank_transfer / cheque / other / card`, so no change was needed there.

---

## What the operator sees

1. Dashboard header now carries a green **Settle Debts** button next to
   *Add New Order*.
2. Clicking it lands on the Debts ledger with a **Select Customer to Settle**
   dialog already open — a searchable list of every customer with an
   outstanding balance.
3. Picking a customer closes the dialog and opens the **ordinary** Register
   Debt Settlement modal, pre-loaded with that customer and their total debt.
4. From there the flow is unchanged: amount / payment method / note → FIFO
   settlement across their oldest debts → receipt PDF preview → WhatsApp or SMS
   notification prompt.

---

# Part 1 — Dashboard "Settle Debts" shortcut

## Dashboard — `src/pages/DashboardPage.jsx`

| Change | Detail |
|---|---|
| **Settle Debts button** | Added beside *Add New Order*; the pair now sit in a `flex justify-end gap-2.5` row (previously a single-button row). Green (`emerald-600`) to read as a collections action against the navy *Add New Order*, with the `HandCoins` icon |
| **`handleSettleDebts()`** | `navigate('/debts', { state: { openSettleDebt: true } })` — mirrors the existing `handleAddNewOrder()` → `/sales` `openNewOrder` pattern, so both quick actions work the same way |
| Imports | `HandCoins` added to the `lucide-react` import |

Visible to **all roles**. Outstanding debt is already staff-visible on the
dashboard (it's a collections worklist, not takings), and settling a debt was
already a staff action on the Debts page — so this shortcut is not `isAdmin`-gated.

---

## Debts — `src/pages/DebtsPage.jsx`

### Deep-link handler

`useEffect` on `location.state` opens the debtor picker when
`state.openSettleDebt` is set, then immediately clears the state with
`navigate(location.pathname, { replace: true, state: {} })` so a refresh or a
back/forward doesn't reopen the picker unexpectedly. Same shape as the
`openNewOrder` handler in `SalesPage.jsx`.

### Select Customer to Settle modal

- Autofocused search box filtering on **customer name, customer code and
  contact number**.
- Header line showing the number of matching debtors and their combined
  outstanding total.
- Scrollable list; each row is a button showing name, customer code · phone,
  and the amount owed, sorted heaviest debtor first.
- Distinct empty states — *"Clear ledger! No customer currently owes
  anything."* when nobody has a balance, versus *"No debtor matched that
  search."* when the query is the reason the list is empty.
- Loading state while `useDebts()` is still fetching.

**The picker is built from all debts, not the page's filtered set.** The Debts
page's status / aging / date-range filters deliberately do not narrow it — a
customer standing at the counter with cash must not be hidden because a filter
was left on from earlier.

### Shared grouping helper

The customer rollup was inlined in the `customerGroups` memo. It's now a
module-level `groupDebtsByCustomer(rows)` used by **both** the ledger's
*Debt by Customers* table and the picker, so the two can never drift on what a
given customer owes. Behaviour of the existing table is unchanged — it still
groups the *filtered* rows.

### New state / memos

| Name | Purpose |
|---|---|
| `customerPickerOpen`, `pickerQuery` | Picker dialog visibility and search text |
| `allDebtorGroups` | Every debtor with a balance, from unfiltered `debts` |
| `pickerResults` | `allDebtorGroups` narrowed by `pickerQuery` |
| `openCustomerPicker()` / `closeCustomerPicker()` | Open (resetting the query) / close |
| `handlePickCustomer(group)` | Closes the picker and calls the existing `openSettleModal(group)` |

Imports added: `useEffect`, `useLocation`, `useNavigate`, and the `Search` icon.

---

# Part 2 — Settlement payment methods & Cash/Bank routing

## The problem

`computeCashBankBalances()` summed **every** `debt_settlements` row into Cash
Balance regardless of `payment_method`. The dialog only offered *Cash* and
*Card*, so a debt paid by transfer or cheque either couldn't be recorded
honestly or was booked as cash that wasn't in the till.

## The routing rule

| Method selected | Recorded as | Lands in |
|---|---|---|
| **Cash** | nothing extra — derived straight from `debt_settlements` | **Cash Balance** |
| **Bank / Online Transfer** | a `bank_deposits` row, `cash_method = 'debt_settlement'` | **Bank Balance** |
| **Cheque** | a `cheque_records` row, `status = 'pending'` | **Hand Cheques** |

Each amount lands in **exactly one** store of value. A bank-transfer or cheque
settlement is excluded from the cash figure precisely because it now has its
own ledger row — counting both would book the same money twice.

## Settlement dialog — `src/pages/DebtsPage.jsx`

- **Payment Method** options are now **Cash**, **Bank / Online Transfer**,
  **Cheque** (was Cash / Card).
- A coloured callout under the selector states where the money will land
  before the operator commits (e.g. *"Filed as a pending cheque and adds to
  Hand Cheques in Cash & Bank Management."*).
- **Bank / Online Transfer** → optional **Bank Name** field. *Not in the
  original spec*, added because `bankBalancesByName` validates withdrawals
  per bank: without a name the deposit lands in the unnamed bucket and can't
  be withdrawn against a specific bank. Left optional so it never blocks a
  settlement.
- **Cheque** → **Cheque No.** (required), **Bank Name** (required), and
  **Cheque Amount**, in a highlighted block.

### One amount, not two

The Cheque Amount input is bound to the **same state** as Payment Amount, so
editing either moves both. The cheque and the debt can therefore never
disagree — a cheque worth less (or more) than the settlement would put Hand
Cheques and the debt ledger permanently out of step.

### Validation

Cheque number and bank name are checked **twice** — in the page before submit,
and again at the top of `settleCustomerDebt` **before any money moves**. A
settlement that succeeded but couldn't be filed as a cheque would leave the
payment recorded against the debt with nothing holding the funds.

## `src/hooks/useDebts.js`

`settleCustomerDebt(customerId, amount, createdBy, paymentMethod, notes, paymentDetails)`
gained a sixth argument, `paymentDetails` (`{ chequeNo, bankName, payerName }`,
defaults to `{}`). After the FIFO settlement loop it files the matching Cash &
Bank row — `bank_deposits` for a transfer, `cheque_records` (payer name and
`customer_id` filled from the customer) for a cheque. Cash writes nothing.

The returned settlement object gained `cheque_no`, `bank_name` and
`ledgerWarning`.

`settleDebt()` (the per-debt variant) was **not** changed — nothing in the UI
calls it.

### Failure handling

The debts are already settled by the time the ledger row is written and are
**not** rolled back if that insert fails. Instead the result carries a
`ledgerWarning`, which the page shows as an error toast telling the operator to
file the entry by hand in Cash & Bank. Losing the receipt and re-running a
payment that already went through would be the worse outcome.

## `src/utils/cashBankMath.js`

- Settlements are split into `settlementCashTotal` / `settlementBankTotal` /
  `settlementChequeTotal`; **Cash Balance now uses `settlementCashTotal`**, not
  the all-methods total.
- `cashDepositedTotal` (cash that left the till) now also excludes
  `cash_method = 'debt_settlement'` deposits, alongside the existing
  `'cheques'` exclusion — that money was never in the till to leave it.
- `debtSettlementsTotal` (all methods) is still exported for display.

**Legacy rows are untouched.** Only `bank_transfer` and `cheque` are diverted;
`cash`, `card`, `other` and rows with no method keep the original cash
treatment, so existing balances don't shift when this ships.

Because `useDailyReport` uses the same function, the Daily Manager Report's
Cash / Bank / Hand Cheques figures pick this up automatically.

## Cash & Bank history — `src/hooks/useCashBank.js`, `src/pages/CashBankPage.jsx`

- The settlements query now selects `settlement_code`, `payment_method`,
  `created_by` and the customer (it previously fetched only amount and date).
- New **Debt Settlement** history action type, with a matching filter option
  in the History section.
- **Cash** settlements appear as their own entry (`+LKR …`, *"Debt Settlement
  (Cash) — Customer — SETL-code"*), since they have no ledger row of their own.
- **Bank-transfer and cheque** settlements are deliberately **not** listed
  twice — each already appears as the bank deposit or received cheque it
  produced. Those entries now name the settlement that created them
  (*"Debt Settlement (Bank / Online Transfer) — BOC — Settlement SETL-…"*).
- Card subtitles corrected: Cash Balance now reads *"cash orders, cash
  settlements & receives"*, Bank Balance *"Deposits (incl. transfer
  settlements) less withdrawals"*.

## Receipt PDF — `src/utils/pdfGenerator.js`

The settlement receipt's Payment Method line now carries the detail, so the
receipt can be checked against the ledger entry it created:
`CHEQUE (No. 004512, BOC)` / `BANK TRANSFER (BOC)`. Cash is unchanged.

---

# Part 3 — Cash & Bank role visibility

Staff operators do counter work — taking cash, banking it, receiving cheques.
The **bank position** and **money leaving the bank** are an administrator's
business, so both are now hidden from non-admin users on
`src/pages/CashBankPage.jsx`.

## Hidden from staff

| Element | Note |
|---|---|
| **02. Bank Balance** stat card | The bank position |
| **04. Total Withdrawn** stat card | Leaving the running total on display would defeat hiding the section |
| **04. Withdrawals** tab | Removed from the tab strip via a `visibleTabs` filter |
| **Withdrawals section** | The panel itself is also gated (`activeTab === 'withdrawals' && isAdmin`), so it can't render even if the tab state is reached another way |
| **Withdrawal rows in Cash Flow History** | See below |
| **"Withdrawal"** option in the History *Action Type* filter | Nothing left for it to match |

## Still available to staff

**01. Cash Balance** and **03. Hand Cheques** — the two stores of value they
physically handle — plus **Sections 01 Cash Receives, 02 Bank Deposits and 03
Cheques**, and the Cash Flow History for everything except withdrawals. Staff
can still bank cash; they just can't see the resulting bank total.

## The history had to follow

Hiding the section alone would have been cosmetic: every withdrawal, with its
amount, was still listed in **Cash Flow History**, where anyone could add them
up. A new `visibleHistory` memo drops `withdrawal` entries for non-admins
before any filtering, and the *Done By* user list is derived from it, so a
withdrawal-only user no longer leaks into the filter dropdown either.

This goes one step past the literal request ("hide the Withdrawals section"),
on the same reasoning that put **Total Withdrawn** behind the gate.

## Layout

The balance-card row switches from a 4-column to a 2-column grid for staff
(`md:grid-cols-4` → `md:grid-cols-2`), so the two remaining cards fill the row
instead of leaving half of it empty.

## Not enforced in the database

This is **UI visibility, not authorization**. RLS on `bank_withdrawals` is
unchanged, so a determined non-admin could still read withdrawals through the
API. Matching the existing pattern on this page (the Initial Collection form is
gated the same way). Say the word if you want it enforced in RLS as well.

---

# Part 4 — Damaged Cubes, pooled ordering, Free Cubes

Implements `v2_NewChanges.md`.

## ⚠️ Migration: `20260825020000_damaged_cubes_and_pooled_orders.sql`

| Change | Purpose |
|---|---|
| `inventory.type` gains `'damaged'`; seeds `DGC-0001` at qty 0 | The Damaged Cubes line |
| `inventory_transactions.transaction_type` gains `'free_issue'` | Free cubes get their own history entry, distinct from a sale deduction |
| `sales.free_quantity integer not null default 0` | Cubes given away on an order |
| `sale_items.is_free boolean not null default false` | Marks a free line |
| `sale_items.price_per_cube` check relaxed `> 0` → `>= 0` | A free line is priced at 0 |
| New RPC `place_pooled_order_transaction` | Replaces `place_multi_item_order_transaction` as the order path |
| `get_public_bill` re-created | Carries `free_quantity` / `is_free` through, or free cubes vanish from the customer's shared bill |

`place_multi_item_order_transaction` is left in the database, unused — dropping
a function the app no longer calls buys nothing and makes rollback harder.

## Inventory — Damaged Cubes (DGC)

Behaves exactly like Brine (`waste`): a stock count with **no price**, never
sold, its own card, and **excluded from Total Cubes**.

- `src/components/Badge.jsx` — `DGC` badge (rose).
- `src/pages/InventoryPage.jsx` — 4-card grid, `CUBE_TYPE_LABELS` /
  `CUBE_CARD_TITLES` / `GRAPH_COLORS` extended, Damaged added to the history
  Cube Type filter and the graph series, `free_issue` styled violet in the
  history table. The card's Price button is hidden for both stock-only lines
  via a shared `SELLABLE_TYPES` list rather than the old `isWst` check.

### New Total Cubes figure

A **Total Cubes** panel above the cards, exactly as the spec lays it out:

```
Production Cubes  200
Resell Cubes      100
Brine Cubes        50
Damaged Cubes      10

Total Cubes = Production + Resell = 300
```

Brine and Damaged are shown but never added in — they aren't sellable stock.

## New Order — pooled Ice Cubes + Free Cubes

Steps 1 (Cash/Debt) and 2 (customer) are unchanged. **Step 3 was rebuilt.**

Before, the operator filled a Production row and a Resell row, each with its
own rate and quantity. Now there is one line:

| Field | Note |
|---|---|
| **No. of Total Cubes** | Live Production + Resell, with the split spelled out underneath |
| **Ice Cubes** — cube price · qty · total price | One rate for the order however the cubes are drawn |
| **Free Cubes** — qty | Not billed |
| **Order Total** | Free cubes never enter it |
| **Existing Debts** | Unchanged |
| **New Debt** | Shown for a debt order, above the projected total after the order |

A running "cubes leaving stock" line (billed + free against available) turns
red the moment the order over-draws the pool, so it's caught at entry rather
than at the confirm step.

### Production-first allocation

The operator no longer chooses a cube type. `place_pooled_order_transaction`
locks both pools and serves **Production first, falling back to Resell** once
Production is exhausted — paid cubes before free ones, so the billed portion
sits on the cheaper manufactured stock whenever an order spans both. The
resulting split is still written per `sale_items` row, so inventory
attribution and every existing report keep working.

The allocation arithmetic was verified exhaustively over all combinations of
Production/Resell stock and paid/free quantities 0–7: quantities always
reconcile, neither pool is ever over-drawn, and Resell is never touched while
Production remains.

### The one rate

Per your decision: the price field auto-fills with the customer's **custom
Production rate** when one is set, otherwise the live Production price, and an
admin can override it per order. The client and
`place_pooled_order_transaction` resolve it the same way, so the preview always
matches the invoice. As flagged when you chose it: an order that spills into
Resell is billed at the Production rate.

### Free Cubes accounting

Per your decision, free cubes are **not** counted as sold:

| | Where it lands |
|---|---|
| Billed cubes | `sales.quantity` — still what "cubes sold" means everywhere |
| Free cubes | `sales.free_quantity`, plus `sale_items` rows with `is_free = true` at price 0 |
| Stock | Both are deducted — billed + free |
| Inventory History | Two separate entries per pool: **Sale Deduction** and **Free Issue** |

A wholly-free issue creates a sale with a zero total and, on debt terms, no
debt row — there is nothing to owe.

The Sales table shows free cubes as a `+N free` note under the billed
quantity rather than folding them into the sortable Qty column.

## PDF bills — `src/utils/pdfGenerator.js`

- The invoice used to print one row per `sale_item`, which would now leak the
  Production/Resell split at the customer. Billed lines are **grouped by rate**
  into a single **Ice Cubes** row — the customer was quoted a rate, not a cube
  source.
- **Free Cubes (complimentary)** prints as its own row: quantity, rate `FREE`,
  total `LKR 0.00`.
- When free cubes are present the payment-status card states the reconciliation
  outright — *"300 cubes billed + 20 free = 320 issued."*
- The Daily Manager Report's stock table reorders to
  `… BRINE (VIEW ONLY) · DAMAGED (VIEW ONLY) · FREE ISSUE …`.

## Daily Manager Report — two fields became real data

`Free Issue` and `Damaged` were manager-typed numbers because the system had no
record of either. Both now exist for real, so both are derived and the fields
are read-only (Section 01 is now entirely read-only):

- **Free Issue** — summed from `free_issue` inventory transactions in range.
- **Damaged** — cubes added to the DGC line in range, and now **view-only like
  Brine**: it is a separate stock count, not a deduction from sellable stock.

### A stock-math bug this would otherwise have introduced

`previousDayBalance` winds the live stock total backwards over the range's
movements. Free cubes leave Production/Resell stock but are *not* in
`sales.quantity`, so without a change the opening balance would have been
understated by exactly the free-cube count every day any were issued. Free
cubes are now added back alongside sold cubes, and `closingBalance` winds
forward to exactly the live total again. Saved reports still persist the
derived Free Issue / Damaged figures, so a signed-off report keeps its numbers.

---

## What was deliberately *not* changed

- **No new settlement logic.** `handlePickCustomer` hands off to the existing
  `openSettleModal`, so the payment, FIFO application, receipt PDF and
  notification prompt are literally the same code path as settling from the
  ledger table. Nothing about the money path was touched.
- **No second entry point on the Debts page itself.** The picker is reachable
  from the dashboard shortcut only; the ledger already has a per-customer
  **Settle** button on every row.
- **The `settle_debt_transaction` RPC was not touched.** All routing happens in
  the client after the RPC returns, so the transactional debt/settlement write
  itself is exactly the code that was already in production.
- **No second entry point on the Debts page** for the customer picker; the
  ledger already has a per-row **Settle** button.
- **Existing Cash & Bank entry forms are unchanged** — Section 02 still offers
  only Sales / Other / Cheques as deposit methods; `'debt_settlement'` is
  written by the settlement flow alone.
- **Historical balances are unchanged** — see the legacy-rows note in Part 2.
- **Staff can still record bank deposits.** Part 3 hides the bank *position*,
  not the ability to bank cash — Section 02 stays open to everyone.
- **Damaged Cubes do not deduct from Production/Resell.** They are an
  independent stock count, exactly like Brine, because the spec says "this is
  like brine cubes". Moving a cube from Production to Damaged is still two
  actions: Remove from Production, Add to Damaged. Say the word if you want
  the Damaged card's Add button to do both in one step.
- **The Edit Sale modal still edits a single cube type.** It was already
  limited that way for multi-item orders; pooled ordering doesn't change it.
- **`place_multi_item_order_transaction` was left in the database.** Unused,
  but dropping it buys nothing and makes rollback harder.
