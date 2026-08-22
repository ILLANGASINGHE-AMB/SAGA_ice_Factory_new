-- Every hook already subscribes to `postgres_changes` on its tables (see
-- useInventory.js, useSales.js, useDashboard.js, useDailyReport.js, etc.)
-- with correctly-cleaned-up channels — but none of those subscriptions ever
-- fire, because Postgres only streams row changes for tables added to the
-- `supabase_realtime` publication, and no prior migration ever added any.
-- That's why every page needs a manual navigate-away-and-back to see new
-- data: the client is listening on a publication with nothing in it.
--
-- Wrapped in a loop with an existence check so this migration is safe to
-- re-run (plain `alter publication ... add table` errors if the table is
-- already a member).
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'inventory', 'inventory_transactions',
    'customers', 'sales', 'sale_items', 'debts', 'debt_settlements',
    'settings', 'vehicles', 'vehicle_trips', 'employees', 'employee_attendance',
    'transport_trips', 'customer_cube_prices',
    'expense_categories', 'expense_items', 'expense_ledger_rows', 'expense_amounts',
    'daily_manager_reports', 'cash_receives', 'bank_deposits', 'cheque_records',
    'bank_withdrawals', 'notes', 'activity_log', 'trash'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
