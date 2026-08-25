# Changes — 25 August 2026

Seventeen pieces of work:

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
5. **Auto-applied settlements no longer double-count as income** — a
   long-standing bug that inflated Cash Balance, Total Income and Settlements
   Collected on every cash order placed against an existing debt.
6. **Daily Report "Other Receipts" is now derived from Cash & Bank** instead of
   being typed in.
7. **One-Time Sale asks for nothing** — no name, no fields; tapping it goes
   straight to Order Details with a normal bill PDF, saved as a one-time
   customer.
8. **Transport trip guards** — one ongoing trip per vehicle at a time (enforced
   in the database, not just the UI), Start KM locked to staff and auto-fetched
   from the vehicle's last ended trip, End KM must be strictly greater than
   Start KM.
9. **Daily Manager Report window is now fixed at 8AM-to-8AM** — the admin
   picks one date; the four independent date/time inputs are gone.
10. **Reports page decluttered** — two full-width sections top to bottom
    (Compile Report, then Previewed Report) in place of a lopsided narrow
    sidebar next to an oversized preview.
11. **Cube Movement Trend graph now plots running stock balance, never a
    negative delta** — a sale reads as "100 → 90", not "-10".
12. **Customer Profile filters actually filter now** — Daily/Monthly/Yearly did
    nothing outside Graph View, and Cheques/Notifications ignored every
    filter shown above them.
13. **New Order no longer auto-downloads the invoice** — the bill is available
    on demand afterward, exactly like debt settlement already worked.
14. **Settle Debt no longer auto-shows the receipt preview** either — the
    modal that used to pop up right after the notification prompt is gone.
15. **Customer Profile's Orders vs Payments graph fixed** — it rendered as a
    single floating dot instead of a trend line, and Daily/Monthly/Yearly
    looked like they did nothing. Both traced back to a bug I introduced in
    Part 12.
16. **Staff can now price Ice Cubes** — both the New Order rate override and
    Inventory's per-cube price, previously admin-only in the UI *and*
    enforced server-side.
17. **New: User Management in Settings** — admins can create, edit and
    delete login accounts, and reset any user's password, from a new table
    on the Settings page. Needs a manual deploy step — see below.

**Status:** production build passes (`npm run build`, ✓ built). ESLint reports
the same problems as before the changes (`React` unused in both pages,
`AlertCircle` / `ArrowUpRight` in the dashboard, the pre-existing
`set-state-in-effect` in `useDebts`) — no new lint errors.
**Not verified:** nothing was run against the live Supabase instance, so
neither the settlement path nor the new ledger inserts were exercised at
runtime.

**43 files changed · 6 new migrations · 1 new Edge Function**

---

## ⚠️ Four migrations to apply, in order

| Migration | Part |
|---|---|
| `20260825010000_debt_settlement_payment_routing.sql` | 2 |
| `20260825020000_damaged_cubes_and_pooled_orders.sql` | 4 |
| `20260825030000_auto_applied_settlement_flag.sql` | 5 |
| `20260825040000_transport_trip_guards.sql` | 8 |
| `20260825050000_staff_can_price_ice_cubes.sql` | 16 |
| `20260825060000_user_management.sql` | 17 |

Each is detailed in its section below. `supabase_schema.sql` has been updated
to match all six, so a fresh provision already includes them.

**Part 17 also needs an Edge Function deployed — this is the one piece of
this entire changelog that will not work until you do that yourself; I have
no way to deploy it from here.** See Part 17 for the exact command.

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

- The settlements query now selects `payment_method`, `created_by` and the
  customer (it previously fetched only amount and date). It deliberately does
  **not** select `settlement_code` — see the fix note below.
- New **Debt Settlement** history action type, with a matching filter option
  in the History section.
