-- `inventory_transactions` has had row level security enabled (see
-- supabase_schema.sql line ~269) since it was created, but no policy was
-- ever added for it. With RLS on and zero policies, every client-side
-- operation as the `authenticated` role silently resolves to zero rows:
-- select returns [] (masked in the app by the useInventory.js localStorage
-- fallback), and delete/update/insert affect nothing without erroring.
-- The add_inventory_stock/deduct_inventory_stock RPCs still work because
-- security-definer functions run as their owner, which bypasses RLS
-- entirely — that's why stock changes appeared to log fine while direct
-- reads/deletes from the client never actually touched real rows.
--
-- Needed now so "Clear All Data" in Settings can actually delete this
-- table's rows instead of silently no-op'ing, and as a side effect this
-- also makes the Inventory page's transaction history load for real
-- instead of always falling back to localStorage.
-- `drop ... if exists` first since the live database has drifted from what
-- this repo's migrations track: at least the read policy already exists
-- there (added outside of a tracked migration at some point), which made a
-- plain `create policy` fail with "policy already exists" on first run.
drop policy if exists "Allow read inventory_transactions for authenticated" on public.inventory_transactions;
create policy "Allow read inventory_transactions for authenticated" on public.inventory_transactions
  for select to authenticated using (true);

drop policy if exists "Allow admin write inventory_transactions" on public.inventory_transactions;
create policy "Allow admin write inventory_transactions" on public.inventory_transactions
  for all to authenticated using (public.is_admin());
