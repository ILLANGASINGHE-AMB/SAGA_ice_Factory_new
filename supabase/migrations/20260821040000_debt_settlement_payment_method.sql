-- Capture how a debt settlement was actually paid (Cash / Bank Transfer /
-- Cheque / Other) so the new Customer Profile "Payment History" view can
-- show a real Payment Method column instead of a hardcoded value.

alter table public.debt_settlements
  add column if not exists payment_method text not null default 'cash'
  check (payment_method in ('cash', 'bank_transfer', 'cheque', 'other'));

-- settle_debt_transaction gains an optional p_payment_method arg. The
-- existing 3-arg signature is dropped first so Postgres replaces it in
-- place rather than leaving both overloads registered (which would make
-- calls via PostgREST/supabase-js ambiguous).
drop function if exists public.settle_debt_transaction(bigint, numeric, text);

create or replace function public.settle_debt_transaction(
  p_debt_id bigint,
  p_amount_paid numeric,
  p_created_by text,
  p_payment_method text default 'cash'
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
    debt_id, customer_id, amount_paid, payment_method, settlement_date, created_by
  ) values (
    p_debt_id, v_customer_id, p_amount_paid, coalesce(p_payment_method, 'cash'), v_now, p_created_by
  ) returning id into v_settlement_id;

  return jsonb_build_object(
    'id', v_settlement_id,
    'settlement_code', v_settlement_code,
    'debt_id', p_debt_id,
    'customer_id', v_customer_id,
    'sale_id', v_sale_id,
    'amount_paid', p_amount_paid,
    'payment_method', coalesce(p_payment_method, 'cash'),
    'remaining_amount', v_new_remaining,
    'status', v_new_status,
    'settlement_date', v_now
  );
end;
$$ language plpgsql security definer;
