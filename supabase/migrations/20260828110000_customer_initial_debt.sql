-- ==========================================================================
-- Customer initial debt (opening balance)
-- ==========================================================================
--
-- A customer arriving from the old paper book already owes something, and
-- until now there was no way to say so: every debt had to come from a sale
-- placed in this system. Operators either invented a fake order (inflating
-- revenue and stock movements) or left the balance out of the ledger entirely.
--
-- An initial debt is a debt row with no sale behind it. That shape is not new
-- — ledger_consistency_report's `customer_outstanding_vs_ledger` check already
-- counts `debts where sale_id is null` as credit taken, precisely so a
-- hand-entered opening balance does not read as corruption. This migration
-- makes it a first-class, admin-controlled action.
--
-- Once written it is an ordinary debt in every respect: it ages, it is picked
-- up FIFO by settle_customer_debt_transaction, a later cash order clears it
-- through apply_cash_to_old_debts, and it appears in Debt History and on the
-- customer's statement like any other. Nothing special-cases it downstream.

alter table public.debts
  add column if not exists is_opening_balance boolean not null default false;

-- Why the balance was carried forward — "brought forward from the 2025 book",
-- a reference to the old ledger page, and so on. A sale-backed debt explains
-- itself through its invoice; this one has nothing else to point at.
alter table public.debts
  add column if not exists notes text;

-- One opening balance per customer. Entering a second would silently double
-- the receivable with nothing to reconcile it against, and it is exactly the
-- mistake a distracted operator makes twice.
create unique index if not exists idx_debts_one_opening_balance_per_customer
  on public.debts(customer_id) where is_opening_balance;

create or replace function public.add_customer_initial_debt(
  p_customer_id bigint,
  p_amount numeric,
  p_incurred_at timestamptz default null,
  p_notes text default null,
  p_created_by text default 'Admin'
) returns jsonb as $$
declare
  v_id bigint;
  v_now timestamptz := timezone('utc'::text, now());
  v_at timestamptz := coalesce(p_incurred_at, v_now);
  v_amount numeric(10, 2) := round(coalesce(p_amount, 0), 2);
  v_customer_code text;
begin
  -- Writing straight into receivables is an admin action. The RLS policy on
  -- `debts` allows any authenticated insert (the order RPCs need it), so this
  -- gate has to be here rather than relying on the table.
  if not public.is_admin() then
    raise exception 'Only admins can set a customer''s initial debt';
  end if;

  if p_customer_id is null then
    raise exception 'Customer is required';
  end if;
  if v_amount <= 0 then
    raise exception 'Initial debt must be a positive amount';
  end if;

  select customer_code into v_customer_code from public.customers where id = p_customer_id;
  if not found then
    raise exception 'Customer not found';
  end if;

  -- A future incurrence date would place the debt outside every aging bucket
  -- and sort ahead of real orders in the FIFO queue.
  if v_at > v_now then
    raise exception 'An initial debt cannot be dated in the future';
  end if;

  if exists (
    select 1 from public.debts
     where customer_id = p_customer_id and is_opening_balance
  ) then
    raise exception 'This customer already has an initial debt recorded';
  end if;

  -- created_at is the incurrence date and drives both aging and the FIFO
  -- order, so a balance carried forward from months ago must be dated when it
  -- was actually taken on — not today, which would park an old debt in the
  -- "0-30 days (current)" bucket and let it jump newer invoices in the queue.
  insert into public.debts (
    sale_id, customer_id, total_amount, paid_amount, remaining_amount,
    status, created_at, last_activity_at, is_opening_balance, notes
  ) values (
    null, p_customer_id, v_amount, 0, v_amount,
    'pending', v_at, v_now, true, nullif(trim(coalesce(p_notes, '')), '')
  ) returning id into v_id;

  return jsonb_build_object(
    'id', v_id,
    'customer_id', p_customer_id,
    'customer_code', v_customer_code,
    'total_amount', v_amount,
    'created_at', v_at,
    'created_by', coalesce(p_created_by, 'Admin')
  );
end;
$$ language plpgsql security definer set search_path = public;

-- Removing a mistyped opening balance, while it is still untouched.
--
-- Once a payment has landed on it the row is load-bearing: deleting it would
-- cascade the settlement away, and the money the customer actually handed over
-- would vanish from Cash Balance with it. At that point the balance has to be
-- corrected the way any other wrong debt is — by settling it.
create or replace function public.delete_customer_initial_debt(p_debt_id bigint)
returns void as $$
declare
  v_debt public.debts%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only admins can remove a customer''s initial debt';
  end if;

  select * into v_debt from public.debts where id = p_debt_id for update;
  if not found then
    raise exception 'Debt record not found';
  end if;
  if not v_debt.is_opening_balance then
    raise exception 'This is not an initial debt';
  end if;
  if coalesce(v_debt.paid_amount, 0) > 0
     or exists (select 1 from public.debt_settlements where debt_id = p_debt_id) then
    raise exception 'This initial debt has payments against it and can no longer be removed';
  end if;

  delete from public.debts where id = p_debt_id;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function public.add_customer_initial_debt(bigint, numeric, timestamptz, text, text) to authenticated;
grant execute on function public.delete_customer_initial_debt(bigint) to authenticated;
