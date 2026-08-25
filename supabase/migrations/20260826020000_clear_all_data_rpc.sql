-- ==========================================================================
-- Settings → Clear Database: a single atomic, server-side wipe
-- ==========================================================================
-- The previous implementation looped over a hand-maintained table list from
-- the browser. Three problems that this function fixes:
--
--   1. Silent no-ops. A client `.delete()` on a table with no DELETE policy
--      removes zero rows and reports no error, so `code_counters` survived
--      every "clear" and SAGA codes kept counting up from the old data.
--   2. Missed tables. `opening_balances`, `notification_log`,
--      `expense_categories`, `expense_items` and `settings` were never in
--      the list, so a "cleared" system still held opening cash/bank
--      balances, the WhatsApp dispatch log, the expense chart of accounts
--      and the company profile / Gemini API key.
--   3. Non-atomic. A failure partway through the loop left the database
--      half-wiped with no way back.
--
-- What survives: login information only — `auth.users` and the `profiles`
-- rows that carry each account's role, name and username.
-- --------------------------------------------------------------------------

create or replace function public.clear_all_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tables text;
begin
  if not public.is_admin() then
    raise exception 'Only admins can clear the database';
  end if;

  -- A DENYLIST, not an allowlist -- deliberately.
  --
  -- Naming the tables to wipe was the first attempt at this and it was the
  -- wrong shape twice over. It rots the moment a feature adds a table, and it
  -- rots SILENTLY: data survives the one operation whose entire promise is
  -- that nothing survives. It also goes stale in the other direction -- the
  -- first draft listed `drivers`, dropped back in
  -- 20260821080000_link_transport_to_employees.sql when drivers were folded
  -- into `employees`, so the whole function aborted on a table that had not
  -- existed for months.
  --
  -- Discovering the list from the live catalog fixes both: a table added next
  -- month is wiped automatically, and a table dropped last month cannot
  -- reappear here. Only three are held back, and only for structural reasons:
  --
  --   profiles  -- login information, the one thing that must survive.
  --   inventory -- the MFC/RSC/BNC/DGC catalog rows are looked up by `type`
  --                by the order-placement RPCs, which expect exactly one row
  --                per cube type. Deleting them would brick Sales rather than
  --                blank it, so it is reset in place below instead.
  --   settings  -- useSettings() expects a single row. Reset in place below.
  select string_agg(format('public.%I', c.relname), ', ')
    into v_tables
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and not c.relispartition
     and c.relname not in ('profiles', 'inventory', 'settings')
     -- Anything an extension owns (pg_depend deptype 'e') is infrastructure,
     -- not factory data; truncating one could break the extension.
     and not exists (
       select 1 from pg_depend d
        where d.objid = c.oid and d.deptype = 'e'
     );

  if v_tables is not null then
    -- One TRUNCATE over the whole set at once, so FK order stops mattering --
    -- Postgres checks the set as a whole rather than statement by statement,
    -- which is what made the old children-before-parents ordering necessary.
    -- RESTART IDENTITY puts row ids back to 1 so the system genuinely reads
    -- as a fresh install rather than carrying on from the old data's numbers.
    -- CASCADE cannot reach the three held-back tables: it only pulls in
    -- tables that REFERENCE a truncated one, and none of the three do
    -- (profiles points at auth.users; inventory and settings point nowhere).
    execute format('truncate table %s restart identity cascade', v_tables);
  end if;

  -- Structural rows reset in place (see above). Both carry `where true`: this
  -- runs as the function owner, which has pg-safeupdate enabled and rejects
  -- an unqualified UPDATE.
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