- **Cash** settlements appear as their own entry (`+LKR …`, *"Debt Settlement
  (Cash) — Customer"*), since they have no ledger row of their own.
- **Bank-transfer and cheque** settlements are deliberately **not** listed
  twice — each already appears as the bank deposit or received cheque it
  produced. Those entries now name the settlement that created them
  (*"Debt Settlement (Bank / Online Transfer) — BOC — Debt settlement — J. Perera"*).

### Fix: `settlement_code` is not a column (regression from this part)

The first version of the query above selected `settlement_code`. That column
**does not exist**: `settle_debt_transaction` generates the code with
`get_next_code('settlement', 'D')` and returns it in its JSON result, but never
writes it to the row. PostgREST rejected the request with
`42703 column debt_settlements.settlement_code does not exist`, and because the
whole page loads through one `Promise.all`, that single 400 blanked **every**
balance on Cash & Bank (all cards showed LKR 0.00).

Fixed by selecting only real columns. History entries now reference a
settlement by customer name, falling back to the settlement id, instead of by
code.
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

# Part 5 — Auto-applied settlements double-counted as income

**Pre-existing bug**, found while working on Part 2. Not introduced by any of
the work above.

## The bug

When a **cash** order is placed for a customer who already owes money,
`place_*_order_transaction` applies that cash against their oldest debts FIFO
and writes a `debt_settlements` row per debt covered. Those rows never set
`payment_method`, so it defaults to `'cash'`.

Every figure that adds *cash sales + cash settlements* therefore counted the
same money twice:

```
LKR 1,000 cash order, customer already owed LKR 400

  cash sales total         1,000     (the sale)
  cash settlements total   +  400     (the auto-applied offset)
  ─────────────────────────────────
  reported cash in         1,400     <- but only 1,000 was handed over
```

Affected **Cash Balance** (Cash & Bank), **Total Income** (Daily Manager
Report) and **Settlements Collected** (analytical reports).

## ⚠️ Migration: `20260825030000_auto_applied_settlement_flag.sql`

Adds `debt_settlements.is_auto_applied boolean not null default false`, and:

- **Backfills** existing rows from the `(auto-applied from sale …)` marker the
  order RPCs have always written into `created_by`.
- **A `BEFORE INSERT` trigger** sets the flag from that same marker. This
  covers both legacy order functions without restating ~150 lines of each, and
  any future one following the convention. It never overrides an explicit
  `true`, so explicit stamping always wins.
- `place_pooled_order_transaction` (Part 4, the live order path) **stamps the
  flag explicitly**, so the path that matters doesn't rely on the trigger at
  all. Belt and braces, deliberately.

**Existing balances will change when this is applied.** Cash Balance drops by
the historical total of auto-applied offsets. That is the correction — the old
figure was overstating the till.

## The distinction being drawn

These settlements are **real**. The debt genuinely was reduced and they must
keep counting toward debt balances. They simply are not *money arriving at the
till*, because it already arrived as the sale. Everywhere the two readings
diverge, they are now separated:

| Figure | Includes auto-applied? |
|---|---|
| Cash Balance | **No** — the cash is already in via the sale |
| Daily Report **Total Income** / Credit Received | **No** — same reason |
| Reports **Settlements Collected** | **No** — nothing was collected |
| Reports **Debt Balance** (`debtRevenue − debt reduced`) | **Yes** — the debt really did go down |
| Debts page, customer statements, debt ledger | **Yes**, unchanged |

## Files

- `src/utils/cashBankMath.js` — `settlementCashTotal` (and the bank/cheque
  splits) exclude auto-applied rows; new `settlementAutoAppliedTotal` exported
  for transparency.
- `src/hooks/useCashBank.js` — selects the flag. Auto-applied rows still appear
  in Cash Flow History, because they explain a debt reduction the operator
  would otherwise see no reason for — but as **neutral** entries with no `+`,
  labelled *"Debt Settlement (applied from a cash order — no new cash)"*.
- `src/hooks/useDailyReport.js` — `creditAmountReceived` counts collections
  only; new `debtOffsetByCashOrders` reports the offsets separately. The credit
  collection table labels those rows *"Applied from Cash Order"* rather than
  showing a payment method the customer never chose.
- `src/components/DailyManagerReportView.jsx` — a **Debt Offset (Not Income)**
  tile appears when there is one, so the number is visible without being
  folded into Total Income.
- `src/pages/ReportsPage.jsx` — `totalSettled` (collections) and
  `totalAutoApplied` tallied separately across all four report modes; summary
  gains `totalDebtReduced = totalSettled + totalAutoApplied`.
- `src/utils/pdfGenerator.js` — the report's Debt Balance nets against
  `totalDebtReduced`, not `totalSettled`, so excluding offsets from
  collections doesn't overstate outstanding credit. Falls back to
  `totalSettled` for payloads built before the split.

## Verified

`computeCashBankBalances` run against the scenario above (1,000 cash sale, 400
auto-applied offset, plus a 250 cash collection, a 300 transfer and a 150
cheque): Cash Balance 1,250, Bank 300, Hand Cheques 150 — 1,700 total, exactly
the money that changed hands. It was 1,650 in cash alone before the fix.

---

# Part 6 — Daily Report: Other Receipts derived from Cash & Bank

**No migration.** UI/derivation only.

Section 02's **Other Receipts** was a manager-typed number. Cash & Bank
**Section 01 (Other Cash Receives)** already records exactly this money, under
its two buttons — **Received by Head Office** and **Other Receives** — so the
report now sums that ledger for the selected range instead of asking anyone to
retype it. The two can no longer drift apart.

- `src/hooks/useDailyReport.js` — `otherReceipts` is the total of
  `cash_receives` rows whose `received_at` falls in range. Also exposes
  `headOfficeReceipts` and `otherCashReceipts` separately.
- `src/components/DailyManagerReportView.jsx` — the input became a read-only
  tile showing the total, with a **Head Office · Other** breakdown beneath it
  so the figure traces straight back to the two buttons that produced it.
  Saving persists the derived value, so a signed-off report keeps its number.

The daily report PDF is unchanged — it already printed
`incomeDetails.otherReceipts`, which is simply a trustworthy number now.

### Section 01 and 02 are now fully derived

With this, every manager-typed figure in the first two sections is gone:

| Field | Was | Now |
|---|---|---|
| Free Issue | typed | Free Cubes on the order (Part 4) |
| Damaged | typed | Damaged Cubes inventory line (Part 4) |
| Other Receipts | typed | Cash & Bank Section 01 (Part 6) |

Only the free-text incident note and the verifying manager's sign-off remain
manual.

---

# Part 7 — One-Time Sale: no name, no fields

**No migration.** UI/flow only.

## Before

Choosing "One-Time Sale" at Step 2 opened a form asking for a name (min 2
characters) before the operator could continue — friction for what's meant to
be the fast path for a walk-in buyer who isn't going to be a repeat customer.

## Now — `src/pages/SalesPage.jsx`

Tapping **One-Time Sale** both selects the mode and carries the wizard
straight to **Step 3 (Order Details)** — the same one-tap-and-go pattern
`selectCustomer()` already uses for picking a registry customer. Nothing is
typed. The order is placed, the bill PDF generates and downloads exactly as
for any other sale, and a customer row is saved with `is_one_time = true`, a
generic name (`"Walk-in Customer"`), and its own atomically-issued `OTC-####`
code — so distinct walk-ins never collide even though they now share a name.

### The one case that still pauses: One-Time + Debt

A one-time customer has no phone on file, so a debt against one can never be
chased later. That combination alone stays on Step 2 with the existing
warning, and now needs one tap of **Next** rather than a typed name — the
friction removed was the name field, not the safety check. Cash orders skip
this entirely.

### `selectOneTime()`

New handler, mirroring `selectCustomer()`:

```js
const selectOneTime = () => {
  setOneTimeMode(true);
  setCustomerId('');
  setCustomerSearchQuery('');
  setCubePrice(resolveDefaultRate());   // no customer_id -> falls back to the live rate
  if (paymentType !== 'debt') {
    setTimeout(() => setStep(3), 180);  // 180ms matches selectCustomer's tap feedback
  }
};
```

`oneTimeName` state, its validation in `nextStep`, and its `Input` field are
all removed — there was nothing left to validate.

---

# Part 8 — Transport trip guards

Scoped to the **Transport tab** (`transport_trips` table, `TransportPage.jsx` /
`TransportTripFormModal.jsx` / `EndTripModal.jsx` / `useTransportTrips.js`).
The Vehicle Profile page's trip log (`vehicle_trips`, a different table with no
ongoing/completed concept — start and end KM are both entered at once as a
historical entry) is a separate feature and was left untouched.

## ⚠️ Migration: `20260825040000_transport_trip_guards.sql`

| Change | Purpose |
|---|---|
| Partial unique index `(vehicle_id) where status = 'ongoing'` | One ongoing trip per vehicle, enforced atomically |
| `transport_trips_odometer_order` check tightened from `>=` to `>` | End KM must be strictly greater than Start KM |

**If the unique index fails to create**, duplicate ongoing trips already exist
for some vehicle — end (or soft-delete) the extras for that vehicle, then
re-run the migration. The migration does not auto-resolve this; guessing which
of two live "ongoing" trips is the real one isn't a call to make silently.

## 1. One ongoing trip per vehicle

**Database**: the partial unique index above — the actual guarantee. Two
operators racing to start the same vehicle can't both succeed; the loser gets
a real database error, not a lost update.

**UI** (`TransportTripFormModal.jsx`): the Vehicle dropdown shows a vehicle
already mid-trip as `Vehicle No — Model (Trip In Progress)` and **disabled**
(new `disabled` support added to the shared `Select` component), so the
operator sees why rather than the option silently disappearing.

