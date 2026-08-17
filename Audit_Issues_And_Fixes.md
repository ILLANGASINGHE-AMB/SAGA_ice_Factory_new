# Saga Ice — System Audit: Calculation & Logic Issues

**Date:** 2026-08-17
**Scope:** Sales, Customers, Debts, Inventory, Production, Maintenance, Cash & Bank, Expense Ledger, Daily Manager Report, Dashboard, Reports/PDF exports.
**Method:** Full read-through of every hook in `src/hooks/`, the corresponding pages in `src/pages/`, `src/components/DailyManagerReportView.jsx`, `src/utils/pdfGenerator.js`, and `supabase_schema.sql`, checked against the app's own written spec (`System_Functions.md`) and its DB constraints/RPCs. Every finding below was verified by re-reading the exact source lines (one — the weekly report date bug — was also confirmed with a live date calculation).

This document originally listed 43 issues found across the codebase, none fixed. As of **2026-08-17, every single issue in this document has been fixed in code** — every 🔴 Critical, 🟠 High, 🟡 Medium, and ⚪ Low item below carries a "Status: Fixed" note explaining exactly what changed.

> ⚠️ **One remaining action for you:** code fixes alone don't update your live Supabase database. Several fixes depend on new/updated Postgres functions and columns. **See the "⚠️ Deployment step required" callouts throughout this document** (sections 1, 2, 3, 4) for the exact SQL to run — or ask for the single consolidated script covering all of them. Everything else (the majority of fixes) is pure frontend code and is already live as soon as this build is deployed.

---

## How to read this

- 🔴 **Critical** — produces wrong money, wrong stock, or loses data. Fixed first.
- 🟠 **High** — a feature is broken or a number shown to management is wrong. Fixed second.
- 🟡 **Medium** — real bug, but narrower/edge-case trigger. Fixed third.
- ⚪ **Low** — cosmetic or very unlikely to bite. Fixed last.

