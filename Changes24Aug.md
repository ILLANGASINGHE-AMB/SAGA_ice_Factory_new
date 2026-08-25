# Changes — 24 August 2026

Work done against the issue list in `Issues.md` (Sage Tee Factory System Check 05/24).

**Status:** production build passes, dev server serves, ESLint at 96 problems
(down from the pre-existing 97 — no new lint errors introduced).
**Not verified:** nothing was run against the live Supabase instance, so the
runtime behaviour of the new queries and RPCs is untested.

**42 files changed · 3,467 insertions · 844 deletions**

---

## ⚠️ Before anything works: apply the migrations

Six new migrations are in `supabase/migrations/`. Every database-backed feature
below stays inert until these are run. `supabase_schema.sql` has been updated to
match, so a fresh provision from that file already includes them.

| Migration | What it adds |
|---|---|
| `20260824010000_vehicle_trip_driver.sql` | `vehicle_trips.employee_id` — driver assignment |
| `20260824020000_notification_log.sql` | `notification_log` table + RLS + realtime |
| `20260824030000_one_time_customers.sql` | `customers.is_one_time`, relaxed contact-number constraint |
| `20260824040000_public_bill_access.sql` | `get_public_bill()` RPC granted to `anon` |
| `20260824050000_expense_soft_delete.sql` | Extends `soft_delete_row` to expense categories/items |
| `20260824060000_cheque_customer_and_opening_balances.sql` | `cheque_records.customer_id`, `opening_balances` table |

---

## Cross-cutting: the clock / date bug

**Issue:** *"Sales time filter doesn't work"*, *"Clock accuracy"*,
*"Filter option accuracy in every place"*, *"Check graph filter accuracy [all
over the system]"*.

**Root cause.** Dates throughout the app were derived with
`new Date().toISOString().slice(0, 10)` or by slicing a raw ISO string. Both
give the **UTC** calendar day. Sri Lanka is UTC+5:30, so from **18:30 local
every evening** the app's idea of "today" rolled over to tomorrow. A date filter
defaulted that way pointed at an empty future range all evening, and evening
transactions were bucketed into the wrong day on every chart.

**Fix.** New `src/utils/date.js` with local-calendar helpers
(`todayStr`, `thisMonthStr`, `thisYearStr`, `toLocalDateStr`, `toLocalMonthStr`,
`nowLocalDatetimeStr`, `isWithinLocalRange`). Applied across:

- `pages/SalesPage.jsx` — period filter defaults
- `pages/InventoryPage.jsx` — history date/month defaults and daily/monthly bucketing
- `pages/CashBankPage.jsx` — history period defaults, datetime-local field
- `pages/TransportPage.jsx` — trip range filter and graph buckets
- `pages/VehicleProfilePage.jsx` — trip range filter and graph buckets
- `pages/CustomerProfilePage.jsx` — sales/payments range filter and graph buckets
- `components/DailyManagerReportView.jsx`, `hooks/useDailyReport.js` — report date
- `components/VehicleTripFormModal.jsx` — trip date default
- `hooks/useDashboard.js` — 30-day trend buckets

`DATE` columns (`trip_date`, `entry_date`) are also now parsed at **local**
midnight rather than UTC midnight, which previously rendered them as the
previous day west of UTC.

---

## Dashboard

| Issue | Change |
|---|---|
| *Monthly Cube production: sales should show a total (Production + Retail)* | Production / Retail-Resell / **Total** figures above the chart, plus a `Total` bar in the series |
| *Show production trends & purchase trends* | New **Production & Purchase Trends** chart — cubes *added* to stock over 30 days, Production (MFC made) vs Purchases (RSC bought in), with Produced / Purchased / Total Intake counters. Sale deductions and manual removals are excluded, since this is intake |
| *Sales distribution monthly → need a total* | Pie centre shows the combined figure; legend gained a **Total (Cash + Debt)** line. The `\|\| 1` empty-state placeholder is excluded from the total so it can't leak in |
| *User shouldn't see total revenue (monthly P. & monthly CF → discuss)* | **Confirmed: admin only.** `Monthly Revenue`, `Total Revenue`, `Monthly Cash Flow` and the Monthly Revenue Trend chart are all `isAdmin`-gated. `Total Debts` stays visible to staff — it's a collections worklist, not takings |

