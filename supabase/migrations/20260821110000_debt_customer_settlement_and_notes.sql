-- Debts Tab redesign: "Debt by Customers" settles a customer's oldest
-- outstanding debts FIFO (mirroring the existing cash-to-old-debt-offset
-- convention) instead of one sale's debt at a time, and the settlement
-- form gains an optional note. payment_method gains 'card' alongside the
-- existing values (old rows keep whatever they already have).

alter table public.debt_settlements
  add column if not exists notes text;

alter table public.debt_settlements
  drop constraint if exists debt_settlements_payment_method_check;

alter table public.debt_settlements
  add constraint debt_settlements_payment_method_check
  check (payment_method in ('cash', 'bank_transfer', 'cheque', 'other', 'card'));

drop function if exists public.settle_debt_transaction(bigint, numeric, text, text);

create or replace function public.settle_debt_transaction(
  p_debt_id bigint,
  p_amount_paid numeric,
  p_created_by text,
  p_payment_method text default 'cash',
  p_notes text default null
) returns jsonb as $$
declare
  v_total numeric(10, 2);
  v_paid numeric(10, 2);
  v_remaining numeric(10, 2);
  v_customer_id bigint;
  v_sale_id bigint;
  v_new_paid numeric(10, 2);
  v_new_remaining numeric(10, 2);
  v_new_status text;
  v_settlement_code text;
  v_settlement_id bigint;
  v_now timestamp with time zone := timezone('utc'::text, now());
begin
  if p_amount_paid is null or p_amount_paid <= 0 then
    raise exception 'Settlement amount must be a positive number';
  end if;

  select total_amount, paid_amount, remaining_amount, customer_id, sale_id
    into v_total, v_paid, v_remaining, v_customer_id, v_sale_id
  from public.debts
  where id = p_debt_id
  for update;

  if not found then
    raise exception 'Debt record not found';
  end if;

  if p_amount_paid > v_remaining then
    raise exception 'Payment exceeds outstanding debt. Max payable: LKR %', v_remaining;
  end if;

  v_new_paid := v_paid + p_amount_paid;
  v_new_remaining := v_total - v_new_paid;
  v_new_status := case when v_new_remaining <= 0 then 'settled' else 'partial' end;

  update public.debts
  set paid_amount = v_new_paid,
      remaining_amount = v_new_remaining,
      status = v_new_status
  where id = p_debt_id;

  v_settlement_code := public.get_next_code('settlement', 'D');

  insert into public.debt_settlements (
    debt_id, customer_id, amount_paid, payment_method, notes, settlement_date, created_by
  ) values (
    p_debt_id, v_customer_id, p_amount_paid, coalesce(p_payment_method, 'cash'), p_notes, v_now, p_created_by
  ) returning id into v_settlement_id;

  return jsonb_build_object(
    'id', v_settlement_id,
    'settlement_code', v_settlement_code,
    'debt_id', p_debt_id,
    'customer_id', v_customer_id,
    'sale_id', v_sale_id,
    'amount_paid', p_amount_paid,
    'payment_method', coalesce(p_payment_method, 'cash'),
    'notes', p_notes,
    'remaining_amount', v_new_remaining,
    'status', v_new_status,
    'settlement_date', v_now
  );
end;
$$ language plpgsql security definer;