18 of the original findings were 🔴/🟠. Most shared one root cause: **writes that should be one atomic database transaction were instead "read in JS → check in JS → write in JS,"** so two people (or one person double-clicking) could corrupt money/stock, and **failed database writes were swallowed and reported to the user as success**, which quietly lost records. Fixing those two patterns first (see the original [Priority Order](#suggested-priority-order) at the end) resolved roughly half the list at the root before the rest were addressed individually.

---

## 1. Sales, Customers & Debts

### 1.1 🔴 Debt settlement can lose a payment under concurrency — ✅ FIXED 2026-08-17
**File:** `src/hooks/useDebts.js:57-87` (`settleDebt`)

Settling a debt does a plain `SELECT` (no row lock), checks the payment against `remaining_amount` in JavaScript, then `UPDATE`s the debt with absolute values computed client-side. There's no transaction/RPC wrapping this the way `place_order_transaction` wraps a sale.

**Scenario:** A debt has LKR 5,000 remaining. Two operators (or one impatient double-click) each submit a LKR 2,000 payment within the same second. Both reads see `remaining_amount = 5000`; both compute `newRemaining = 3000`; the second write overwrites the first. A LKR 2,000 payment shows up in the `debt_settlements` history table but is never reflected in the customer's actual balance — the ledger is short by LKR 2,000 with no error shown.

**Fix:** Add a `settle_debt_transaction` Postgres RPC (mirroring the existing `place_order_transaction`) that locks the debt row (`SELECT ... FOR UPDATE`), recomputes `paid_amount`/`remaining_amount`/`status`, and inserts the `debt_settlements` row in one transaction.

**Status:** Fixed. Added `public.settle_debt_transaction(p_debt_id, p_amount_paid, p_created_by)` in `supabase_schema.sql` — locks the debt row with `for update`, validates the payment, updates the debt and inserts the `debt_settlements` row in one transaction. `src/hooks/useDebts.js`'s `settleDebt` now calls this RPC instead of doing the read/validate/write in JS; PDF receipt generation/upload still happens client-side afterward (best-effort, as before). **Requires the SQL to be deployed — see the note at the end of this section.**

### 1.2 🔴 A failed settlement receipt can cause a payment to be applied twice — ✅ FIXED 2026-08-17
**File:** `src/hooks/useDebts.js:78-179`

The debt's `paid_amount`/`remaining_amount` are updated (line 78-87) *before* the `debt_settlements` audit row is inserted (line 166-179). If that later insert fails for any reason, `settleDebt` throws — but the debt was already permanently updated. The UI shows "Failed to settle debt," so the operator naturally retries with the same amount, applying the payment twice.

**Fix:** Same RPC as 1.1 — update and insert must succeed or fail together.

**Status:** Fixed by the same `settle_debt_transaction` RPC as 1.1 — the debt update and the `debt_settlements` insert now happen in a single Postgres transaction, so they can no longer succeed/fail independently.

### 1.3 🔴 A non-admin (or anyone hitting the API directly) can place a sale at any price — ✅ FIXED 2026-08-17
**Files:** `src/hooks/useSales.js:60-62`, `supabase_schema.sql:295-376` (`place_order_transaction`), `src/pages/SalesPage.jsx:627`

The spec says only admins may edit price-per-cube. The *only* enforcement is `disabled={!isAdmin}` on the price input — a UI attribute, not a security control. Neither the JS hook nor the `place_order_transaction` database function checks the submitted price against the authoritative `inventory.price_per_cube`; the function only checks that the price is `> 0`.

**Scenario:** A non-admin (or anyone calling the RPC directly) submits an order for 1,000 MFC cubes at `price_per_cube = 0.01` instead of the real LKR 12.00. The database accepts it — a real invoice for LKR 10 instead of LKR 12,000.

**Fix:** Have `place_order_transaction` look up `inventory.price_per_cube` itself and use that (or explicitly re-validate the submitted price against it, allowing override only when the caller is verified admin).

**Status:** Fixed. `place_order_transaction` now reads `price_per_cube` from the locked inventory row and always uses that unless the caller is a verified admin (checked server-side via `is_admin()`) *and* supplied a positive override price — matching the "price editable by admin only" rule at the database layer instead of only in the UI. `src/hooks/useSales.js` now also reflects whichever price the server actually charged back into the generated bill, so the PDF can never show a stale/wrong price. **Requires the SQL to be deployed — see the note at the end of this section.**

### 1.4 🔴 Deleting a customer silently erases their unpaid debts and payment history — ✅ FIXED 2026-08-17
**Files:** `src/hooks/useCustomers.js:128-134`, schema `supabase_schema.sql:52-53,64` (`debts.customer_id` and `debt_settlements.debt_id` are both `ON DELETE CASCADE`)

`deleteCustomer` does a bare delete with no check for outstanding debts. Because of the cascade, deleting a customer who owes money **permanently destroys the debt record and every settlement/receipt tied to it** — real money owed simply disappears from the system. The confirmation dialog doesn't mention this; it only says the customer record will be removed.

**Fix:** Block (or require a second, explicit confirmation naming the amount) deleting a customer with any non-settled debt. Longer-term, consider `ON DELETE RESTRICT` on `debts.customer_id` plus a soft-delete flag on customers instead of a hard delete.

**Status:** Fixed. `deleteCustomer` in `src/hooks/useCustomers.js` now queries for any debt on that customer with `status != 'settled'` before deleting; if any exist, it throws a clear error naming the count and total LKR owed and blocks the deletion instead of proceeding. Customers with only fully-settled debt history can still be deleted (unchanged). No DB migration needed for this one — it's a pure JS-side guard, live immediately.

### 1.5 🔴 The JS fallback path for placing a sale can double-sell stock — ✅ FIXED 2026-08-17
**File:** `src/hooks/useSales.js:88-116`

When the `place_order_transaction`/`deduct_inventory_stock_by_type` RPCs error, the code falls back to a plain read-then-write: select current quantity, check `quantity - qty < 0` in JS, then write the new quantity. No row lock, and `inventory.quantity` has no DB-level `>= 0` constraint.

**Scenario:** Only 10 MFC cubes remain. Two concurrent sales both read `quantity = 10`, both pass the JS check, both write `quantity = 10 - qty`. The second write clobbers the first — inventory ends up wrong (or negative) and both sales are recorded as if stock was available.

**Fix:** Don't silently fall back to an unsynchronized read-modify-write. If both RPCs are unavailable, block the sale with a clear error rather than degrading to a racy path; or add `WHERE quantity >= :qty` to the fallback update and check the affected row count.

**Status:** Fixed. Removed the unlocked read-then-write fallback entirely. If the atomic `place_order_transaction` RPC is unavailable and the row-locked `deduct_inventory_stock_by_type` RPC also errors, `placeOrder` now throws immediately ("Unable to process order: inventory update failed... Please try again.") instead of degrading to a racy path. This is a live-code change with no SQL deployment required, though it depends on the two RPCs already present in your Supabase project (they were already deployed prior to this audit).

#### ⚠️ Deployment step required for 1.1–1.3
1.1, 1.2, and 1.3 depend on changes to two Postgres functions in `supabase_schema.sql`: the updated `place_order_transaction` and the new `settle_debt_transaction`. **Code changes alone do not update your live Supabase database.** To activate these fixes:
1. Open `supabase_schema.sql` in this repo and locate the `place_order_transaction` and `settle_debt_transaction` function definitions (search for `-- Atomic Transactional Order Placement Function` and `-- Atomic Debt Settlement Transaction`).
2. Copy just those two `create or replace function ... $$ language plpgsql security definer;` blocks.
3. Paste and run them in your Supabase project's SQL Editor (Supabase Dashboard → SQL Editor → New Query). `create or replace function` is safe to re-run and won't affect existing data.
4. Until this is run, `placeOrder`/`settleDebt` will keep working via their existing (older) RPCs — 1.1/1.2/1.3 simply won't be fixed yet in production.

### 1.6 🟠 A debt can be created with no matching debt record (fallback path) — ✅ FIXED 2026-08-17
**File:** `src/hooks/useSales.js:133-169`

Same fallback branch as 1.5: the `sales` row is inserted first; only afterward is the `debts` row inserted if `payment_type = 'debt'`. If the debt insert fails, the sale (already marked as a debt sale, with stock already deducted) permanently exists with no corresponding entry on the Debts page — the customer owes money that's invisible to the system.

**Fix:** Wrap sale + debt creation in one transaction, same as the working `place_order_transaction` RPC already does correctly.

**Status:** Fixed with a rollback instead of a full rewrite into a transaction (this fallback path only runs when the primary atomic RPC is unavailable, so it stays intentionally simple). If the debt insert fails, `placeOrder` now deletes the sale it just created and restores the deducted stock via the `add_inventory_stock_by_type` RPC (added for 2.1), then throws — so the order either fully completes or fully un-happens, never leaving an orphaned debt-sale. Pure JS change.

### 1.7 🟠 Sales search crashes the page for any customer that's been deleted — ✅ FIXED 2026-08-17
**File:** `src/pages/SalesPage.jsx:287`

```js
s.customer.name.toLowerCase().includes(query)   // no optional chaining
```
Because `sales.customer_id` is `ON DELETE SET NULL`, any sale belonging to a deleted customer has `customer: null`. The row renderer elsewhere correctly uses `sale.customer?.name`, but the search filter doesn't — typing anything in the Sales search box throws and breaks the page as soon as one orphaned sale exists.

**Fix:** `s.customer?.name`.

**Status:** Fixed exactly as suggested — `(s.customer?.name || '').toLowerCase().includes(query)`.

### 1.8 🟡 Fallback code generators (`sale_code`, `customer_code`, settlement code) can collide after deletions — ✅ FIXED 2026-08-17
**Files:** `src/hooks/useSales.js:118-131`, `src/hooks/useCustomers.js:61-76`, `src/hooks/useDebts.js:89-106`

When the atomic `get_next_code` RPC is unavailable, the fallback computes the next code as `count(*) + 1`. That's not a true "highest code issued" — if any record was ever deleted, the count under-represents it, and the fallback can regenerate a code that already exists (codes are `unique`), failing the insert with a raw database error instead of a clean message.

**Fix:** Base the fallback on `MAX(id)` or a stored counter, or simply refuse the operation with "code generator unavailable" rather than guessing.

**Status:** Fixed using the "refuse cleanly" option in `useSales.js` and `useCustomers.js` — both now throw a clear "Unable to generate a ... code. Please try again." instead of falling back to `count(*)`. `useDebts.js` needed no separate change: the 1.1/1.2 fix already moved settlement-code generation entirely server-side (inside the `settle_debt_transaction` RPC), so the JS `count(*)` fallback for settlement codes no longer exists at all. Pure JS change.

### 1.9 🟡 Debt settlement's WhatsApp send can crash after a successful settlement — ✅ FIXED 2026-08-17
**File:** `src/pages/DebtsPage.jsx:105`

`phone.substring(1)` is called without checking `phone` is defined first (unlike the equivalent, guarded code in `SalesPage.jsx`). If the customer record has no `whatsapp_number` (or the fetch failed), this throws right after the settlement succeeded — user sees a crash immediately after a completed payment.

**Fix:** Guard with `if (!phone) { toast.error(...); return; }` before building the `wa.me` URL, matching the pattern in `SalesPage.jsx`.

**Status:** Fixed exactly as suggested — `handleSendWhatsAppReceipt` now shows a toast and closes the dialog instead of crashing when the customer has no phone number.

### 1.10 ⚪ Quantity validation doesn't actually require a whole number — ✅ FIXED 2026-08-17
**File:** `src/hooks/useSales.js:59`

The error message says "Quantity must be a positive integer," but the check only rejects `<= 0` — a fractional quantity like `2.5` would pass. Not reachable via the current UI (which always `parseInt()`s first), but it's a gap in the hook's own contract if anything else calls it.

**Fix:** Add `!Number.isInteger(quantity)` to the check.

**Status:** Fixed exactly as suggested.

### 1.11 ⚪ WhatsApp link-building assumes every number starts with "0" — ✅ FIXED 2026-08-17
**Files:** `src/hooks/useCustomers.js:46`, `src/pages/SalesPage.jsx:227-228`, `src/pages/DebtsPage.jsx:105`

The stored format is "any 10 digits," but the WhatsApp link builders always strip the first digit and prepend `94`, assuming it's a leading local `0`. A validly-stored number without a leading 0 produces a broken WhatsApp link.

**Fix:** Tighten the validation regex to `/^0\d{9}$/` to match what the international-prefix logic actually assumes.

**Status:** Fixed exactly as suggested, in all four places that validate the format: `useCustomers.js` (`addCustomer` and `updateCustomer`), the customer form's zod schema in `CustomersPage.jsx`, and the mini create-customer form in `SalesPage.jsx`. Error messages updated to say "must start with 0" so the new requirement is clear to the person typing it. No SQL needed — this doesn't touch stored data, only new/edited entries going forward.

---

## 2. Inventory & Production

> **Update 2026-08-17:** All of 2.1 through 2.8 are now fixed. 2.6 additionally needs the `update_inventory_price` RPC re-run (SQL below 2.6).

### 2.1 🔴 Logging a production batch can silently lose stock under concurrency — ✅ FIXED 2026-08-17
**File:** `src/hooks/useProductionBatches.js:137-154`

Unlike `useInventory`'s add/remove functions (which call row-locked RPCs), adding a batch's cubes to inventory is a plain "read quantity → write quantity+batch" with no lock.

**Scenario:** Two shifts log a finished freeze cycle within the same second. Both read MFC stock as 2,450; both compute their own `2450 + qty`; whichever write lands second wins — one batch's cubes are recorded in production history but never actually added to sellable stock.

**Fix:** Add an atomic `add_inventory_stock_by_type` RPC (row-locked, mirroring the existing `deduct_inventory_stock_by_type`) and use it here.

**Status:** Fixed. Added `public.add_inventory_stock_by_type(p_cube_type, p_amount, p_reference_code, p_created_by)` to `supabase_schema.sql` — row-locked (`for update`) mirror of `deduct_inventory_stock_by_type`, and it now also logs an `inventory_transactions` audit row (`transaction_type: 'add'`, `reference_code` = the batch code), which production batch stock additions previously never did. `useProductionBatches.js`'s `addBatch` now calls this RPC instead of the racy select-then-update. **Requires the SQL to be deployed** — same deployment step as noted under 1.1–1.3 above; if you've already run the two functions from that step, run this one the same way.

### 2.2 🔴 Production batches, new equipment, and expenses can appear "saved" when they weren't — ✅ FIXED 2026-08-17
**Files:** `src/hooks/useProductionBatches.js:114-130`, `src/hooks/useMaintenance.js:168-182`, `src/hooks/useExpenses.js:91-135`

All three follow the same pattern: insert into Supabase, and if it fails (unique-constraint violation, RLS denial, network blip — Supabase returns an `error` object rather than throwing), **the code doesn't check `error`.** Instead it fabricates a local-only record (`{ ...data, id: Date.now() }`), pushes it into local state/localStorage, and the page shows a success toast. Nothing was actually saved to the database. The fake record only exists in that one browser and vanishes on the next realtime refetch (see 2.3's sibling bug in Expenses, 3.6).

**Fix:** In each case, check `error` and throw/surface a failure toast instead of manufacturing a fake success record.

**Status:** Fixed in all three files — each insert now checks `error` and throws instead of fabricating a `{ ...data, id: Date.now() }` fallback record. All three call sites (`ProductionPage.jsx`, `ExpenseLedgerPage.jsx`) already wrap these calls in try/catch with `toast.error`, so a genuine failure now correctly shows an error toast instead of a false "saved" success. Pure JS changes — no SQL deployment needed for this one. (Note: `useMaintenance.js`'s equipment *update* paths — `updateEquipmentStatus` and the edit branch of `logMaintenanceEvent` — still have the same class of problem; that's tracked separately as 2.4, not part of this fix.)

### 2.3 🟡 Weak random code generation makes the above collision more likely than it should be — ✅ FIXED 2026-08-17
**Files:** `src/hooks/useProductionBatches.js:94-96` (`batch_code`), `src/hooks/useExpenses.js:91-96` (`expense_code`)

Both generate a suffix from `Math.floor(100 + Math.random()*900)` — only 900 possible values — for fields with a `unique` DB constraint. With no retry logic, collisions become realistic well before 900 records exist (birthday-paradox: real risk after only a few dozen), and each collision triggers the silent-failure bug above (2.2).

**Fix:** Use the app's existing `get_next_code`/`code_counters` mechanism (already used for `sale_code`) instead of random suffixes.

**Status:** `expense_code` was already fixed as part of 3.6. `batch_code` is now fixed the same way — `useProductionBatches.js` calls `get_next_code('batch', 'BATCH')` and throws cleanly if the RPC fails, instead of guessing with `Math.random()`. Pure JS/RPC change — `get_next_code` is already deployed.

### 2.4 🟠 Equipment status/notes updates can diverge from what's actually in the database — ✅ FIXED 2026-08-17
**File:** `src/hooks/useMaintenance.js:91-116, 131-153`

Supabase update calls here don't check the returned `error`; only network-layer exceptions are caught. On any server-side rejection, the code still applies the change to local state and shows success — the card updates instantly, but the database (and every other user's screen) still has the old value, until a refetch quietly reverts it with no explanation.