`hooks/useDashboard.js` now also fetches `inventory_transactions` and subscribes
to it for realtime updates.

---

## Inventory

| Issue | Change |
|---|---|
| *Filter [cube type] doesn't work → only in graph view* | The Cube Type filter now applies to Graph View as well as the table — it previously narrowed the table but left all three lines drawn, which read as the filter being broken. Only the selected series renders, and the chart header states which type is in view |
| — | Year dropdown derived from the current year instead of hardcoded `2025/2026/2027` |

---

## Customer

| Issue | Change |
|---|---|
| *Payment history is empty* | `useCustomerPayments` resolved settlements **only** by `debt_settlements.customer_id`, which is nullable — any row written without it was invisible. It now resolves settlements *both* by `customer_id` **and** via the customer's own debts (`debt_id`), merges and de-duplicates. It also surfaces query errors instead of silently rendering "No payments found" |
| *Total order amount is displaying in user account that shouldn't be* | Lifetime Total Sales / Total Cash Sales / Total Debt Sales cards, the "Total Order Amount (Cash + Debt Orders)" line and "Total Payments" are now admin-only. **Remaining Debt stays visible** to staff so they can still service the account |
| *Link cheque receives with Customer tab* | New **Cheques** tab on the customer profile — cheque no, bank, name on cheque, date, amount, In Hand / Deposited status, plus an on-hand total |
| *Need a record of sending notifications* | New **Notifications** tab showing every invoice and receipt sent to that customer, with channel and the exact message text |

---

## Debts

| Issue | Change |
|---|---|
| *After debt settlement, first popup window should be to send notification* | Order reversed. The notification prompt now opens **first**; the receipt preview follows. Skipping the notification still reaches the receipt — it no longer costs the operator their receipt |
| *Debt history is not accurate / Showing total amounts, not single transactions* | Debt History rebuilt as a genuine transaction ledger. It previously showed **one row per debt** with that debt's running totals, so a customer who paid three times appeared as a single aggregate line. Now every row is one real event — the credit sale that opened the debt, then each settlement against it — with date/time, transaction type, amount (signed), and **the balance as it stood immediately after that event** (replayed oldest-first, not today's figure) |
| *Debt history needs a status bar* | Status bar above the ledger: **Total Charged / Collected / Outstanding**, transaction and payment counts, and a progress bar with "% of the credit issued in this view has been collected" |
| — | The notification's "remaining" figure now sums **all** the customer's open debts. The per-debt `remaining_amount` on the last settled row describes only that one sale, so it under-reported the balance whenever a FIFO payment spanned several debts |

---

## Employees

| Issue | Change |
|---|---|
| *User shouldn't be able to delete employee data only admin* | Employee delete is admin-only (non-admins see a disabled control with an explanatory tooltip). Attendance-row delete is admin-only too; an operator can still discard a draft row they haven't saved |
| *Can't select employee* | The row action buttons were `opacity-0 group-hover:opacity-100`. **There is no hover on a tablet**, so Edit was permanently invisible and an existing row's employee could never be changed. Buttons are now always visible |
| *Employee attendance → time recording doesn't work sometimes* | Postgres `time` columns return `HH:MM:SS`, but `<input type="time">` only round-trips `HH:MM` — a value it can't parse renders **blank**, and saving that row then wiped the stored time. Times are now normalised on the way in. Also added: end-before-start validation, and an explicit warning when a saved row falls outside the active date filter (it used to just vanish, which read as "the save didn't work") |
| *is it 24h?* | Start Time / End Time column headers now say **(24h)** |

---

## Transport & Vehicles