**App-level check** (`useTransportTrips.js` `startTrip()`): queries for an
existing ongoing trip for the vehicle before inserting, for a clean, immediate
error message — *"This vehicle already has a trip in progress. End it before
starting a new one."* If the pre-check and the unique index still race (two
requests within the same instant), the insert's `23505` unique-violation is
caught and turned into the same friendly message rather than a raw Postgres
error.

## 2. Start KM: staff can't edit it, admin can

`TransportTripFormModal.jsx` gained an `isAdmin` prop, wired from
`useAuth()` in `TransportPage.jsx`. The Start KM field:

- **Staff**: `disabled`, showing whatever the auto-fetch below resolved. A
  caption underneath reads *"Auto-fetched from last ended trip"*.
- **Admin**: fully editable, with the auto-fetched value as the starting point
  — same override pattern already used for cube rates in the New Order wizard
  (Part 4).

## 3. Last ended trip's KM feeds the next Start KM

**Already existed** — an effect in `TransportTripFormModal.jsx` looks up the
selected vehicle's most recently completed trip and pre-fills Start KM from
its `end_odometer`, falling back to the vehicle's `initial_odometer` if it has
never completed a trip. Part 8 doesn't change this logic, only who can
override it (see #2).

## 4. End KM must be strictly greater than Start KM

Was `>=` (a zero-distance trip was accepted) in three places, all now `>`:

- **Database**: `transport_trips_odometer_order` check constraint (above).
- **`useTransportTrips.js` `endTrip()`**: `end <= startOdometer` throws *"Final
  KM must be greater than the Start KM."*
- **`EndTripModal.jsx`**: same client-side check, same message.

## Also fixed while in this code: trip creator was always "Operator"

`handleStartTrip` in `TransportPage.jsx` hardcoded `'Operator'` as the trip's
`created_by`/activity-log actor regardless of who was actually logged in — the
one place in this flow not already using `user?.fullName`, unlike every other
wizard in the app. Now passes `user?.fullName || 'Operator'`, matching the
Debts/Sales pattern, so "who started this trip" is accurate in the audit trail.

---

# Part 9 — Daily Manager Report: fixed 8AM–8AM window

**No migration.** UI/hook only — no schema change.

## Before

The report header had **four independent inputs**: From Date, To Date, From
Time, To Time. Nothing stopped an admin picking an arbitrary window (three
days, 2 PM to 11 AM, etc.), which doesn't match a "daily" report and made two
reports for what should be the same business day hard to compare.

## Now

One date input. The report always covers **8:00 AM the previous calendar day
through 8:00 AM the selected day** — the business day that ends the morning of
the date picked. A caption under the picker states the resolved window
outright (*"8:00 AM 24-08-2026 → 8:00 AM 25-08-2026"*) so the fixed rule is
never a mystery.

## `src/hooks/useDailyReport.js` — the window moved into the hook itself

Signature changed from `useDailyReport(fromDateStr, toDateStr, fromTime, toTime)`
to **`useDailyReport(selectedDateStr)`**. Internally:

```js
const targetToStr = selectedDateStr || todayStr();
const targetFromStr = previousLocalDateStr(targetToStr);
const fromTime = '08:00';
const toTime = '08:00';
```

The 8AM-to-8AM rule now lives in exactly one place, as a hook invariant, not a
convention the caller has to know and pass in correctly. There is only one
caller (`DailyManagerReportView.jsx`), so this was safe to bake in directly
rather than leaving the hook generic.

### `report_date` now keys off the selected day, not the start day

Previously `report_date` (the Supabase upsert key, the `localStorage` key, and
the saved-report lookup) was `targetFromStr` — meaningless before now since
`fromDate === toDate` in the normal case. With the window always spanning two
calendar days, keying off the **start** day would save "25 Aug's report" under
the row dated "24 Aug" — confusing for anyone reading the table directly, and
mismatched against what the admin actually selected. All three now key off
`targetToStr` (the selected day) instead, so a report picked for "25 Aug" is
saved, found again, and logged as the 25 Aug report.

**This changes the primary key of already-saved reports.** A report saved
under the old scheme is keyed by what was then `fromDate` (typically the same
calendar day, since the old default was a single day) — so for a report that
was always used as a single-day report, the key doesn't change and existing
data is found exactly as before. Only a report previously saved with a
genuinely different From/To range would resolve to a different lookup date
now; there is no way to migrate those without knowing which end of the old
range the admin meant as "the" date, so they are not migrated.

## `src/utils/date.js` — new `previousLocalDateStr()`

```js
export function previousLocalDateStr(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return toLocalDateStr(new Date(y, m - 1, d - 1));
}
```

Built on the local-time `Date` constructor (not `new Date(dateStr)`, which
parses as UTC midnight and can land on the wrong local day) so it can't drift,
and correctly rolls back across month and year boundaries — verified directly
(`2026-08-25` → `2026-08-24`, `2026-03-01` → `2026-02-28`, `2026-01-01` →
`2025-12-31`).

## `src/components/DailyManagerReportView.jsx`

- Four inputs (`fromDate`/`toDate`/`fromTime`/`toTime` state + the two picker
  rows, including the `Clock` icon) collapsed to one `selectedDate` state and
  one `<input type="date">`, capped at `max={todayStr()}` — can't report a day
  that hasn't happened yet.
- `fromDate`/`toDate` are still derived locally (`previousLocalDateStr(selectedDate)`
  / `selectedDate`) purely for the ~10 existing empty-state captions and the
  save/export toasts — `useDailyReport` remains the actual source of truth for
  the query window.
- The verified/lock `rangeKey` is now just `selectedDate` (was
  `` `${fromDate}|${toDate}` ``) — same behavior, since the pair was always
  derived from one selection anyway.
- PDF filename simplified to `Daily_Report_{selectedDate}.pdf` (was
  `Daily_Report_{fromDate}_to_{toDate}.pdf`); the PDF's own header date label
  (`reportDateFrom`/`reportDateTo` in `pdfGenerator.js`) is untouched and
  correctly shows the two-day span.

---

# Part 10 — Reports page layout: Compile Report, then Previewed Report

**No migration, no behavior change.** Layout only — every report type, filter,
button and preview table works exactly as before; only the arrangement on
screen changed.

## Before

A `grid-cols-1 xl:grid-cols-3` split: a narrow 1/3-width left column stacked
two separate cards (a **Compile Report** card with the seven report types as
tall full-width buttons, then a **Set Parameters** card below it — which, for
Daily Manager Report, held nothing but a paragraph of description text since
its date picker lives inside `DailyManagerReportView` itself) against a 2/3
-width preview on the right. On a wide screen the result was a cramped list of
buttons dwarfed by a huge preview beside it — the "messy" in the request.

## Now

Two full-width sections, stacked top to bottom:

1. **Compile Report** — the seven report types as a horizontal, wrapping chip
   strip (same pattern as the section tabs on Cash & Bank / Transport — active
   chip filled navy, others ghost/hover), followed by that type's parameters
   (capped at `max-w-2xl` so a lone field like "Select Week" doesn't stretch
   edge-to-edge now that the card spans the full page) and the **Compile
   Preview** button. For Daily Manager Report the card ends at the chip strip
   — nothing to configure there any more (see below).
2. **Previewed Report** — the actual output, full width: `DailyManagerReportView`
   for that type, or the existing Live Preview panel (table + summary strip +
   Download PDF) for every other type.

## Files

- `src/pages/ReportsPage.jsx` — new module-level `REPORT_TYPES` array
  (`value`/`label`/`icon`) replaces seven near-identical button blocks with one
  `.map()`; the outer `grid-cols-3` / `xl:col-span-2` split is gone in favor of
  a plain vertical stack; the "Full Report" From/To Date pair now sits in a
  `grid-cols-2` row, matching the Custom report's existing date-pair layout.

## Also removed: the redundant Daily Manager Report description

The old "Set Parameters" card showed *"Daily Manager Report auto-populates
live stock balance, cash & credit income…"* for that type — but
`DailyManagerReportView`'s own header already carries almost the same line
(*"Auto-populated from system sales, debts, and production logs with manager
entries."*). Since Daily Manager Report's Compile Report card now has nothing
else to show, this duplicate text was dropped rather than carried over as
dead weight.

---

# Part 11 — Cube Movement Trend: running stock balance, never negative

**No migration, no new data.** Rebuilt entirely from `useInventory()`'s
existing `inventory` (live balances) and `transactions` (audit log) —
`src/pages/InventoryPage.jsx` only.

## The bug

The graph summed each bucket's `quantity_change` values directly — the **net
movement within that hour/day/month**, not the stock level. A 10-cube sale in
an otherwise-quiet hour plotted as `-10`; an hour with no activity plotted as
a hard `0`, even though real stock was never zero. The line told you how much
moved, not what was actually on the shelf — the opposite of what an inventory
trend graph is for, and exactly the defect the spec calls out:

> Do NOT plot: `Production = -10`. Instead plot: `Production: 100 → 90`.

## The fix: reconstruct the running balance, don't sum deltas

For each of the four series (Production / Resell / Brine / Damaged), every
point on the axis now holds the **actual quantity on hand at the end of that
bucket** — worked out the same way `previousDayBalance` already is in the
Daily Manager Report (Part 4/6): wind the *live* balance backwards by every
transaction from the period's start up to now, then walk forward through the
period's own transactions in chronological order, applying each one to a
running total.

```
openingBalance[type] = liveQty[type] − Σ(quantity_change for txns ≥ periodStart)
```

Then, for each transaction in the period (sorted ascending — the query
returns newest-first, and reconstructing a running total out of order
produces nonsense):

```
running[type] = max(0, running[type] + quantity_change)
bucket[seriesKey] = running[type]
```

A bucket nothing touched **forward-fills** from the previous one, so the line
stays flat where nothing happened instead of dropping to zero — this is what
makes "13:00, no transaction" correctly read as "still 100", not "0".

### Verified against the spec's own worked example

Simulated the exact scenario in the spec — opening 100/50/10/5 at the start of
the day, a 2:00 PM sale of 10 Production and 10 Resell plus 10 Brine added —
and the reconstructed points came out exactly `100→90`, `50→40`, `10→20`,
`5→5`, with every hour between flat and **zero negative values anywhere**.
Also checked two same-hour transactions of the same type aggregate into one
point with the correct net movement and both reasons listed.

## `Math.max(0, …)` — belt and braces

Real stock can't go negative (the add/deduct RPCs refuse a deduction that
would), so a correct reconstruction never needs this. It's a display floor
purely so the chart itself can never render a negative line even if the
underlying data were ever slightly inconsistent — "never minus values" as a
UI guarantee, not just an assumption about the data. `<YAxis domain={[0, 'auto']}>`
backs this up at the axis level too.

## Tooltip: stock, movement, and reason together

A custom `CubeTrendTooltip` (recharts' default is a bare key/value list)
replaces the old fixed-dark tooltip. For each series at the hovered point it
shows the stock level, that point's net movement, and why it moved:

```
Production
90 cubes
Movement: -10 · Sale
```

`transaction_type` → reason mapping: `add` → *Stock Added*, `sale_deduction`
→ *Sale*, `manual_removal` → *Manual Removal*, `adjustment` → *Adjustment*,
`free_issue` → *Free Issue*. A bucket with no movement for that series reads
*"No movement"*; a bucket with several distinct reasons lists all of them
(e.g. *"Sale, Stock Added"*).

## Also fixed while in this code: the tooltip never followed the theme

The old tooltip used a hardcoded `contentStyle={{ backgroundColor: '#0f172a', … }}`
— always dark, regardless of the app's light/dark setting. The new
`CubeTrendTooltip` is a themed component (`bg-white dark:bg-slate-900`), so it
now actually satisfies "Support dark/light dashboard themes."

## Other spec items covered

- **Data points shown**: `dot={false}` → `dot={{ r: 3 }}` on every line.
- **Legend, multi-series, smooth lines**: already present, unchanged.
- **Future data structure**: not hardcoded to two timestamps — buckets are
  generic per the existing Daily/Monthly/Yearly filter, and the algorithm
  works identically regardless of how many transactions fall in a bucket, from
  zero to many.

---

# Part 12 — Customer Profile: filters that didn't filter

**No migration.** `src/pages/CustomerProfilePage.jsx` only.

## Two separate bugs under one report

**1. Daily/Monthly/Yearly did nothing outside Graph View.** These buttons set
`granularity`, which only ever controlled the Graph tab's bucket size — it was
never read by `filteredSales`/`filteredPayments`, so clicking them on Sales
History, Payment History, Cheques, or Notifications highlighted a button and
changed nothing else on screen. Fixed with `applyPeriod()`, the same
date-range-preset pattern already used on Employees/Transport: clicking
"Monthly" now sets `dateFrom`/`dateTo` to this month (in addition to still
setting `granularity` for the graph), so it actually narrows every tab.

Once a preset can genuinely restrict what's showing, there needs to be a way
back out — added a **Clear Filters** link (shown once anything is filtered)
that resets type, dates and granularity, matching the same control that
already exists on Employees.

**2. Cheques and Notifications ignored every filter above them.** Both tabs
rendered the raw, unfiltered `cheques`/`notifications` arrays — the All/Debt
Orders/Cash Orders buttons, the Daily/Monthly/Yearly buttons, and the date
range all sat above these tabs doing precisely nothing, which is the core of
"not filtering correctly."

- **Cheques** — new `filteredCheques` applies the date range (`received_at`).
  The Cash/Debt Orders buttons are **hidden** on this tab rather than wired
  to a guess: `cheque_records.settlement_id` is nullable, so a cheque isn't
  reliably tied to any order — some are logged straight through Cash & Bank
  with no debt link at all. Forcing a Cash/Debt split onto data that doesn't
  carry that distinction would just be a different way of not filtering
  correctly.
- **Notifications** — new `filteredNotifications` applies the date range
  (`sent_at`) *and* the type filter, which — unlike cheques — really is
  derivable here: a `debt_settlement` notification is always debt-related
  (same fact the existing Payments filter already relies on), and a
  `sale_invoice` notification's `reference_code` is that sale's own
  `sale_code`, so its cash/debt status is looked up from `customerSales`
  rather than guessed.

## Files

- `applyPeriod()` / `clearFilters()` — new handlers, state unchanged
  (`typeFilter`, `granularity`, `dateFrom`, `dateTo`).
- `filteredCheques`, `filteredNotifications`, `saleByCode` — new memos.
- The Daily/Monthly/Yearly buttons call `applyPeriod(opt)` instead of
  `setGranularity(opt)` directly.
- The Cash/Debt Orders button row is wrapped in `{viewMode !== 'cheques' && (…)}`.
- `<Table data={…}>` on both tabs points at the new filtered memos; their
  empty-state copy now says "for the selected filters" instead of implying
  the customer simply has none.

---

# Part 13 — Stop auto-downloading bills

**No migration.** `src/pages/SalesPage.jsx` only.

## Audit: every PDF `.save()` in the app

Checked all eight `doc.save(...)` call sites for whether they fire on their
own or only from an explicit click:

| Location | Trigger | Verdict |
|---|---|---|
| `SalesPage.jsx` `handlePlaceOrder` | **Fired automatically** the instant an order is placed | **Fixed — removed** |
| `SalesPage.jsx` `downloadInvoice` | "Download" button (Sales History row / bill preview modal) | Explicit — kept |
| `DebtsPage.jsx` `downloadReceipt` | "Download PDF" button inside the settlement receipt preview modal | Explicit — kept |
| `DebtsPage.jsx` `downloadBill` | "Download PDF" button inside the Debt Statement preview modal | Explicit — kept |
| `CustomerProfilePage.jsx` `handleViewSale` | "View" row action in Sales History | Explicit click — kept (a pre-existing naming quirk: it downloads rather than previews despite the button's label, but the operator did click it — out of scope for "stop *automatic* downloads") |
| `PublicBillPage.jsx` `handleDownloadPDF` | "Download" button on the customer-facing shared bill page | Explicit, different audience entirely — kept |
| `ReportsPage.jsx` `handleDownloadPDF` | "Download PDF" button on a compiled report preview | Explicit — kept |
| `DailyManagerReportView.jsx` `handleDownloadPDF` | "Export PDF" button | Explicit — kept |

**Only one genuinely auto-fired**: placing an order. Settling a debt already
did exactly what you're asking for — `settleCustomerDebt` opens an in-app
receipt **preview** (an iframe in a modal), and the file only saves to disk if
the operator clicks **Download PDF** inside it. That pattern was already
correct before this change; nothing there needed fixing.

## The fix

`handlePlaceOrder` used to generate the invoice and immediately call
`billDoc.save(...)` the moment `placeOrder()` returned — no preview, no
click, straight to the downloads folder. That call is removed.

The invoice itself is unaffected — `placeOrder()` (in `useSales.js`) still
generates the PDF and uploads it to storage server-side, which is what powers
the shareable bill link (`/bill/:saleCode`) and the WhatsApp/SMS invoice
notification; only the *local browser save* triggered from the wizard was
removed. To get the file, the operator uses the **View** or **Download**
button already on each row in Sales History (or the Download button inside
the View preview modal) — the exact "I'll download it myself afterward"
flow requested.

---

# Part 14 — Stop auto-showing the settlement receipt preview

**No migration.** `src/pages/DebtsPage.jsx` only. Direct follow-up to Part 13
— you flagged that the receipt *preview* popping up automatically was
unwanted too, same as the auto-download.

## What changed

`handleConfirmSettlement` used to, right after a debt was settled: generate
the receipt PDF, open the WhatsApp/SMS notification prompt, and then — once
that prompt was answered either way — automatically pop open a **Settlement
Receipt** modal with the PDF in an iframe. That auto-open is gone. Settling a
debt now shows the success toast and the WhatsApp/SMS prompt (unchanged —
that's notifying the *customer*, a separate concern from previewing the PDF
for the operator) and stops there.

Removed along with it, since nothing else referenced them: `receiptPreviewOpen`
/ `receiptPdfUrl` state, `downloadReceipt()`, `closeReceiptPreview()`, the
Settlement Receipt `<Modal>` block, and the now-unused
`generateSettlementReceiptPDF` import (the function itself is untouched —
`useDebts.js`'s single-debt `settleDebt()` path still uses it server-side for
the storage-backed receipt, unrelated to this UI).

## ⚠️ Trade-off worth knowing about

Unlike Sales (where removing the auto-download in Part 13 was free — a
persisted `bill_pdf_url` and per-row View/Download buttons in Sales History
already existed), **there was no separate persistent way to retrieve the
settlement-specific receipt** (with its settlement code, cheque/bank detail)
— the auto-preview was the *only* place it was ever generated. Removing it
means that document is no longer obtainable through the UI at all, before or
after.

What **does** remain, unaffected: the **Debt History → "PDF" button** on each
row generates a *Debt Statement* (a different document — `generateDebtStatementPDF`)
that lists every settlement against that debt with its date, amount, payment
method and notes. That's the persistent proof-of-payment record going
forward. If you want the settlement receipt itself to be retrievable later
(e.g. stored server-side like Sales' invoices, with a button somewhere to
pull it back up), say so and I'll add it — I didn't build that since it
wasn't asked for and Debt Statement already covers "what did this customer
pay and when."

---

# Part 15 — Customer Profile graph: fixed a regression from Part 12

**No migration.** `src/pages/CustomerProfilePage.jsx` only. You reported the
Orders vs Payments graph rendering as a single dot with no line, and the
Daily/Monthly/Yearly buttons looking ineffective on that tab — this traces
straight back to Part 12's `applyPeriod` fix.

## Root cause: Part 12's date-range presets collapsed the graph to one point

Part 12 made Daily/Monthly/Yearly set `dateFrom`/`dateTo` to *exactly* one
unit — "today", "this month", "this year" — so those buttons would actually
narrow Sales History / Payment History / Cheques / Notifications, which they
previously didn't. That part was correct.

But the **same three buttons also control the graph's bucket size**
(`granularity`), and a one-day window bucketed by day (or one-month window
bucketed by month, or one-year window bucketed by year) can only ever produce
**one bucket** — the window and the bucket width were always exactly equal.
On top of that, `graphData` only ever created a bucket where a transaction
actually existed, so a customer with one order and one payment landing on
different days produced at most two isolated points with no bucket in
between to draw a line through — recharts can't draw a line segment from a
single point, so it fell back to rendering a lone dot. Switching between
Daily/Monthly/Yearly kept reproducing the same "one dot" result no matter
which was clicked, which is exactly why it looked like the buttons weren't
doing anything.

## The fix

**1. Wider preset windows.** Daily/Monthly/Yearly now pair a bucket size with
a window actually wide enough to show a trend across it:

| Button | Window | Buckets |
|---|---|---|
| Daily | Last 30 days | up to 30, one per day |
| Monthly | Last 12 months | up to 12, one per month |
| Yearly | Last 5 years | up to 5, one per year |

This also improves the list tabs — "last 30 days of sales" is a far more
useful default than "just today", which was often empty for a customer
without same-day activity.

**2. Gap-free buckets.** `graphData` now pre-fills **every** step across the
active window — every day/month/year, whether or not it has a transaction —
before folding in real sales/payments. A day with no activity now shows as a
flat point at 0 instead of not existing at all, so the line is continuous
across the whole window rather than jumping between whichever scattered days
happened to have data.

Verified numerically: simulated the 30-day Daily window with a sale on one
day and a payment the next (matching your screenshot's numbers) — the result
is 30 continuous daily buckets, the two real transactions land in the right
buckets with the right totals, and every other bucket is a clean, real zero.
Also confirmed the Monthly and Yearly presets produce exactly 12 and 5
buckets respectively.

**3. Sensible fallback when no filter is active.** If `dateFrom`/`dateTo` are
both empty (a fresh profile, before any preset or manual date is picked),
the window now derives from the actual earliest/latest sale or settlement
date on record for that customer, instead of the chart just being empty.

## Note

`typeFilter` (All / Debt Orders / Cash Orders) was already applied correctly
upstream of the graph (via `filteredSales`/`filteredPayments`, unchanged) —
that part was never the bug. Only the bucket generation and the window width
were wrong.

---

# Part 16 — Staff can price Ice Cubes

## ⚠️ Migration: `20260825050000_staff_can_price_ice_cubes.sql`

Both places a cube rate is set were blocked for non-admins **at the
database**, not just in the UI — unlocking the input alone wouldn't have
worked without this:

| Function | Before | After |
|---|---|---|
| `place_pooled_order_transaction` | Silently discarded a non-admin's typed price and used the customer/inventory default instead — the UI would show whatever they typed, but the saved sale used a different number | Honors any authenticated caller's price override |
| `update_inventory_price` | `raise exception 'Only administrators can update inventory prices'` | No role check; still requires a positive price |

**Deliberately not touched**: `place_order_transaction` and
`place_multi_item_order_transaction` still carry the same admin-only check.
Both are legacy, superseded by `place_pooled_order_transaction` (Part 4) and
already confirmed unused by the app — updating dead code here would be pure
noise.

## Frontend

- **`src/pages/SalesPage.jsx`** — the Cube Price field in the New Order
  wizard (Step 3) is no longer `disabled={!isAdmin}`; the "editable by
  Administrators only" tooltip and dimmed styling are gone. The "no rate set"
  validation toast no longer branches on role ("Ask an admin to set it…") —
  everyone just gets "Enter a cube price before continuing."
- **`src/pages/InventoryPage.jsx`** — each sellable cube's **Price** button
  (Production/Resell — Brine and Damaged have no price to edit either way)
  is available to everyone, matching the existing **Add** button. **Remove**
  stays admin-only, unchanged — deleting stock is a different, more
  destructive privilege than setting a rate, and wasn't part of this request.

## What staff can now do

- Override the per-cube rate on a New Order line before placing it (was
  previously stuck with the auto-fetched customer/inventory rate).
- Set/update Production and Resell's price directly from the Inventory page,
  the same "Price" button admins always had.

---

# Part 17 — User Management in Settings

New feature, not a fix. Lets an admin manage every login account — create,
edit (including email/username/display name/role), delete, and **reset any
user's password** — from a table in Settings, matching the fields and layout
you specified.

## ⚠️ Two deploy steps required — this part will not work until both are done

I can write code and migrations from here, but I cannot run the Supabase CLI
or deploy an Edge Function myself. Until both steps below are done, **Add
User / Edit / Delete will fail** (the table itself will load fine, and
existing accounts will show with an auto-generated username — see the
migration note).

**1. Apply the migration** — `20260825060000_user_management.sql`.

**2. Deploy the new Edge Function**, from the project root:
```
supabase functions deploy admin-users
```
No secrets need to be set manually for it — `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` are provided automatically to every Edge
Function by Supabase (unlike the existing `saga-ai-proxy` function, which
*does* need `GEMINI_API_KEY` set by hand — this one needs nothing extra).

## Why a whole Edge Function was necessary

Creating a user with a chosen password, and resetting another user's
password, both require the Supabase **Admin Auth API**
(`supabase.auth.admin.createUser` / `.updateUserById` / `.deleteUser`).
That API only works with the project's `service_role` key — a key that must
never be shipped to the browser (anyone could extract it from the page and
gain full database + auth control). The only safe place to hold it is a
server-side Edge Function, so `supabase/functions/admin-users/index.ts` is a
new function, following the same pattern as the existing `saga-ai-proxy`,
that:

1. Reads the caller's JWT from the request's `Authorization` header.
2. Verifies it belongs to a real, currently-admin user (`profiles.role =
   'admin'`) — **checked on every single call**, since this function can
   create, delete, and reset the password of any account. Get this wrong and
   any logged-in staff member could grant themselves admin or lock everyone
   else out.
3. Only then performs the requested `create` / `update` / `delete` using the
   service-role client.

Listing users doesn't need any of this — `list_user_directory()` is a plain,
admin-gated Postgres function (`supabase.rpc('list_user_directory')`,
no Edge Function round-trip), since a `security definer` function can safely
read `auth.users.email` (which a normal client query can't see at all —
PostgREST never exposes that table) without ever touching the service role
key.

## ⚠️ Migration: `20260825060000_user_management.sql`

| Change | Purpose |
|---|---|
| `profiles.username text not null unique` | New field, distinct from both the sign-in email and the display name — e.g. email `j.silva@sagacious.com`, display name "John Silva", username `john_silva` |
| Backfill of existing rows | Derives a username from each account's current email (the part before `@`), de-duplicated by appending the row's id on collision, so the `NOT NULL UNIQUE` constraint can be applied without breaking your existing admin/user logins |
| `handle_new_user()` extended | Picks up `username` from the new auth user's metadata, alongside the `full_name`/`role` it already handled |
| New `list_user_directory()` | Admin-gated; the only client-safe way to see login emails (see above) |

**Existing accounts get an auto-generated username** from this backfill
(e.g. `admin` from `admin@sagacious.com`) — you can rename them to whatever
you'd prefer via **Edit** once the feature is live; nothing about their
email or password changes.

## The User Management table — `src/pages/SettingsPage.jsx`

Added as its own full-width card, above Company Branding (Settings is
already entirely admin-gated as a page, so no extra role check was needed
here). Columns: **User** (username) · **Email** · **Display Name** · **Role**
(badge) · **Actions** (Edit / Delete), plus an **Add User** button — exactly
as specified.

- **Delete** is disabled, with an explanatory tooltip, on the row matching
  the currently signed-in admin — can't delete the account you're using
  right now. (`AuthContext`'s session object gained an `id` field to make
  this comparison possible — it previously only carried
  email/fullName/role.) The Edge Function enforces the same rule
  server-side regardless, so this is a convenience, not the actual guard.
- Delete asks for confirmation via the same `ConfirmDialog` pattern used for
  Branches, warning that the person can no longer sign in.

## Add / Edit form — `src/components/UserFormModal.jsx`

Built with `react-hook-form` + `zod`, the same pattern as
`CustomerFormModal.jsx`. Fields exactly as specified:

| Field | Add mode | Edit mode |
|---|---|---|
| Email Address (Used to sign in) | required, validated as an email | required |
| Username | required, min 2 chars | required |
| Display Name | optional | optional |
| Password | **required**, min 6 chars, "Set secure password" | **optional** — "New Password (Leave blank to keep current)", min 6 chars *only if typed* |
| System Role | User / Admin toggle | User / Admin toggle |

**Admin can update any user's password** through the Edit form's password
field — leaving it blank keeps the account's current password untouched;
typing a new one (6+ characters) replaces it immediately via the Edge
Function's `updateUserById` call. No confirmation of the *old* password is
needed since the caller is a verified admin acting on someone else's
account, not the account holder resetting their own.

## `src/hooks/useUserManagement.js`

`users` (live, realtime-subscribed to `profiles` changes) plus
`addUser` / `updateUser` / `deleteUser`, each a thin wrapper over
`supabase.functions.invoke('admin-users', { body: { action, ... } })`. All
three log to the activity log (`entityType: 'user'`), matching every other
create/update/delete action elsewhere in the app.

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
- **The two legacy order RPCs were not restated** to stamp `is_auto_applied`.
  The trigger covers them, and rewriting ~150 lines of each to add one column
  is more risk than the trigger carries.
- **Debt ledgers, customer statements and the Debts page are untouched by
  Part 5.** Auto-applied settlements count there exactly as before — the debt
  really was reduced.
- **One-time customers still can't take debt without a tap past the warning**
  (Part 7). Removing the name field doesn't remove the reason the warning
  exists — no phone on file to chase the money.
- **Every walk-in still gets its own customer row.** No dedup, no "reuse an
  existing Walk-in Customer row" — each stays its own row with its own
  `OTC-####` code, matching how the registry already treats one-time
  customers (see `is_one_time` in the schema).
- **Vehicle Profile page's trip log (`vehicle_trips`) is untouched by Part 8.**
  Different table, different shape (both odometer readings entered at once,
  no ongoing/completed status) — the "one ongoing trip" and "admin-only Start
  KM" rules don't map onto it as written. Say the word if you want equivalent
  guards there.
- **Existing trips are not retroactively validated** against the new "must be
  strictly greater" rule — a historical trip that happens to have End KM equal
  to Start KM is left as recorded; the constraint only blocks new writes.
- **A report previously saved with a genuinely different custom From/To range
  is not migrated** to the new keying (Part 9) — there's no reliable way to
  infer which date the admin meant as "the" report date from an arbitrary old
  range, so those old rows are simply not found under the new single-date
  picker rather than guessed at.
- **`ReportsPage.jsx`'s own From/To date filters (the analytical Weekly /
  Monthly / Yearly / Custom reports) are untouched by Part 9** — those are a
  separate report with a genuinely open-ended range, unlike the Daily Manager
  Report's fixed business-day window.
- **No report logic touched in Part 10.** `handleGenerateReport`,
  `handleDownloadPDF`, every table, every summary figure, every parameter
  input's value/onChange — all identical to before. Only the surrounding
  containers moved.
- **The Production History table and the Total Added/Deducted scorecard above
  it are untouched by Part 11.** Those already showed real per-transaction
  deltas in context (with prev/new stock columns), which is correct there —
  only the Graph View's aggregation was wrong.
- **The event-per-transaction design from the spec's worked example wasn't
  used literally** (a graph with one point per real transaction timestamp).
  For a month or year view with many transactions that would be too dense to
  read. Fixed hour/day/month buckets holding the cumulative balance as of the
  end of each bucket satisfy the same principle — "plot the balance, not the
  delta" — while staying legible and scalable, and produce identical output
  to the spec's example for a daily view.
- **Cash/Debt Orders is not force-fitted onto Cheques (Part 12).** There is
  no reliable field to sort a cheque by; the buttons are hidden for that tab
  rather than wired to an incorrect rule. Say the word if a real cash/debt
  distinction for cheques should be added to the schema — right now it
  doesn't exist to filter by.
- **The Graph View's type filter behavior is unchanged** — "Cash Orders"
  still zeroes the Payments line (settlements only exist against debt
  orders), which was already correct, not part of this bug.
- **Debt settlement's receipt preview modal still opens automatically**
  after settling (Part 13). That's a preview, not a download — nothing
  saves to disk unless the operator clicks Download PDF inside it, which is
  exactly the behavior asked for. Say the word if you'd rather the preview
  not pop up either.
- **`CustomerProfilePage.jsx`'s "View" button still downloads instead of
  previewing** (Part 13's audit table). It's operator-triggered, not
  automatic, so it's outside what was asked — flagged in case it should be
  switched to a preview like Sales History's own View button for
  consistency.
- **The WhatsApp/SMS notification prompt still opens automatically after
  settling** (Part 14). That's asking whether to notify the *customer*, not
  showing the operator a PDF — a different concern from the receipt preview
  that was removed, and not something you asked to change.
- **The New Order wizard's flow is unaffected by Part 14** — it never had a
  preview step to begin with (Part 13 covered its auto-download only).
- **Sales/Payments/Cheques/Notifications tabs are otherwise unchanged by
  Part 15** — the only difference there is that Daily/Monthly/Yearly now
  scope to a 30-day/12-month/5-year window instead of a single day/month/
  year, which is Part 12's mechanism doing what it was meant to, just with a
  usable window this time.
- **The 500-iteration bucket cap is a safety net, not an active limit** for
  any of the normal presets (30/12/5 are all far under it) — it only matters
  if someone manually types an extreme custom date range.
- **Editing a past sale (the Sales History row's Pencil/Trash actions) is
  still admin-only** (Part 16). Correcting an already-placed order's
  quantity/type/payment terms after the fact is a different, more sensitive
  capability than setting a rate on a fresh order, and wasn't asked for.
- **Removing inventory stock is still admin-only** (Part 16). Only pricing
  changed — deducting stock outright is a separate, more destructive action.
- **Per-customer custom cube prices (`customer_cube_prices`, set from a
  Customer Profile) are untouched.** That's a different feature from the
  per-order override or Inventory's base price, and wasn't part of this
  request.
- **Username is not the sign-in credential** (Part 17) — email still is,
  unchanged. Username is a separate, additional identifier shown in the
  directory table, not something typed at the login screen.
- **No self-service "forgot password" flow was added.** Password resets in
  this feature are exclusively an admin acting on someone else's account
  through Edit; a user resetting their own forgotten password is a different
  feature (typically Supabase's email-based reset flow) and wasn't asked for.
- **The legacy `place_order_transaction` / `place_multi_item_order_transaction`
  functions still have their old admin-only price check** (Part 16, noted
  there too) — both are confirmed unused by the app.

---

# Part 17a — Fix: user directory returned HTTP 400 for every caller

## ⚠️ Migration: `20260825070000_fix_user_directory_email_cast.sql`

`list_user_directory()` threw on **every** invocation, including from a
genuinely `admin` account, so the User Management table never populated and the
console showed:

```
Failed to load resource: the server responded with a status of 400
Failed to fetch user directory: Object
```

## Root cause: a column type mismatch, not a permissions problem

`auth.users.email` is `character varying(255)`. Part 17's function declared its
second output column as `text`. PL/pgSQL's `RETURN QUERY` enforces an *exact*
type match against the declared result type and raised:

```
structure of query does not match function result type
DETAIL: Returned type character varying(255) does not match expected type text in column 2
```

PostgREST surfaces a `RAISE` from inside a function as an HTTP 400 — the same
status the function's own `Only administrators can view the user directory`
guard produces. That coincidence made it look like a role/RLS failure, and sent
the diagnosis down a dead end. Verified against the live DB that the migration
had applied cleanly and that `admin@sagacious.com` really did have
`role = 'admin'`; the function was failing *after* passing the admin check, on
the return itself.

## The fix

One cast — `u.email` → `u.email::text`. The function's signature and its
contract with `useUserManagement.js` are unchanged.

`supabase_schema.sql` updated to match, so a fresh provision gets the cast too.

## Note

The `admin-users` Edge Function is a **separate** deploy step and was still
undeployed at the time of this fix — that is what produced the *other* console
error (`CORS policy: Response to preflight request doesn't pass access control
check` / `net::ERR_FAILED`). A missing Edge Function cannot answer the browser's
`OPTIONS` preflight, which the browser reports as a CORS failure rather than a
404. Deploying the function resolves it; no code change was needed.

---

# Part 18 — Popup window UI/UX fixes

Reported against the "Select Customer to Settle" dialog, but the primary bug was
in the shared modal shell, so the fix reaches all 23 popups in the app.

## Bug 1 — focus rings clipped on the first/last element in every modal

`src/components/Modal.jsx`

The modal body is `overflow-y-auto`, and `overflow` clips anything painted
outside the padding box. Tailwind's `focus:ring-2` paints *outside* the
element's border box, so the ring on whichever control sat flush against the
body's edge got sliced off. Most visible on the debtor picker's search input,
which autofocuses on open: the top ~2px of its ring was missing.

Fixed with a `-m-1 p-1` pair on the scroll body — 4px of gutter inside the
scrollport, pulled back by an equal negative margin so nothing shifts visually.

## Bug 2 — background scroll unlocked early when modals stack

`src/components/Modal.jsx`

The open effect set `document.body.style.overflow = 'hidden'` and its cleanup
cleared it unconditionally. With two modals open (a `ConfirmDialog` raised from
inside a form modal), closing the *inner* one released the lock while the outer
modal was still up, letting the page scroll behind it. Now tracked with an
open-modal counter; the lock releases only when the last modal closes.

## Bug 3 — nested scrollbars in the debtor picker

`src/pages/DebtsPage.jsx`

The debtor list carried its own `max-h-[52vh] overflow-y-auto` *inside* the
modal body, which is already a scrollport. Two consequences:

- Two scrollbars, with scroll chaining between them on trackpad/touch.
- The `52vh` was picked independently of the modal's own `max-h-[92vh]` /
  `landscape:max-h-[88vh]`. On landscape tablets — the shop's actual devices —
  search + summary + a 52vh list + footer exceeds 88vh, so *both* scrollers
  engaged at once.

Now a single scrollport (the modal's own). Search + running total sit in a
`sticky -top-1` band and the Cancel footer in a `sticky -bottom-1` band, so both
stay reachable no matter how many debtors are listed. The negative offsets sit
the sticky bands over the new 4px gutter from Bug 1's fix, so rows scroll
cleanly underneath with no bleed-through.

## Accessibility

Added `role="dialog"`, `aria-modal="true"` and `aria-labelledby` (wired to the
title via `useId`) to the modal content box. Screen readers previously announced
modals as an unlabelled generic container.

## What was deliberately *not* changed

- **No focus trap was added.** Tab still reaches the page behind an open modal.
  That's a real gap, but a correct trap (sentinels, restore-focus-on-close,
  interaction with `autoFocus`) is a bigger change than this report warranted
  and would touch all 23 popups' focus behaviour at once.
- **Backdrop click still closes the modal**, including mid-edit on a form with
  unsaved changes. Existing behaviour, consistent across the app, not raised.
- **The in-page `max-h-[..vh]` scrollers in `ReportsPage`, `CashBankPage` and
  `InventoryPage` are untouched.** Checked all three — none is inside a
  `<Modal>`, so none has the nesting problem; they are ordinary page panels
  where a bounded height is the intended behaviour.
- **`GlobalSearchModal` and the `AppShell` bottom sheet keep their own
  overlays.** Neither uses the shared `Modal` component, and neither was part
  of the report.
