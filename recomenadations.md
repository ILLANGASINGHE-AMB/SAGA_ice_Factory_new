# 🧊 Sagacious Ice Factory — Full System Analysis & Recommendations

> **Audit Date:** August 7, 2026  
> **System:** Saga Ice Factory Management System v0.0.0  
> **Stack:** React 19 + Vite 8 + Supabase + Tailwind CSS v4 + Recharts + jsPDF  
> **Deployment:** Netlify (SPA with client-side routing)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture & Code Quality](#2-architecture--code-quality)
3. [Security Vulnerabilities](#3-security-vulnerabilities)
4. [System Functions — Issues & Improvements](#4-system-functions--issues--improvements)
5. [Database & Schema Recommendations](#5-database--schema-recommendations)
6. [UI/UX Features & Design Improvements](#6-uiux-features--design-improvements)
7. [Performance Optimizations](#7-performance-optimizations)
8. [DevOps & Deployment](#8-devops--deployment)
9. [Feature Recommendations](#9-feature-recommendations)
10. [Priority Action Items](#10-priority-action-items)

---

## 1. Executive Summary

The Saga Ice Factory Management System is a well-structured React SPA with a comprehensive feature set: sales, inventory, debts, production tracking, expense ledger, AI assistant, and PDF generation. The codebase uses modern React patterns (hooks, context, functional components) with Supabase as the backend.

**Overall Grade: B+** — Solid functionality, good UI foundation, but several critical security, architectural, and UX issues need addressing before production use at scale.

### Key Findings

| Area | Status | Priority |
|:---|:---:|:---:|
| **Security** | 🔴 Critical issues | Immediate |
| **Data Integrity** | 🟡 Race conditions exist | High |
| **UI/UX Polish** | 🟡 Good base, needs refinement | Medium |
| **Performance** | 🟡 Dashboard over-fetching | Medium |
| **Code Quality** | 🟢 Clean, but some patterns need fixing | Medium |
| **DevOps** | 🟡 Missing CI/CD, testing | Medium |
| **Feature Completeness** | 🟢 Core features implemented | Low |

---

## 2. Architecture & Code Quality

### 2.1 ✅ What's Working Well

- **Clean folder structure**: `components/`, `pages/`, `hooks/`, `services/`, `context/`, `utils/`, `lib/` — well-organized separation of concerns.
- **Custom hooks pattern**: Each domain (`useInventory`, `useSales`, `useDebts`, etc.) has its own hook — clean and maintainable.
- **Supabase Realtime subscriptions**: All hooks subscribe to `postgres_changes` for live updates — great reactive architecture.
- **Reusable UI components**: `Modal`, `Table`, `Button`, `Badge`, `Toast`, `ConfirmDialog`, `Skeleton` — solid component library.
- **Role-based access control**: `ProtectedRoute` and `AdminRoute` guards are implemented cleanly.
- **PDF generation**: Well-structured with shared header/footer helpers, professional layout.

### 2.2 🔴 Critical Issues

#### Issue 1: Race Conditions in Inventory Operations (Read-Then-Write)

**Files:** `useInventory.js`, `useSales.js`

All inventory operations (add stock, remove stock, place order) follow a dangerous pattern:

```js
// Step 1: Read current quantity
const { data: item } = await supabase.from('inventory').select('*').eq('id', id).single();
// Step 2: Write back calculated value
await supabase.from('inventory').update({ quantity: item.quantity + amount }).eq('id', id);
```

**Problem:** If two users place orders simultaneously, both read the same `quantity`, and the second write overwrites the first — resulting in lost stock deductions.

**Fix:** Use Supabase RPC with a PostgreSQL function:

```sql
CREATE OR REPLACE FUNCTION deduct_stock(item_id bigint, deduction integer)
RETURNS integer AS $$
DECLARE
  current_qty integer;
BEGIN
  SELECT quantity INTO current_qty FROM inventory WHERE id = item_id FOR UPDATE;
  IF current_qty - deduction < 0 THEN
    RAISE EXCEPTION 'Insufficient stock. Available: %', current_qty;
  END IF;
  UPDATE inventory SET quantity = current_qty - deduction, updated_at = now() WHERE id = item_id;
  RETURN current_qty - deduction;
END;
$$ LANGUAGE plpgsql;
```

Then call via `supabase.rpc('deduct_stock', { item_id, deduction })`.

---

#### Issue 2: Sale Code Generation Uses COUNT (Not Collision-Safe)

**File:** `useSales.js`, `useDebts.js`, `useCustomers.js`

```js
const { count } = await supabase.from('sales').select('*', { count: 'exact', head: true });
const sale_code = `S-${count + 1}-${dateSuffix}`;
```

**Problem:** If a sale is deleted, `count` decreases, and a new sale may generate a duplicate `sale_code`. Two simultaneous sales will also get the same code.

**Fix:** Use a PostgreSQL SEQUENCE or store the last-used counter in a `code_counters` table with an atomic increment:

```sql
CREATE TABLE code_counters (
  entity text PRIMARY KEY,
  last_value bigint DEFAULT 0
);

CREATE OR REPLACE FUNCTION next_code(entity_name text)
RETURNS bigint AS $$
  UPDATE code_counters SET last_value = last_value + 1 WHERE entity = entity_name
  RETURNING last_value;
$$ LANGUAGE sql;
```

---

#### Issue 3: Non-Transactional Multi-Table Operations

**File:** `useSales.js` → `placeOrder()`

The order placement involves 4 separate database calls (deduct inventory → generate code → insert sale → insert debt). If any step fails mid-way, the system is left in an inconsistent state (e.g., stock deducted but no sale recorded).

**Fix:** Wrap the entire operation in a single Supabase RPC function that runs as a PostgreSQL transaction:

```sql
CREATE OR REPLACE FUNCTION place_order(
  p_customer_id bigint, p_cube_type text, p_quantity integer,
  p_price_per_cube numeric, p_payment_type text, p_created_by text
) RETURNS jsonb AS $$
DECLARE
  -- variables
BEGIN
  -- All operations inside a single transaction
  -- 1. Lock and deduct inventory
  -- 2. Generate sale code
  -- 3. Insert sale
  -- 4. Insert debt if needed
  RETURN result;
END;
$$ LANGUAGE plpgsql;
```

---

### 2.3 🟡 Code Quality Improvements

| Issue | Location | Recommendation |
|:---|:---|:---|
| **Realtime channel names use `Math.random()`** | All hooks | Use deterministic names like `'inventory-changes'` to avoid channel leaks on hot-reload |
| **`useSettings` hook imported in `App.jsx` outside of providers** | `App.jsx` L23 | `useSettings` makes a Supabase call on mount, but it's called outside `AuthProvider`, meaning unauthenticated users trigger API calls. Move into `AppShell` or a `SettingsProvider` |
| **Hardcoded fallback data in hooks** | `useExpenses.js`, `useMaintenance.js`, `useProductionBatches.js` | These have hardcoded `INITIAL_*` arrays and localStorage fallbacks mixed with Supabase fetches — makes data source ambiguous. Remove fallbacks once Supabase is the single source of truth |
| **`main.jsx` deletes IndexedDB on every load** | `main.jsx` L7-13 | This is leftover from the Dexie.js migration — remove it to avoid unnecessary work on every page load |
| **No error boundaries** | Across the app | Add a React `ErrorBoundary` component to catch rendering crashes gracefully |
| **No TypeScript** | Entire codebase | Consider migrating to TypeScript for type safety, especially for Supabase query results and complex data shapes |

---

## 3. Security Vulnerabilities

### 🔴 CRITICAL

#### 3.1 Gemini API Key Exposed in Client-Side Code

**Files:** `sagaAiService.js`, `useSettings.js`, `SettingsPage.jsx`

The Gemini API key is:
- Stored in the `settings` table (readable by all authenticated users via RLS `for select using (true)`)
- Cached in `localStorage` (`saga_gemini_api_key`)
- Sent directly from the browser to the Gemini API

**Risk:** Any authenticated user (even `user` role) can extract the API key from the browser's DevTools (Network tab, localStorage, or the settings API response).

**Fix:** Create a Supabase Edge Function that proxies AI requests. The API key stays server-side:

```
Client → Supabase Edge Function (has API key) → Gemini API
```

---

#### 3.2 Supabase Session Not Persisted

**File:** `supabase.js` L14

```js
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false }
});
```

**Problem:** Users must re-login on every page refresh or browser tab close. This is a poor user experience and unusual for a production app.

**Fix:** Set `persistSession: true` (the default) unless there's a specific security reason not to. If token theft is a concern, use short-lived sessions with refresh tokens.

---

#### 3.3 Overly Permissive RLS Policies

**File:** `supabase_schema.sql`

Several tables have RLS policies that allow any authenticated user to write:

```sql
-- Any authenticated user can write to sales, debts, debt_settlements, customers
create policy "Allow write sales for authenticated" on public.sales
  for all to authenticated using (true);
```

**Risk:** A `user`-role operator could directly call the Supabase API (bypassing the UI) to delete sales, modify debts, or alter customer records.

**Fix:** Tighten policies based on role:

```sql
-- Only allow inserts for users, allow all for admins
CREATE POLICY "Users can insert sales" ON sales
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can update/delete sales" ON sales
  FOR ALL TO authenticated
  USING (public.is_admin());
```

---

#### 3.4 Settings Table Readable by Anonymous Users

```sql
create policy "Allow read settings for public" on public.settings
  for select using (true);
```

**Problem:** The settings table contains `gemini_api_key` and is readable without authentication.

**Fix:** Change to authenticated-only read, or exclude sensitive columns:

```sql
-- Option 1: Restrict to authenticated
CREATE POLICY "Allow read settings for authenticated" ON settings
  FOR SELECT TO authenticated USING (true);

-- Option 2: Move API key to a separate secrets table readable only by admins
```

---

#### 3.5 PDF Bills Public Storage Bucket

```sql
insert into storage.buckets (id, name, public) values ('bills', 'bills', true);
```

**Problem:** All uploaded bill PDFs are publicly accessible to anyone with the URL. Bill PDFs contain customer names, WhatsApp numbers, addresses, and financial data.

**Fix:** Make the bucket private and generate signed URLs with expiration:

```js
const { data } = await supabase.storage.from('bills').createSignedUrl(fileName, 3600); // 1 hour
```

---

#### 3.6 Shorthand Login Credentials Hardcoded

**File:** `AuthContext.jsx` L73-77

```js
if (formattedEmail === 'admin') {
  formattedEmail = 'admin@sagacious.com';
} else if (formattedEmail === 'user') {
  formattedEmail = 'user@sagacious.com';
}
```

**Problem:** This reveals the internal admin email address in client-side code and makes brute-force easier.

**Fix:** Remove shorthand mappings in production. If needed for development, gate behind an environment variable:

```js
if (import.meta.env.DEV) {
  // shorthand mappings only in development
}
```

---

## 4. System Functions — Issues & Improvements

### 4.1 Sales Module

| Issue | Severity | Recommendation |
|:---|:---:|:---|
| **No sale editing capability** | Medium | Add ability to edit a sale (change quantity, fix errors) with stock adjustment — currently only delete exists |
| **No returns/refund flow** | Medium | Add a "Return" action on sales that restores stock and creates a negative transaction record |
| **Sale deletion restores stock but doesn't reverse debt** | High | `deleteSale()` restores inventory but relies on `ON DELETE CASCADE` for debts — if partial payments were made, the customer loses settlement history. Add explicit debt reversal logic |
| **PDF bill URL expires after 24 hours** | Medium | The `purge_expired_pdf_bills()` function deletes bills and nulls URLs, but there's no UI indication that the bill is no longer available. Show a "Bill expired — Regenerate" button |
| **No sale confirmation summary email** | Low | Consider sending an email summary for large orders (optional) |

### 4.2 Inventory Module

| Issue | Severity | Recommendation |
|:---|:---:|:---|
| **No inventory transaction history/audit log** | High | Currently only stores current quantity — no record of who added/removed stock and when. Add an `inventory_transactions` table |
| **No minimum stock alerts** | Medium | Add a `min_stock_threshold` column to `inventory` and show warnings on the dashboard when stock falls below threshold |
| **Waste cubes (`WST`) have no tracking logic** | Low | WST type exists but there's no workflow to log how waste is generated (melted cubes, broken cubes). Add a waste logging feature |

### 4.3 Customer Module

| Issue | Severity | Recommendation |
|:---|:---:|:---|
| **Customer deletion doesn't check for active debts** | High | Deleting a customer with `ON DELETE CASCADE` on debts will silently erase all their debt records. Block deletion if outstanding debts exist |
| **No customer merge/deduplication** | Medium | If a customer is accidentally created twice, there's no way to merge their records |
| **WhatsApp number validation is Sri Lanka-specific (10 digits)** | Low | Consider adding country code prefix support for international customers |

### 4.4 Debt & Settlement Module

| Issue | Severity | Recommendation |
|:---|:---:|:---|
| **No settlement PDF generated on debt payment** | Medium | The `settleDebt()` function returns `bill_pdf_url: null` — the settlement receipt PDF is never generated or uploaded. Wire up `generateSettlementReceiptPDF()` |
| **No overpayment handling** | Low | If a customer wants to pay more than owed (advance payment), the system rejects it. Consider supporting credit balance |
| **No debt aging report** | Medium | Add a column for `due_date` and calculate aging buckets (30/60/90 days overdue) |

### 4.5 Reports Module

| Issue | Severity | Recommendation |
|:---|:---:|:---|
| **Reports fetch all data client-side** | High | The Reports page downloads ALL sales, debts, and customers to the browser, then filters locally. For large datasets this will be slow. Use Supabase queries with date filters |
| **No scheduled/automated report generation** | Medium | Add ability to schedule weekly/monthly reports via email or WhatsApp |
| **Customized Report (from Reports.md) not yet implemented** | Medium | The proposed feature for combinable filter reports is documented but not built |

### 4.6 Production & Operations Module

| Issue | Severity | Recommendation |
|:---|:---:|:---|
| **No batch deletion or editing** | Medium | Once a production batch is logged, it cannot be corrected |
| **Cost-per-cube calculation doesn't include labor** | Low | `cost_per_cube` only factors energy costs — consider adding labor allocation per batch |
| **No production planning/forecasting** | Low | Based on historical data, suggest optimal batch sizes and schedules |

### 4.7 SAGA AI Module

| Issue | Severity | Recommendation |
|:---|:---:|:---|
| **Full database dump sent on every message** | High | `fetchFullSystemContext()` fetches ALL tables and sends 100+ KB of JSON to Gemini on every single chat message. This is expensive, slow, and hits token limits. Cache the context and only refresh every 5 minutes |
| **No conversation persistence** | Medium | AI chat history is lost on page refresh. Store in `localStorage` or a Supabase table |
| **Sensitive customer data sent to external API** | High | Customer WhatsApp numbers, addresses, and financial data are sent to Google's Gemini API in every request. Add data anonymization before sending |
| **No streaming support** | Low | Use Gemini's streaming API for real-time response rendering instead of waiting for the full response |

---

## 5. Database & Schema Recommendations

### 5.1 Missing Tables

| Table | Purpose | Priority |
|:---|:---|:---:|
| `inventory_transactions` | Audit log for all stock changes (who, what, when, why) | 🔴 High |
| `code_counters` | Atomic code generation to prevent duplicates | 🔴 High |
| `audit_log` | General system audit trail (login events, setting changes, deletions) | 🟡 Medium |
| `notifications` | In-app notification system for alerts (low stock, overdue debts, maintenance due) | 🟡 Medium |
| `payment_methods` | Configurable payment methods instead of hardcoded `'cash'`/`'debt'` (add bank transfer, cheque, etc.) | 🟢 Low |

### 5.2 Schema Improvements

| Current | Problem | Fix |
|:---|:---|:---|
| `sales.created_by text` | Stores a plain text name, no foreign key to profiles | Change to `created_by uuid REFERENCES profiles(id)` |
| `debts` has no `due_date` | Can't track aging or overdue debts | Add `due_date timestamp with time zone` |
| `inventory.price_per_cube` nullable | If null, sales can't proceed but no DB-level constraint | Add `CHECK (type = 'waste' OR price_per_cube IS NOT NULL)` |
| `customers.whatsapp_number` is 10 digits only | Doesn't support international format | Store as `+94XXXXXXXXX` (E.164 format) |
| No `updated_by` columns | Can't track who made the last change | Add `updated_by uuid` to key tables |
| `settings` table has no row-level isolation | Multiple rows possible | Add `UNIQUE` constraint or use `id = 1` pattern |

### 5.3 Index Recommendations

```sql
-- Frequently filtered/joined columns
CREATE INDEX idx_sales_customer_id ON sales(customer_id);
CREATE INDEX idx_sales_sale_date ON sales(sale_date);
CREATE INDEX idx_sales_payment_type ON sales(payment_type);
CREATE INDEX idx_debts_customer_id ON debts(customer_id);
CREATE INDEX idx_debts_status ON debts(status);
CREATE INDEX idx_debt_settlements_debt_id ON debt_settlements(debt_id);
CREATE INDEX idx_customers_whatsapp ON customers(whatsapp_number);
CREATE INDEX idx_operating_expenses_category ON operating_expenses(category);
CREATE INDEX idx_operating_expenses_date ON operating_expenses(expense_date);
```

---

## 6. UI/UX Features & Design Improvements

### 6.1 🔴 High-Priority UX Issues

#### 6.1.1 Mobile Bottom Nav Truncation

**File:** `AppShell.jsx` L253

Only the first 5 nav items are shown on mobile:
```js
{visibleNavItems.slice(0, 5).map(...)}
```

**Problem:** Production, Expenses, Reports are inaccessible on mobile unless the user is an admin who gets the Settings link. There's no way for a mobile user to reach "Production & Ops" or "Expense Ledger".

**Fix:** Replace the sliced nav with a scrollable horizontal tab bar, or add a "More" menu with a slide-up drawer containing the remaining items.

---

#### 6.1.2 No Loading State on Order Placement

When a user clicks "Place Order," the system performs 4+ API calls (fetch inventory → deduct stock → generate PDF → upload PDF → insert sale → insert debt). During this time, there's no visual feedback.

**Fix:** Add a full-page loading overlay with a step indicator:
```
✓ Validating stock... → ✓ Generating invoice... → ⏳ Recording sale... → Done!
```

---

#### 6.1.3 No Offline/Connection Error Handling

If the user loses internet connection mid-operation, Supabase calls silently fail. The app shows no feedback.

**Fix:**
- Add a global connection status indicator in the header bar
- Show a persistent banner when offline: "You're offline. Some features may not work."
- Queue operations for retry when connection is restored

---

#### 6.1.4 Form Data Loss on Navigation

If a user is filling out a sales order and accidentally clicks a nav link, all form data is lost with no warning.

**Fix:** Add an `onBeforeUnload` handler and a `<Prompt>` component from React Router to warn users about unsaved changes.

---

### 6.2 🟡 Medium-Priority UX Improvements

#### 6.2.1 Dashboard Enhancements

| Current | Improvement |
|:---|:---|
| Static summary cards | Add sparklines (mini trend charts) inside each stat card showing 7-day trend |
| Charts load all at once | Lazy-load charts below the fold with intersection observer |
| No comparison data | Show "vs. yesterday" or "vs. last week" percentage change on each KPI |
| No quick actions | Add quick action buttons: "New Sale", "Settle Debt", "Add Stock" directly on dashboard |
| No real-time clock | Show current time and shift indicator (Morning/Afternoon/Night) |

#### 6.2.2 Table Improvements

| Current | Improvement |
|:---|:---|
| No pagination | All tables load full data — add pagination (10/25/50 per page) with server-side support |
| No column visibility toggle | Let users hide/show columns based on preference |
| No row selection/bulk actions | Add checkboxes for bulk delete, bulk export, bulk status change |
| No data export | Add "Export to CSV" and "Export to Excel" buttons on all tables |
| Fixed column widths | Make tables responsive with horizontal scroll indicators on mobile |

#### 6.2.3 Search Improvements

| Current | Improvement |
|:---|:---|
| Basic text filter | Add debounced search (300ms delay) to reduce unnecessary re-renders |
| No global search | Add a global search bar (⌘K / Ctrl+K shortcut) that searches across customers, sales, debts simultaneously |
| Customer search in Sales modal | Add recent/frequent customers as quick-select chips above the search field |

#### 6.2.4 Form UX Improvements

| Current | Improvement |
|:---|:---|
| Manual date entry | Replace text inputs with proper date/time pickers with calendar UI |
| No form auto-save | Add draft auto-save for long forms (settings, new customer) using `localStorage` |
| No field-level validation messages | Show inline validation errors below each field, not just on submit |
| No keyboard shortcuts | Add keyboard shortcuts: `Enter` to submit, `Escape` to close modals, `Tab` for field navigation |

### 6.3 🟢 Polish & Micro-Interaction Recommendations

| Area | Improvement |
|:---|:---|
| **Page transitions** | Add smooth page transition animations (fade-in/slide-in) when navigating between pages |
| **Skeleton loaders** | Current `Skeleton` component is minimal (just a `div` with `animate-pulse`). Add realistic card/table skeletons that match actual content layout |
| **Toast animations** | Toasts use `animate-in slide-in-from-top-4` which may not be defined in Tailwind v4 — verify these are working |
| **Empty states** | Table empty state always says "Empty Stockroom" — customize per page (e.g., "No customers yet", "No sales recorded") |
| **Success celebrations** | Add a confetti animation or satisfying checkmark animation after placing a large order |
| **Dark mode consistency** | Audit all pages for dark mode contrast issues — ensure all text, borders, and backgrounds have proper dark variants |
| **Print stylesheet** | Add `@media print` CSS for clean printing of reports, bills, and tables directly from the browser |
| **Favicon** | Dynamic favicon from settings is great, but add a default `favicon.ico` in `/public` for initial page load before settings are fetched |
| **404 page** | Currently redirects all unknown routes to `/` — add a proper 404 page with helpful navigation |

### 6.4 Accessibility (a11y) Recommendations

| Issue | Fix |
|:---|:---|
| No `aria-label` on icon-only buttons | Add descriptive `aria-label` attributes (e.g., theme toggle, logout, mobile menu) |
| No focus management in modals | Trap focus inside open modals, return focus to trigger button on close |
| No skip-to-content link | Add a visually hidden "Skip to main content" link at the top of the page |
| Color contrast in dark mode | Audit `text-slate-500` on `bg-slate-900` — likely fails WCAG AA contrast ratio |
| No keyboard navigation for bottom nav | Mobile bottom nav items should be accessible via keyboard Tab/Arrow keys |
| Form error messages | Use `aria-describedby` to link error messages to their form fields |

---

## 7. Performance Optimizations

### 7.1 Bundle Size

| Issue | Impact | Fix |
|:---|:---:|:---|
| No code splitting | Large initial bundle | Use `React.lazy()` and `Suspense` for page-level code splitting: `const DashboardPage = React.lazy(() => import('./pages/DashboardPage'))` |
| Recharts imported on all pages | Unused on non-dashboard pages | Lazy-load Recharts only on Dashboard and Reports pages |
| jsPDF imported globally | Large library (~300KB) | Dynamic import only when generating PDFs: `const { default: jsPDF } = await import('jspdf')` |
| Lucide React full imports | Each icon is tree-shakeable | ✅ Already importing individual icons — good! |

### 7.2 Data Fetching

| Issue | Impact | Fix |
|:---|:---:|:---|
| **Dashboard fetches ALL tables** | Slow on large datasets | Create a Supabase Edge Function or view that returns pre-aggregated dashboard KPIs |
| **Every hook subscribes to realtime independently** | Multiple WebSocket connections | Consolidate into a single realtime manager that dispatches updates to relevant hooks |
| **`useExpenses` depends on `useSales` and `useProductionBatches`** | Cascading fetches on mount | Move P&L calculation to a server-side function or computed view |
| **No request caching** | Same data re-fetched on every page visit | Add `React Query` (TanStack Query) or `SWR` for caching, deduplication, and background refresh |
| **No pagination on Supabase queries** | All records loaded | Add `.range(from, to)` to all list queries |

### 7.3 Rendering

| Issue | Fix |
|:---|:---|
| Tables re-render on every state change | Use `React.memo()` for table row components |
| Charts re-render with parent | Wrap chart components in `React.memo()` with deep comparison |
| Modals are always in the DOM (hidden) | Use conditional rendering: `{isOpen && <Modal />}` — ✅ already done |

---

## 8. DevOps & Deployment

### 8.1 Testing

| Type | Current State | Recommendation |
|:---|:---|:---|
| **Unit Tests** | ❌ None | Add Vitest for testing hooks (`useInventory`, `useSales` business logic) |
| **Component Tests** | ❌ None | Add React Testing Library for component tests |
| **E2E Tests** | ❌ None | Add Playwright or Cypress for critical flows (login → place order → settle debt) |
| **API Integration Tests** | ❌ None | Test Supabase RLS policies with different user roles |

### 8.2 CI/CD Pipeline

Currently, deployment is manual via Netlify git integration. Add:

1. **GitHub Actions workflow:**
   - Lint (`npm run lint`)
   - Type-check (if TypeScript is adopted)
   - Run tests
   - Build (`npm run build`)
   - Deploy to Netlify (staging → production)

2. **Environment management:**
   - Separate Supabase projects for `development`, `staging`, `production`
   - Use Netlify deploy previews for PR review

### 8.3 Monitoring & Observability

| Tool | Purpose |
|:---|:---|
| **Sentry** | Error tracking and crash reporting |
| **LogRocket** or **FullStory** | Session replay for debugging UX issues |
| **Supabase Dashboard** | Monitor API usage, database connections, storage |
| **Uptime monitoring** | Netlify + Supabase uptime alerts (use Uptime Robot or Better Stack) |

### 8.4 Version & Release Management

- **Current version:** `0.0.0` in `package.json` — update to `1.0.0` for the first production release
- Add `CHANGELOG.md` to track version history
- Use semantic versioning: `MAJOR.MINOR.PATCH`
- Add a version display in the Settings page footer

---

## 9. Feature Recommendations

### 9.1 High-Value New Features

| Feature | Description | Business Impact |
|:---|:---|:---|
| **📱 PWA / Installable App** | Add `manifest.json` and service worker to make the app installable on mobile home screens | Factory operators can use it like a native app |
| **🔔 Push Notifications** | Notify admins of low stock, overdue maintenance, new debt payments | Reduces manual checking, improves response time |
| **📊 Advanced Analytics Dashboard** | Add trend analysis, forecasting, anomaly detection (e.g., "Sales 30% below average this week") | Better business decisions |
| **📦 Supplier Management** | Track ice cube raw material suppliers, purchase orders, and cost of goods | Complete supply chain visibility |
| **👥 Employee/Shift Management** | Track operator shifts, attendance, and per-shift sales performance | Workforce optimization |
| **📧 Email Integration** | Send invoices, settlement receipts, and reports via email | Professional customer communication |
| **🧾 GST/Tax Support** | Add tax calculation (if applicable) to invoices and reports | Tax compliance |
| **📈 Customer Loyalty/Credit Score** | Track customer payment history and assign a reliability score | Better credit decisions |

### 9.2 Quick Wins (Easy to Implement)

| Feature | Effort | Impact |
|:---|:---:|:---:|
| Add "Last Login" display in header | 1 hour | Low |
| Add "Copy to Clipboard" for sale codes | 30 min | Low |
| Add keyboard shortcut to open AI assistant (`Ctrl+/`) | 1 hour | Medium |
| Add "Mark as Favourite" for frequent customers | 2 hours | Medium |
| Add currency formatter utility (consistent LKR formatting) | 1 hour | Medium |
| Add a "What's New" changelog modal on version updates | 2 hours | Low |
| Add tooltip on hover for truncated text in tables | 1 hour | Low |

---

## 10. Priority Action Items

### 🔴 Immediate (This Week)

1. **Fix race conditions** in inventory operations with PostgreSQL functions
2. **Fix sale code generation** to use atomic counters instead of `COUNT`
3. **Secure the Gemini API key** — move to server-side proxy (Supabase Edge Function)
4. **Make bills storage bucket private** — use signed URLs
5. **Tighten RLS policies** — restrict write operations by role
6. **Enable session persistence** — set `persistSession: true`
7. **Remove IndexedDB deletion** from `main.jsx`

### 🟡 Short-Term (This Month)

8. **Wrap order placement in a transaction** (PostgreSQL function)
9. **Add inventory transaction audit log**
10. **Fix mobile navigation** — make all pages accessible
11. **Add pagination** to all data tables
12. **Implement code splitting** with `React.lazy()`
13. **Add loading states** for multi-step operations
14. **Generate settlement receipt PDFs** (currently returns `null`)
15. **Add database indexes** for frequently queried columns

### 🟢 Medium-Term (Next Quarter)

16. **Implement the Customized Report** feature (as documented in `Reports.md`)
17. **Add unit and integration tests** with Vitest
18. **Add CI/CD pipeline** with GitHub Actions
19. **Migrate to TypeScript** for type safety
20. **Add React Query** for data caching
21. **Implement PWA** support for mobile installation
22. **Add customer debt aging** reports (30/60/90 days)
23. **Add error boundaries** for crash resilience
24. **Add data anonymization** before sending to AI
25. **Add global search** (⌘K) across all entities

---

> **Note:** This analysis was performed by reviewing all source code files, database schema, documentation, and system architecture. Each recommendation includes the specific file location and code patterns that need attention.
>
> For any questions or to prioritize implementation, feel free to discuss individual items.