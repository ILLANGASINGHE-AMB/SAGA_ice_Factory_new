-- ==========================================================================
-- Settings → Clear Database: a single atomic, server-side wipe
-- ==========================================================================
-- The previous implementation looped over a hand-maintained table list from
-- the browser. Three problems that this function fixes:
--
--   1. Silent no-ops. A client `.delete()` on a table with no DELETE policy
--      removes zero rows and reports no error, so `code_counters` survived
--      every "clear" and SAGA codes kept counting up from the old data.
--   2. Missed tables. `drivers`, `opening_balances`, `notification_log`,
--      `expense_categories`, `expense_items` and `settings` were never in
--      the list, so a "cleared" system still held driver names, opening
--      cash/bank balances, the WhatsApp dispatch log, the expense chart of
--      accounts and the company profile / Gemini API key.
--   3. Non-atomic. A failure partway through the loop left the database
--      half-wiped with no way back.
--
-- What survives: login information only — `auth.users` and the `profiles`
-- rows that carry each account's role, name and username. Everything else
-- goes. The two structural exceptions below are reset in place rather than
-- deleted, because deleting their rows would brick the app rather than
-- blank it, and resetting them reaches the identical zero-data end state:
--
--   * `inventory` — the four catalog rows (MFC/RSC/BNC/DGC) are looked up by
--     `type` by the order-placement RPCs, which expect exactly one row per
--     cube type. Quantities go to 0 and prices to null (unset), matching the
--     fresh-install seed.
--   * `settings` — one row is expected by useSettings(); its columns are
--     reset to the schema defaults, clearing the company profile, logo,
--     favicon and stored Gemini API key.
-- --------------------------------------------------------------------------

create or replace function public.clear_all_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can clear the database';
  end if;

  -- Children before parents so the `on delete restrict` FKs
  -- (transport_trips.employee_id, transport_trips.driver_id) never block a
  -- step. Every statement carries `where true`: this runs as the function
  -- owner, which has pg-safeupdate enabled and rejects an unqualified
  -- DELETE/UPDATE.

  -- Sales, debts and customers
  delete from public.debt_settlements where true;
  delete from public.debts where true;
  delete from public.sale_items where true;
  delete from public.sales where true;
  delete from public.customer_cube_prices where true;
  delete from public.notification_log where true;
  delete from public.customers where true;

  -- Transport and staff
  delete from public.transport_trips where true;
  delete from public.vehicle_trips where true;
  delete from public.vehicles where true;
  delete from public.drivers where true;
  delete from public.employee_attendance where true;
  delete from public.employees where true;

  -- Expenses, including the chart of accounts itself
  delete from public.expense_amounts where true;
  delete from public.expense_ledger_rows where true;
  delete from public.expense_items where true;
  delete from public.expense_categories where true;

  -- Cash, bank and reporting
  delete from public.daily_manager_reports where true;
  delete from public.cheque_records where true;
  delete from public.bank_deposits where true;
  delete from public.cash_receives where true;
  delete from public.bank_withdrawals where true;
  delete from public.opening_balances where true;

  -- Notes, audit trails and recycle bin
  delete from public.notes where true;
  delete from public.activity_log where true;
  delete from public.inventory_transactions where true;
  delete from public.trash where true;

  -- SAGA code sequences restart from 1. next_code() upserts its counter row,
  -- so deleting these is safe — the rows come back on first use.
  delete from public.code_counters where true;

  -- Structural rows reset in place (see header).
  update public.inventory
     set quantity = 0,
         price_per_cube = null,
         updated_at = timezone('utc'::text, now())
   where true;

  update public.settings
     set company_name = 'Sagacious Ice Factory',
         company_address = '',
         company_phone = '',
         company_email = '',
         logo_url = null,
         favicon_url = null,
         gemini_api_key = '',
         ai_enabled = true,
         updated_at = timezone('utc'::text, now())
   where true;
end;
$$;

grant execute on function public.clear_all_data() to authenticated;
