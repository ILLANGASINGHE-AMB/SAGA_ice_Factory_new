-- ==========================================================================
-- SAGA code formats (System_Functions.md) + trip codes
-- ==========================================================================
--   Sales      SIF_0001_0826     0001 = nth sale that month, 08 = month, 26 = yy
--   Debts      SIFD_0001_0826
--   Trips      SIFT_0001_0826    (new — trips had no code column at all)
--   Customers  SIFC_0001         one continuous sequence
--   Employees  SIFE_0001         one continuous sequence
--
-- The sequence restarts each calendar MONTH, not each day. A daily reset would
-- collide on a unique column: the MMYY suffix cannot tell Aug 25 from Aug 26,
-- so the 1st sale of each would both be SIF_0001_0826. Monthly reset is the
-- only reading consistent with the documented format, and is what was
-- confirmed before writing this.
--
-- Codes are now assigned by BEFORE INSERT triggers rather than by the client
-- calling get_next_code() and then inserting. That makes the code and the row
-- atomic (no gap where a code is burned but the insert fails) and removes a
-- network round-trip from every create — which matters on slow connections.

-- --------------------------------------------------------------------------
-- 1. Counters become per-period
-- --------------------------------------------------------------------------
alter table public.code_counters add column if not exists period text not null default '';

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.code_counters'::regclass and contype = 'p'
  ) then
    alter table public.code_counters drop constraint code_counters_pkey;
  end if;
end $$;

alter table public.code_counters add constraint code_counters_pkey primary key (entity, period);

-- --------------------------------------------------------------------------
-- 2. Code generator
-- --------------------------------------------------------------------------
-- p_prefix is now only a fallback. The prefix for every entity this system
-- defines is fixed here so the six RPCs that call this function (place_*_order,
-- settle_debt, edit_sale, ...) did not each have to be re-issued just to pass a
-- new string.
create or replace function public.get_next_code(p_entity text, p_prefix text)
returns text as $$
declare
  v_period text;
  v_prefix text;
  v_next   bigint;
begin
  v_prefix := case p_entity
    when 'sale'               then 'SIF'
    when 'settlement'         then 'SIFD'
    when 'trip'               then 'SIFT'
    when 'customer'           then 'SIFC'
    when 'one_time_customer'  then 'SIFO'
    when 'employee'           then 'SIFE'
    else p_prefix
  end;

  -- Expense codes are outside the System_Functions.md spec and keep their
  -- original CAT-00001 / EXP-00001 shape.
  if p_entity in ('expense_category', 'expense_item') then
    insert into public.code_counters (entity, period, last_value)
    values (p_entity, '', 1)
    on conflict (entity, period) do update set last_value = public.code_counters.last_value + 1
    returning last_value into v_next;
    return v_prefix || '-' || lpad(v_next::text, 5, '0');
  end if;

  -- Customers and employees run one continuous sequence; dated entities
  -- restart each calendar month. 'Asia/Colombo' rather than the server's UTC:
  -- a sale entered at 9pm local on the 31st belongs to that month, not the next.
  if p_entity in ('customer', 'one_time_customer', 'employee') then
    v_period := '';
  else
    v_period := to_char(now() at time zone 'Asia/Colombo', 'MMYY');
  end if;

  insert into public.code_counters (entity, period, last_value)
  values (p_entity, v_period, 1)
  on conflict (entity, period) do update set last_value = public.code_counters.last_value + 1
  returning last_value into v_next;

  if v_period = '' then
    return v_prefix || '_' || lpad(v_next::text, 4, '0');
  end if;
  return v_prefix || '_' || lpad(v_next::text, 4, '0') || '_' || v_period;
end;
$$ language plpgsql security definer;

-- --------------------------------------------------------------------------
-- 3. Trip codes
-- --------------------------------------------------------------------------
-- Trips previously had no code at all — the UI displayed TRP-000008, derived
-- from the row's primary key, which is not a business identifier and jumps
-- whenever a row is deleted.
alter table public.transport_trips add column if not exists trip_code text;

with numbered as (
  select id,
         to_char(start_datetime at time zone 'Asia/Colombo', 'MMYY') as period,
         row_number() over (
           partition by to_char(start_datetime at time zone 'Asia/Colombo', 'MMYY')
           order by start_datetime, id
         ) as seq
  from public.transport_trips
  where trip_code is null
)
update public.transport_trips t
set trip_code = 'SIFT_' || lpad(n.seq::text, 4, '0') || '_' || n.period
from numbered n
where n.id = t.id;

-- Continue numbering after anything backfilled above.
insert into public.code_counters (entity, period, last_value)
select 'trip', to_char(start_datetime at time zone 'Asia/Colombo', 'MMYY'), count(*)
from public.transport_trips
group by 2
on conflict (entity, period)
  do update set last_value = greatest(public.code_counters.last_value, excluded.last_value);

create unique index if not exists transport_trips_trip_code_key on public.transport_trips (trip_code);

-- --------------------------------------------------------------------------
-- 4. Assign codes on insert
-- --------------------------------------------------------------------------
create or replace function public.assign_customer_code()
returns trigger as $$
begin
  if new.customer_code is null or new.customer_code = '' then
    new.customer_code := public.get_next_code(
      case when coalesce(new.is_one_time, false) then 'one_time_customer' else 'customer' end,
      'SIFC'
    );
  end if;
  return new;
end;
$$ language plpgsql security definer;

create or replace function public.assign_employee_code()
returns trigger as $$
begin
  if new.employee_code is null or new.employee_code = '' then
    new.employee_code := public.get_next_code('employee', 'SIFE');
  end if;
  return new;
end;
$$ language plpgsql security definer;

create or replace function public.assign_trip_code()
returns trigger as $$
begin
  if new.trip_code is null or new.trip_code = '' then
    new.trip_code := public.get_next_code('trip', 'SIFT');
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_assign_customer_code on public.customers;
create trigger trg_assign_customer_code
  before insert on public.customers
  for each row execute function public.assign_customer_code();

drop trigger if exists trg_assign_employee_code on public.employees;
create trigger trg_assign_employee_code
  before insert on public.employees
  for each row execute function public.assign_employee_code();

drop trigger if exists trg_assign_trip_code on public.transport_trips;
create trigger trg_assign_trip_code
  before insert on public.transport_trips
  for each row execute function public.assign_trip_code();

alter table public.transport_trips alter column trip_code set not null;