**Fix:** Check `error` from every `update()` call; skip the optimistic local-state update and surface a toast when it's present.

**Status:** Fixed in both `updateEquipmentStatus` and the edit branch of `logMaintenanceEvent` — both now check the returned `error` and throw instead of applying the optimistic local update on failure. The "Clear Alert" button in `ProductionPage.jsx` (the only caller of `updateEquipmentStatus` that wasn't already wrapped in try/catch) now catches the error and shows a toast. Pure JS change.

### 2.5 🟡 Editing a maintenance log always stamps "last serviced: today," even when no service happened — ✅ FIXED 2026-08-17
**File:** `src/hooks/useMaintenance.js:131-140`

`updateEquipmentStatus` correctly only stamps `last_service_date` when the new status is `operational`. The edit path in `logMaintenanceEvent` has no such condition — it stamps "now" unconditionally.

**Scenario:** An admin edits a log to mark equipment **offline** after a breakdown (not serviced). The record now shows "Last Service: today" for equipment that just broke, corrupting the maintenance schedule.

**Fix:** Only set `last_service_date: now` when `status === 'operational'`, matching the logic already used in `updateEquipmentStatus`.

**Status:** Fixed exactly as suggested — the edit branch now looks up the existing record and only stamps "now" when the new status is `operational`; otherwise it preserves the equipment's real last-serviced date.

### 2.6 🟡 Price-per-cube can be set to exactly 0, not just "positive" — ✅ FIXED 2026-08-17
**Files:** `src/hooks/useInventory.js:191-193`, `src/pages/InventoryPage.jsx:92-96`, `supabase_schema.sql:386-388`

All three layers check `price < 0` where the spec requires "positive decimal." An admin can set a cube type's price to `0`, making it effectively free with no rejection anywhere.

**Fix:** Change all three checks to `price <= 0`.

**Status:** Fixed in all three layers exactly as suggested — `useInventory.js`, `InventoryPage.jsx`, and the `update_inventory_price` RPC all now reject `price <= 0`. The RPC change **requires the SQL deployment step** (below).

### 2.7 🟡 The "RPC unavailable" fallback in add/remove stock reintroduces the exact race it exists to prevent — ✅ FIXED 2026-08-17
**File:** `src/hooks/useInventory.js:81-127, 140-187`

The fallback triggers on *any* RPC error, not just "function doesn't exist," and then does an unlocked read → JS check → write — the same TOCTOU race described in 1.5/2.1, this time for manual stock add/remove. Only reachable when the RPC path is degraded, but a genuine negative-stock path when it happens.

**Fix:** Only fall back on an error code indicating the function is genuinely missing (Postgres `42883`); otherwise propagate the RPC's own (correct, atomic) error to the caller.

**Status:** Fixed exactly as suggested — both `addStock` and `removeStock` now check `rpcErr.code === '42883'` before falling back to the unlocked path; any other RPC error (insufficient stock, RLS denial, etc.) is thrown directly instead. Pure JS change.

#### ⚠️ Deployment step required for 2.6
`update_inventory_price` needs to be re-run in your Supabase SQL Editor to enforce `price > 0` server-side:
```sql
create or replace function public.update_inventory_price(p_id bigint, p_price numeric)
returns void as $$
begin
  if not public.is_admin() then
    raise exception 'Only administrators can update inventory prices';
  end if;

  if p_price <= 0 then
    raise exception 'Price must be a positive value';
  end if;

  update public.inventory
  set price_per_cube = p_price,
      updated_at = timezone('utc'::text, now())
  where id = p_id;
end;
$$ language plpgsql security definer;
```

### 2.8 ⚪ Remove-stock dialog validates against a stale snapshot — ✅ FIXED 2026-08-17
**File:** `src/pages/InventoryPage.jsx:66-76`

The modal's "can't remove more than X" check uses the stock quantity captured when the modal opened, not live data. Not a data-integrity risk (the server-side RPC re-validates under lock), just a confusing "it let me try, then the server said no" UX.

**Fix:** Low priority — optionally re-derive from live inventory right before submit.

**Status:** Fixed — `handleRemoveStock` now looks up the item's current quantity from the live `inventory` array right before validating, instead of the snapshot captured when the modal opened.

---

## 3. Cash & Bank / Expense Ledger

This area has already had ~10 targeted bugfix commits in recent history (`89ef831`, `4447293`, `82d14d4`, etc.) — those fixes are correct as far as they go, but didn't address the deeper issues below.

> **Update 2026-08-17:** All of 3.1 through 3.8 are now fixed — see status notes inline. 3.1/3.2/3.3/3.5 need two new columns (SQL below 3.5). 3.4, 3.6, 3.7, 3.8 are pure JS, no deployment needed.

### 3.1 🔴 A mistyped bank deposit can create money out of nowhere — ✅ FIXED 2026-08-17
**File:** `src/pages/CashBankPage.jsx:140-167` (`handleBankDepositSubmit`)

```js
const newBankBalance = (Number(bankDepositAmount) || 0) + amount;       // full amount added
const newCashBalance = Math.max(0, (Number(cashOnHand) || 0) - amount); // silently clamped, never rejected
```
There's no check that the deposit amount doesn't exceed cash on hand.

**Scenario:** Cash on hand is LKR 10,000. Manager mistypes a deposit as LKR 50,000 (meant 5,000). Bank balance rises by the full 50,000; cash is just clamped to 0 instead of being rejected. Total system funds (cash + bank) just grew by 40,000 that never existed.

**Fix:** Reject (or require explicit confirmation for) a deposit greater than current cash on hand.

**Status:** Fixed. `handleBankDepositSubmit` in `src/pages/CashBankPage.jsx` now rejects a deposit greater than the current cash balance with a clear error instead of accepting the full amount into the bank while clamping cash to 0. Pure JS change, no SQL needed.

### 3.2 🔴 Depositing a cheque wrongly reduces today's calculated cash balance — ✅ FIXED 2026-08-17
**File:** `src/pages/CashBankPage.jsx:63-76` (`defaultCalculatedCash`), `208-228` (`handleDepositCheque`)

The default cash-on-hand formula subtracts `bankDepositAmount` from today's cash inflow — but `handleDepositCheque` adds cheque deposits into that *same* field, even though a cheque was never physical cash in the first place.

**Scenario:** Cash sales today: LKR 50,000, no cash manually banked yet. Manager deposits a LKR 30,000 **cheque** via the Cheque Register. The Cash Balance card now shows `50,000 - 30,000 = 20,000` instead of the correct LKR 50,000 — purely because a cheque (not cash) was banked.

**Fix:** Track cash-sourced bank deposits separately from cheque-sourced deposits, and only subtract the cash-sourced portion from the cash-on-hand formula.

**Status:** Fixed. Added a new day-scoped field `cashDepositedToday` (DB column `cash_deposited_today`, resets to 0 each new date) that's incremented only by `handleBankDepositSubmit` (actual cash deposits), never by `handleDepositCheque`. The `defaultCalculatedCash` formula now subtracts `cashDepositedToday` instead of `bankDepositAmount` — so depositing a cheque still correctly grows the running bank balance but no longer touches the calculated cash figure. Note: `bankDepositAmount` itself is deliberately kept as the one true cumulative bank total (see 3.5 below); `cashDepositedToday` is a separate, purely same-day tracker used only for this calculation.

### 3.3 🟠 A legitimate zero cash balance gets silently overwritten — ✅ FIXED 2026-08-17
**File:** `src/pages/CashBankPage.jsx:74-76`

```js
const activeCash = (manualInputs.cashOnHand !== undefined && manualInputs.cashOnHand !== 0)
  ? Number(manualInputs.cashOnHand) : defaultCalculatedCash;
```
`0` is treated as "not yet entered," not as "the till is genuinely empty."

**Scenario:** Manager deposits all cash to the bank, correctly saving `cashOnHand: 0`. On the next recompute (date reselect, another save), the page discards the real `0` and substitutes the (already-buggy, see 3.2) auto-calculated value instead — showing cash on hand when the till is empty.

**Fix:** Use `null`/`undefined` as the "unset" sentinel instead of overloading `0`, or track a separate `hasManualCashEntry` flag.

**Status:** Fixed using the second approach (the null-sentinel route turned out to be leaky — see below). Added a new `cashOnHandConfirmed` boolean (DB column `cash_on_hand_confirmed`), set to `true` only by the three actions that represent a real confirmed cash figure: saving the physical cash count, a bank deposit, and a cash withdrawal. `activeCash` now checks this flag instead of `!== 0`, so a confirmed zero is trusted as-is. The flag also carries through the 3.5 day-to-day carry-forward (a prior day's balance is only carried forward as "confirmed" if it was itself confirmed, not just an unconfirmed guess). **Why not the null-sentinel option:** every `saveDailyReport` call writes the *entire* manual-inputs payload (not just the changed fields), and the numeric coercion (`Number(payload.cashOnHand) || 0`) needed for the DB column would silently collapse `null` back to `0` on the very next unrelated save (e.g. adding a cheque), permanently losing the "unset" signal. A separate boolean flag has no such leak. **Requires the SQL deployment step below.**

### 3.4 🟠 "Amount Deposited Today" undercounts cheque deposits and bank withdrawals — ✅ FIXED 2026-08-17
**File:** `src/pages/CashBankPage.jsx:208-228, 244-286`

`handleBankDepositSubmit` correctly updates both the running bank balance and the "deposited today" figure together. `handleDepositCheque` only updates the running balance — never "today." Bank withdrawals also never touch "today." This value is what's printed as "Amount Deposite Today (LKR)" in Section 06 of the Daily Manager Report (added in commit `82d14d4`).

**Scenario:** Only a cheque is deposited today (no cash-form deposit). Bank balance rises correctly, but the printed report still shows LKR 0.00 deposited today.

**Fix:** Update the "today" figure in `handleDepositCheque` as well, or better, derive "today's deposits" from an actual transaction log instead of a manually-incremented running field.

**Status:** Fixed the cheque-deposit half using the first (minimal) approach — `handleDepositCheque` now also increments `bankDepositToday`, matching `handleBankDepositSubmit`. Bank withdrawals were left as-is deliberately: "Amount Deposited Today" is a gross-deposits figure, and withdrawals are already tracked and reported separately (Section 04 / `reportData.cashDetails.bankWithdrawals`), so netting them into this field would change its meaning rather than fix a bug. Pure JS change, no SQL needed.

### 3.5 🔴 Bank balance and cash-on-hand silently reset to zero every new day (no carry-forward) — ✅ FIXED 2026-08-17
**Files:** `src/pages/CashBankPage.jsx:80-81, 148-166`; `src/hooks/useDailyReport.js:90-129`; `daily_manager_reports` is keyed uniquely per `report_date`

The Cash & Bank page and Daily Manager Report Section 06 present these as running balances ("Funds in Bank Account," "Physical Cash in Till"), but they're stored per-day with no logic anywhere that carries yesterday's closing balance into today's opening balance.

**Scenario:** Bank balance is LKR 250,000 at the end of Aug 16. On Aug 17, a new report row is created with no prior data, and `bankDepositAmount` defaults to 0. "Funds in Bank Account" now reads LKR 0 — even though the real account still holds 250,000+. Same for physical cash.

**Fix:** Either carry forward the previous day's closing figures as the new day's opening balance, or clearly relabel these fields as "today's activity only" so they're not read as true account balances.

**Status:** Fixed by carrying forward. `useDailyReport.js` now also fetches the most recent *prior* day's saved report (`report_date < today`, latest first) alongside today's own data. When today has no saved report yet (a brand-new day, and no local cache either), `cashOnHand`, `bankDepositAmount`, and `chequesOnHand` are seeded from that prior day's closing values instead of hardcoded 0 — while genuinely day-scoped fields (`bankDepositToday`, `cashDepositedToday`, `chequeEntries`, `withdrawals`) still correctly start fresh each day. If today already has its own saved report (even with legitimately-zero balances), that data is used as-is and carry-forward is skipped, so a manager who's already confirmed today's real figures is never overridden.

**⚠️ Extra deployment step for 3.1/3.2/3.3/3.5:** these depend on two new columns. Run this in your Supabase SQL Editor along with the earlier statements:
```sql
ALTER TABLE public.daily_manager_reports ADD COLUMN IF NOT EXISTS cash_deposited_today NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE public.daily_manager_reports ADD COLUMN IF NOT EXISTS cash_on_hand_confirmed BOOLEAN DEFAULT false;
```
Both are simple additive columns — safe to run any time, no data loss. 3.1's deposit cap and 3.5's carry-forward logic work immediately without them (they don't touch these columns), but 3.2's cash/cheque split needs `cash_deposited_today`, and 3.3's confirmed-zero fix needs `cash_on_hand_confirmed`.

### 3.6 🔴 A failed expense insert is reported as saved, then quietly vanishes — ✅ FIXED 2026-08-17
**File:** `src/hooks/useExpenses.js:91-146`

Same silent-failure pattern as 2.2/2.3 — `expense_code` uses the same weak 900-value random generator, and a failed insert (e.g. a code collision) is never checked; the code fabricates a local-only expense and shows success. Worse here: `fetchExpenses` is wired to Supabase realtime and unconditionally overwrites local `expenses` state whenever *anyone* touches the table — so the very next realtime event silently wipes the fake local expense from the screen too, with no trace it ever "failed."

**Fix:** Check `error` and surface a failure toast; generate `expense_code` from the existing `code_counters` sequence instead of a random range.

**Status:** Fixed (the "check error" half was already fixed as part of 2.2). Now also replaced the weak `Math.floor(100 + Math.random()*900)` suffix with the same atomic `get_next_code('expense', 'EXP')` RPC already used for sale/customer/settlement codes — no more collision risk, and no unsafe local-count fallback (consistent with the "no racy fallback" fix applied elsewhere). Note this changes the expense code *format* going forward from `EXP-<3digits>-26` to `EXP-<sequence>-DDMMYY`, matching the format already used by sale/settlement codes; existing expense codes are untouched. Pure JS/RPC change — `get_next_code` is already deployed (used by other features), so no new SQL is needed for this one.

### 3.7 🟠 Deleting the last expense makes it come back — ✅ FIXED 2026-08-17
**File:** `src/hooks/useExpenses.js:55-76` (`fetchExpenses`)

```js
if (error || !data || data.length === 0) {
  // falls back to stale localStorage cache
}
```
A genuinely empty result (e.g. right after deleting the only remaining expense) is treated the same as a fetch *error*. Because the success branch — the only place that would ever save "now empty" to localStorage — never runs, the stale pre-deletion cache is used forever, and the "deleted" expense reappears in the UI even though the database correctly has zero rows.

**Fix:** Only fall back to localStorage when `error` is truthy or `data` is `null`/`undefined` — an empty array is valid data.

**Status:** Fixed exactly as suggested — the condition is now `if (error || !data)`, so a legitimately empty array takes the success branch, correctly shows an empty ledger, and updates localStorage to match. Pure JS change. **Note:** the identical `error || !data || data.length === 0` pattern also exists in `useProductionBatches.js` (`fetchBatches`) and `useMaintenance.js` (`fetchEquipment`) — same latent bug, same fix would apply, but it wasn't in the original numbered findings for those files so it's left as-is here; flag if you'd like it fixed too.

### 3.8 🟡 Expense deletion doesn't check whether the delete actually succeeded — ✅ FIXED 2026-08-17
**File:** `src/hooks/useExpenses.js:137-146`

The delete call's `error` is never inspected (only network-level exceptions are caught). If an RLS policy or transient failure blocks the delete server-side, the UI still shows "removed" and drops it from local state — until the next realtime fetch brings it back, contradicting the toast the user just saw.

**Fix:** Check `error`; only update local state after a confirmed server-side delete.

**Status:** Fixed exactly as suggested — `deleteExpense` now checks `error` and throws instead of updating local state on a failed delete. Also fixed the caller in `ExpenseLedgerPage.jsx`'s `handleDelete`, which previously had no try/catch at all around this call (would have become an unhandled rejection with the new throwing behavior) — it now shows a proper error toast.

---

## 4. Daily Manager Report, Dashboard & Reports

> **Update 2026-08-17:** All of 4.1 through 4.10 are now fixed. 4.2 (via 3.5) and 4.7 need SQL deployment steps (see 3.5 and 4.7 below); the rest are pure JS.

### 4.1 🔴 Section 01 "Stock Closing Balance" double-counts today's activity — ✅ FIXED 2026-08-17
**File:** `src/hooks/useDailyReport.js:211-219`

```js
const previousDayBalance = inventory.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
const closingBalance = previousDayBalance + todaysProduction + todaysPurchase + brineCubes - freeIssue - damagedCubes - todaysSalesQty;
```
`inventory.quantity` is a **live** figure, already updated in real time as production/sales/purchases happen. Despite being named `previousDayBalance`, it's actually *today's current* stock — which already includes today's production and sales. The formula then re-adds production/purchases and re-subtracts sales a second time.

**Scenario:** Stock starts the day at 1,000. 200 produced, 150 sold today → live inventory = 1,050. The report computes `1050 + 200 − 150 = 1,100` instead of the correct 1,050. This inflates the reported closing stock by the day's net movement, every single day there's activity.

**Fix:** Either derive `previousDayBalance` by backing today's movements *out* of the live figure (`current − todaysProduction − todaysPurchase + todaysSalesQty`), or stop re-applying movements that are already reflected in the live total.

**Status:** Fixed using the first approach. `previousDayBalance` is now computed as `currentTotalStock - todaysProduction - todaysPurchase - brineCubes + todaysSalesQty` (brine/waste additions also live-update `inventory.quantity`, so they're backed out too, alongside production/purchases/sales). `closingBalance` keeps its original formula unchanged, which now algebraically reduces to `currentTotalStock - freeIssue - damagedCubes` — i.e. today's true closing stock is the live total, minus whatever was manually reported as free-issued or damaged (the only two figures that were never actually reflected in the tracked inventory table to begin with). Verified against the audit's own scenario (1,000 opening, +200 produced, −150 sold → live 1,050): now correctly reports closing balance of 1,050, not 1,100. Pure JS change, no SQL/deployment needed.

### 4.2 🔴 See 3.5 — Bank/Cash balances reset to zero each new report date — ✅ FIXED 2026-08-17 (via 3.5)
Same underlying bug as [3.5](#35--bank-balance-and-cash-on-hand-silently-reset-to-zero-every-new-day-no-carry-forward), also directly visible on Section 06 of the printed Daily Manager Report. Fixed by the same change — see 3.5 above, including its required SQL deployment step.

### 4.3 🟠 See 3.4 — "Amount Deposit Today" misses cheque deposits
Same underlying bug as [3.4](#34--amount-deposited-today-undercounts-cheque-deposits-and-bank-withdrawals) — flagged independently from the report side because it directly affects the field added in commit `82d14d4`.

### 4.4 🟠 The Weekly Report's default "current week" is wrong most of the year — ✅ FIXED 2026-08-17
**File:** `src/pages/ReportsPage.jsx:20-27` vs `95-119` (`getDatesOfWeek`)

Two different week-number algorithms are used: one (non-standard, mixing day-of-year with weekday) picks the *default* selected week, the other (a proper ISO-week algorithm) turns a week number back into actual dates. They disagree for most of the year.

**Verified:** for today, **2026-08-17** (a Monday), the page auto-selects week "2026-W33" — but that week resolves to **Aug 10–16**, which excludes today entirely. Checking every day in 2026 showed roughly **29% of days fall outside their own auto-selected week.**

**Scenario:** A manager opens Reports → Weekly Report and clicks "Compile Preview" without touching the date picker, expecting the current week. They silently get last week's data instead.

**Fix:** Use one consistent, correct ISO-8601 week calculation for both the default-week logic and `getDatesOfWeek`.

**Status:** Fixed. Replaced the non-standard default-week formula with a standard ISO-8601 "nearest Thursday" week-number calculation (`getISOWeekString`), reused as the single source of truth for "what week is today." Verified computationally against `getDatesOfWeek` across all 365 days of 2026 — 0 mismatches (was ~29% before). `getDatesOfWeek` itself was already a correct, standard algorithm and was left unchanged. Pure JS change.

### 4.5 🟠 A debt repayment's "outstanding balance" can be pulled from the wrong debt — ✅ FIXED 2026-08-17
**File:** `src/hooks/useDailyReport.js:250-259`, also `src/utils/pdfGenerator.js:503`

```js
const matchingDebt = debts.find(d => Number(d.customer_id) === Number(setl.customer_id));
```
Settlements have a `debt_id` that identifies exactly which debt they belong to (and this *is* used correctly elsewhere — `useDashboard.js:177`). Section 04 instead matches by `customer_id` alone, picking whichever debt for that customer happens to come first in the array — which could be a different, already-settled debt.

**Scenario:** A customer has an old, settled debt and a newer partial one. If the settled one appears first, a real LKR 15,000 outstanding repayment can be reported and printed as LKR 0.00 outstanding.

**Fix:** `debts.find(d => Number(d.id) === Number(setl.debt_id))`.

**Status:** Fixed exactly as suggested, in `useDailyReport.js`. `pdfGenerator.js:503` needed no separate change — it only renders `reportData.creditCollectionList`, which is computed in `useDailyReport.js`, so the PDF is automatically correct too. Pure JS change.

### 4.6 🟡 Customer Details Report PDF fabricates cash-vs-debt and cube-type splits — ✅ FIXED 2026-08-17
**File:** `src/pages/ReportsPage.jsx:442-466`

```js
cashRevenue: 0,                       // always zero, regardless of real cash sales
debtRevenue: ...sum of debtOwed...,
mfcSold: ...sum of ALL cubes (manufactured + resell)...,   // mislabeled
rscSold: 0,                           // always zero
```
The exported PDF's "Total Manufactured Cubes Sold" is actually all cubes of both types combined, "Total Resell Cubes Sold" always prints 0, and "Cash Inflow" always prints LKR 0.00 even when customers paid cash.

**Fix:** Compute cash vs. credit revenue from each customer's actual sales, and split cube counts by `cube_type` instead of hardcoding.

**Status:** Fixed. `customerListWithDetails` now also computes each customer's `cashPurchased` (sum of their cash-payment sales), `mfcCubes`, and `rscCubes` (split by `cube_type`), and the PDF summary sums these across all customers instead of hardcoding `0`. `debtRevenue`/`mfcSold`-as-"all cubes" semantics were left as originally defined (debtRevenue = outstanding debt owed, not gross credit sales issued — a separate, lower-severity wording nuance not covered by this finding). Pure JS change.

### 4.7 🟡 Manually entering "0" for brine (waste) cubes is silently ignored — ✅ FIXED 2026-08-17
**File:** `src/hooks/useDailyReport.js:215`

```js
const brineCubes = Number(manualInputs.brineCubes) > 0 ? Number(manualInputs.brineCubes) : brineTxnAdditions;
```
If a manager types `0` to explicitly override an incorrect auto-calculated value, the `> 0` check treats it as "not entered" and silently reverts to the auto-calculated figure instead.

**Fix:** Track whether the field was explicitly touched, rather than inferring intent from the value being non-zero.

**Status:** Fixed the same way as 3.3 — added a `brineCubesConfirmed` flag (DB column `brine_cubes_confirmed`) set only when the Daily Manager Report form is actually saved. The formula now checks this flag instead of `> 0`, so an explicitly-saved `0` is trusted. **Requires the SQL deployment step below.**

#### ⚠️ Deployment step required for 4.7
```sql
ALTER TABLE public.daily_manager_reports ADD COLUMN IF NOT EXISTS brine_cubes_confirmed BOOLEAN DEFAULT false;
```

### 4.8 ⚪ Exported PDF shows a financial summary the on-screen preview deliberately hides — ✅ FIXED 2026-08-17
**Files:** `src/pages/ReportsPage.jsx:788` vs `src/utils/pdfGenerator.js:329-335`

The Debtors/Customer Details reports intentionally hide the "Total Invoiced / Cash Collected / Debt Balance" summary strip on screen (because those numbers don't apply cleanly to those report types), but the PDF export prints it unconditionally — including the fabricated numbers from 4.6.

**Fix:** Gate the PDF summary block the same way the on-screen preview is gated.

**Status:** Fixed exactly as suggested. `generateReportPDF` takes a new optional `showFinancialSummary` parameter (default `true`); the Debtors and Customer Details report call sites in `ReportsPage.jsx` now pass `false`, matching the on-screen gate (`activeReport !== 'debtors' && activeReport !== 'customers'`). Weekly/Monthly/Full/Custom reports are unaffected.

### 4.9 ⚪ "Outstanding Credit" on report PDFs is actually gross credit sales, not net outstanding — ✅ FIXED 2026-08-17
**File:** `src/utils/pdfGenerator.js:335`

For weekly/monthly/full-range reports, this figure is the sum of all credit sales issued in the period — it's never netted against settlements collected in that same period, so it overstates true outstanding debt whenever any of the period's credit sales were already paid off within the period.

**Fix:** Rename to "Credit Sales Issued," or compute a true net figure (`debtRevenue − totalSettled`, floored at 0).

**Status:** Fixed using the second option — now computed as `Math.max(0, debtRevenue - totalSettled)`, using the `totalSettled` figure the weekly/monthly/full/custom reports already calculate.

### 4.10 ⚪ Dashboard pie chart can show "LKR 1" instead of "LKR 0" — ✅ FIXED 2026-08-17
**Files:** `src/hooks/useDashboard.js:150`, `src/pages/DashboardPage.jsx:208`

`value: cashTotal || 1` is meant to stop the pie chart from breaking when there's no data at all, but it also fires whenever cash sales are legitimately zero while debt sales aren't — showing "Cash: LKR 1" instead of 0.

**Fix:** Only apply the fallback when both cash and debt totals are zero.

**Status:** Fixed exactly as suggested — the `|| 1` placeholder now only applies when `cashTotal === 0 && debtTotal === 0` (i.e. no sales at all that day). `DashboardPage.jsx` needed no change — it just renders whatever `useDashboard.js` computes.

---

## Suggested priority order

1. **Money-safety first** — 3.1, 3.2, 1.3, 1.4 (phantom money, wrong prices, and debt data loss are the ones most likely to cause a real financial discrepancy this week).
2. **Concurrency/atomicity** — 1.1, 1.2, 1.5, 1.6, 2.1, 2.7 (wrap debt settlement and the inventory fallback paths in proper DB transactions/RPCs, matching the pattern `place_order_transaction` already uses correctly).
3. **Silent-failure pattern** — 2.2, 2.3, 3.6, 3.7, 3.8 (stop swallowing Supabase `error` responses across `useProductionBatches`, `useMaintenance`, `useExpenses` — this one code-review pass fixes five separate bugs).
4. **Daily Manager Report accuracy** — 4.1, 3.5/4.2, 3.4/4.3, 4.5 (these numbers go to management/ownership daily and are currently wrong).
5. **Reports module** — 4.4 (weekly default), 4.6 (Customer Details PDF).
6. **Everything else** — lower severity, fix opportunistically.