| Issue | Change |
|---|---|
| *Lock initial km on vehicles* | Initial Odometer is now **locked after registration** — shown read-only with an explanation, and the value is forced back to the stored one on submit so it can't be changed even by tampering. Every trip's distance is measured from it, so editing it would silently rewrite the vehicle's mileage history. Still freely editable when first adding a vehicle |
| *Vehicle tab → new trips can't assign drivers* | `vehicle_trips` gained `employee_id` (nullable, `on delete set null` so removing an employee never destroys trip history). The Add Trip form has a required **Driver** picker, and Trip History gained a Driver column |
| *History & Graphs doesn't work* | Trip date filtering and graph bucketing fixed (see the clock section). Trip list ordering made deterministic. Start Odometer now pre-fills with the vehicle's last known reading |

---

## Sales

| Issue | Change |
|---|---|
| *Time filter doesn't work* | Root cause was the UTC date default — see the clock section. From 18:30 local the Daily filter defaulted to tomorrow and matched nothing |
| *Need to sell ONE [time] for customers* | **One-time (walk-in) sales.** New `customers.is_one_time` flag; the DB's contact-number requirement is relaxed for these rows only. The order wizard's Step 2 now offers three routes: pick a registered account, register a new one, or **One-Time Sale** (name only, no phone). Walk-ins are kept out of the registry search and the Customers list (toggleable, with a count), are badged "One-Time" where shown, get `OTC-` codes, and skip the notification prompt when they've left no number. A warning appears if a one-time customer is given a *credit* order, since there's no way to chase it |
| *Should be able to change price? Is it saved at transactions?* | **Yes** — the rate is stored per line item at the time of sale, so it stays correct even after inventory or customer prices change later. This is now visible: a **Rate** column was added to the Sales table (showing each line's rate for mixed orders). Price editing remains admin-only by design |

---

## Notifications

| Issue | Change |
|---|---|
| *Need a record of sending notifications* | New `notification_log` table storing channel, type, customer, recipient, reference code, amounts, and **the exact message text sent**. New **Notifications** page in the nav — searchable, filterable by type / channel / date, with per-channel counters; expand any row to read the full message |
| *Format for notification, both sales & debt settlement* | Both messages rebuilt in `src/utils/notifications.js` to the agreed shape: **Current amount · Total · Payment type · Sale ID · Remaining**. Each screen previously composed its own ad-hoc sentence, so the two disagreed on both wording and which figures they carried |
| *Does it work with normal phones? How?* | The operator now **picks the channel**. A new `SendNotificationDialog` (used after both a sale and a settlement) shows the recipient and the exact message, then offers **Send via WhatsApp**, **Send as SMS**, or **Skip**. SMS opens the phone's own messaging app pre-filled, so a customer without WhatsApp still gets notified. The message text is identical on both routes — composed once so the WhatsApp text, the SMS text and the logged record can't drift. The dialog warns when a message will be charged as multiple SMS parts |
| *Bill link doesn't work* | **Root cause found.** `PublicBillPage` queried `sales`/`customers`/`settings` directly, but every select policy on those tables is `to authenticated` — an anonymous customer opening the WhatsApp link *always* got "Bill invoice not found". Replaced with a `get_public_bill()` security-definer RPC granted to `anon`, which returns only the single bill requested, enforces the 24-hour window **server-side** (an expired link now returns no bill content at all, rather than being sent the data and merely told not to display it), and exposes only the fields the bill page renders — no address, no notes, nothing about other sales |

`sms:` link note: the body separator is not consistent across platforms. RFC 5724
and Android expect `?body=`, but iOS only fills the body in with `&body=`.
Getting it wrong opens the messaging app with an empty message, so the platform
is sniffed rather than assumed.

---

## Expenses

| Issue | Change |
|---|---|
| *Remove Exp [Category] add a (delete button)* | Delete buttons on both category and expense-name column headers in the Cash Book. Deletion goes through `soft_delete_row` (extended to cover `expense_categories` and `expense_items`), so it snapshots to **Trash** first and is recoverable — including the child expense names and their recorded amounts, which would otherwise be lost to the FK cascade on restore |
| *Does [delete] Exp tab user-friendly?* | The confirmation states exactly what will go: how many expense names, how many recorded amounts, and their total value. Admin-gated |

---

## Cash & Bank

| Issue | Change |
|---|---|
| *Redesign UI → tabs arrangement* | The four ledgers plus history are now **tabs**, with the running balances pinned above so they stay visible whichever ledger is open. Previously all four were stacked down one long page, so reaching the one you needed meant scrolling past three you didn't |
| *Withdrawal section shows Bank balance!!! & it doesn't make sense / What is withdrawals section?* | Card 02 relabelled **Bank Balance** (it always showed deposits *minus* withdrawals, but was labelled "Bank Deposit"). Card 04 relabelled **Total Withdrawn** with the subtitle "Taken out of the bank for expenses". The section itself now explains: money taken out of the bank to pay running costs, which reduces Bank Balance and does *not* add to Cash Balance because it leaves to be spent. The bank dropdown label states that each option shows its own remaining balance |
| *Link cheque receives with Customer tab, also one-time customers* | `cheque_records` gained `customer_id`. The cheque form has a **Link to Customer** picker (registered accounts first, then one-time walk-ins, each labelled) that auto-fills the payer name; the cheque table gained a Customer column. `payer_name` is kept separately because the name on the cheque isn't always the account name. "Not linked" remains available for genuinely anonymous cheques |
| *Initial Collection for Everything → How to do?* | New **Initial Collection** tab and `opening_balances` table. Every balance here is derived purely from recorded transactions, so on go-live day they all started at **zero** regardless of the cash actually in the till, the money in the bank, or the cheques in hand. One opening figure per store of value now feeds into Cash / Bank / Hand Cheques and into the per-bank withdrawal limits. Admin-only, and kept in its own table rather than as a synthetic transaction so an opening balance is never mistaken for trading activity |
| *How does cheque deposits work?* | No logic change — the existing behaviour is correct (a per-cheque Deposit button creates the linked bank deposit and closes the cheque out; the general Section 02 "cheques" method banks unlinked cheques). The UI now labels and explains it |

---

## Reports

| Issue | Change |
|---|---|
| *Why daily report editable?* | A saved report carrying a verifying manager's name is a signed declaration, so it now **locks**. Its manager entries become read-only and the Save button reads "Verified & Locked". An **admin** can "Unlock to Correct" — and that unlock is scoped to the exact date range it was granted for, so moving to another day re-locks automatically. The verifier name defaults to the signed-in user |
| *Daily report should have exact time collection* | The from/to time window already existed and is wired through; the report date default was fixed (it opened on the wrong day after 18:30 local) |
| *Clock accuracy* | Fixed — see the clock section |
| *Scrollable pages (not next → next)* | The `Table` component now **scrolls by default** with a pinned header, instead of paginating. Clicking Next → Next to walk a ledger is slower than scrolling and hides the shape of the data. This also brings the six tables that still paginated (Dashboard, Notes, Employees, Transport history, Recent Actions, Trash) in line with the rest of the app, which had already opted out individually |

---

## Left for your decision

- **Sales #ID format** — currently `S-<n>-DDMMYY`. It's a unique key referenced
  by every bill already issued, so the format was **not** changed without a spec
  from you. Say what you want and it's a small change.
- Everything else on the list has been actioned.

---

## New files

**Utilities & hooks**
- `src/utils/date.js` — local-calendar date helpers
- `src/utils/notifications.js` — message builders, WhatsApp/SMS link builders
- `src/hooks/useNotifications.js` — notification log read/write
- `src/hooks/useCustomerCheques.js` — cheques for one customer

**Components & pages**
- `src/components/SendNotificationDialog.jsx` — WhatsApp / SMS / Skip picker
- `src/pages/NotificationsPage.jsx` — notification history (route `/notifications`)

**Migrations** — the six listed at the top.
