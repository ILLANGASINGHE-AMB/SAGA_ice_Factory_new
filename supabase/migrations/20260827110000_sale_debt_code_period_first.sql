-- ==========================================================================
-- Sale and debt codes: period before the sequence
-- ==========================================================================
-- System_Functions.md now specifies:
--   Sales   SIF_0826_0001    08 = month, 26 = yy, 0001 = nth sale that month
--   Debts   SIFD_0826_0001
-- i.e. the reverse of the SIF_0001_0826 shape 20260826000000 introduced.
-- Trips keep SIFT_0001_0826 (sequence first) — the spec still documents them
-- that way, so only the two entities whose documented format changed move.
--
-- Existing rows are deliberately left on their old codes: a sale_code is what
-- a customer's printed bill and their /bill/<code> link carry, so rewriting
-- history would invalidate identifiers already handed out. The two shapes
-- cannot collide on the unique index — an old-shape code only reads as a new
-- one if its sequence is a valid MMYY, which needs a month of 00.
--
-- Counters are untouched: the numbering carries on where it left off, so
-- August continues ...SIF_0001_0826, SIF_0002_0826, then SIF_0826_0003.

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

  -- Sales and debts read period-first; trips keep sequence-first.
  if p_entity in ('sale', 'settlement') then
    return v_prefix || '_' || v_period || '_' || lpad(v_next::text, 4, '0');
  end if;
  return v_prefix || '_' || lpad(v_next::text, 4, '0') || '_' || v_period;
end;
$$ language plpgsql security definer;
