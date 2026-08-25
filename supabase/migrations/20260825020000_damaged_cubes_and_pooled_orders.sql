-- ==========================================================================
-- Damaged Cubes (DGC) + pooled Ice Cubes ordering with Free Cubes
-- ==========================================================================
--
-- 1. DAMAGED CUBES — a fourth inventory line that behaves exactly like Brine
--    ('waste'): a stock count with no price, never sold, and excluded from
--    "Total Cubes" (which is Production + Resell only).
--
-- 2. POOLED ORDERING — New Order no longer asks the operator to split an
--    order between Production and Resell. They enter one quantity at one
--    rate, and stock is drawn Production-first, falling back to Resell once
--    Production hits zero. The MFC/RSC split is still recorded per sale_item
--    so inventory attribution and reporting are unchanged.
--
-- 3. FREE CUBES — cubes issued at no charge. They come out of the same pool
--    (Production first, then Resell) and are logged in Inventory History as
--    their own 'free_issue' transaction, but they are NOT billed and do NOT
--    count as cubes sold: sales.quantity stays billed-only and the free count
--    lives in sales.free_quantity.

-- --------------------------------------------------------------------------
-- Schema
-- --------------------------------------------------------------------------

alter table public.inventory drop constraint if exists inventory_type_check;
alter table public.inventory add constraint inventory_type_check
  check (type in ('manufactured', 'resell', 'waste', 'damaged'));

insert into public.inventory (code, type, quantity, price_per_cube) values
('DGC-0001', 'damaged', 0, null)
on conflict (code) do nothing;

alter table public.inventory_transactions drop constraint if exists inventory_transactions_transaction_type_check;
alter table public.inventory_transactions add constraint inventory_transactions_transaction_type_check
  check (transaction_type in ('add', 'sale_deduction', 'manual_removal', 'adjustment', 'free_issue'));

-- Cubes given away on this order. Kept separate from sales.quantity so that
-- "cubes sold" and every revenue-per-cube figure derived from it keep their
-- existing meaning.
alter table public.sales
  add column if not exists free_quantity integer not null default 0 check (free_quantity >= 0);

-- A free line has price_per_cube 0, which the original `> 0` check forbade.
alter table public.sale_items drop constraint if exists sale_items_price_per_cube_check;
alter table public.sale_items add constraint sale_items_price_per_cube_check
  check (price_per_cube >= 0);

alter table public.sale_items
  add column if not exists is_free boolean not null default false;

-- --------------------------------------------------------------------------
-- place_pooled_order_transaction
-- --------------------------------------------------------------------------
--
-- One paid quantity at one rate, plus an optional free quantity, both drawn
-- Production-first then Resell. Everything below happens in a single
-- transaction with the inventory rows locked, same as the multi-item version
-- it replaces: stock check, deduction, sale + items, cash-to-old-debt FIFO
-- offset, inventory audit rows, and the debt row for a credit order.

create or replace function public.place_pooled_order_transaction(
  p_customer_id bigint,
  p_quantity integer,
  p_price_per_cube numeric,
  p_free_quantity integer,
  p_payment_type text,
  p_created_by text
) returns jsonb as $$
declare
  v_mfc_id bigint;
  v_mfc_qty integer := 0;
  v_mfc_price numeric(10, 2);
  v_rsc_id bigint;
  v_rsc_qty integer := 0;
  v_rsc_price numeric(10, 2);

  v_paid integer := coalesce(p_quantity, 0);
  v_free integer := coalesce(p_free_quantity, 0);
  v_needed integer;

  -- Allocation: paid cubes are served first, then free cubes, both taking
  -- Production before Resell. Serving paid first keeps the billed portion on
  -- the cheaper manufactured stock whenever the order spans both.
  v_paid_mfc integer := 0;
  v_paid_rsc integer := 0;
  v_free_mfc integer := 0;
  v_free_rsc integer := 0;
  v_mfc_left integer;

  v_customer_price numeric(10, 2);
  v_resolved_price numeric(10, 2);

  v_sale_code text;
  v_sale_id bigint;
  v_total_amount numeric(10, 2) := 0;
  v_now timestamp with time zone := timezone('utc'::text, now());

  v_mfc_taken integer;
  v_rsc_taken integer;

  v_debt_id bigint := null;
  v_cash_remaining numeric(10, 2);
  v_applied_to_old_debt numeric(10, 2) := 0;
  v_old_debt record;
  v_apply_amt numeric(10, 2);
  v_old_new_remaining numeric(10, 2);
  v_old_new_status text;
begin
  if p_customer_id is null then raise exception 'Customer is required'; end if;
  if p_payment_type not in ('cash', 'debt') then raise exception 'Invalid payment type'; end if;
  if v_paid < 0 or v_free < 0 then raise exception 'Quantities cannot be negative'; end if;
  if v_paid + v_free = 0 then raise exception 'Enter a cube quantity or a free cube quantity'; end if;

  v_needed := v_paid + v_free;

  -- 1. Lock both pool rows in a fixed order (manufactured, then resell) so
  --    concurrent orders can never deadlock against each other.
  select id, quantity, price_per_cube into v_mfc_id, v_mfc_qty, v_mfc_price
  from public.inventory where type = 'manufactured' for update;
  if not found then raise exception 'Inventory item for Production not found'; end if;

  select id, quantity, price_per_cube into v_rsc_id, v_rsc_qty, v_rsc_price
  from public.inventory where type = 'resell' for update;
  if not found then raise exception 'Inventory item for Resell not found'; end if;

  if v_mfc_qty + v_rsc_qty < v_needed then
    raise exception 'Insufficient stock. Available: % cubes (Production % + Resell %)',
      v_mfc_qty + v_rsc_qty, v_mfc_qty, v_rsc_qty;
  end if;

  -- 2. Allocate Production first, then Resell — paid cubes before free ones.
  v_paid_mfc := least(v_paid, v_mfc_qty);
  v_paid_rsc := v_paid - v_paid_mfc;

  v_mfc_left := v_mfc_qty - v_paid_mfc;
  v_free_mfc := least(v_free, v_mfc_left);
  v_free_rsc := v_free - v_free_mfc;

  v_mfc_taken := v_paid_mfc + v_free_mfc;
  v_rsc_taken := v_paid_rsc + v_free_rsc;

  -- 3. Resolve the billed rate. An admin's explicit rate wins; everyone else
  --    gets this customer's custom Production rate when one is set, and the
  --    live Production price otherwise. One rate applies to the whole paid
  --    quantity regardless of which pool it was drawn from.
  select price_per_cube into v_customer_price
  from public.customer_cube_prices
  where customer_id = p_customer_id and cube_type = 'manufactured';

  if public.is_admin() and p_price_per_cube is not null and p_price_per_cube > 0 then
    v_resolved_price := p_price_per_cube;
  else
    v_resolved_price := coalesce(v_customer_price, v_mfc_price);
  end if;

  if v_paid > 0 and (v_resolved_price is null or v_resolved_price <= 0) then
    raise exception 'Price per cube must be set before placing a sale';
  end if;

  v_total_amount := coalesce(v_resolved_price, 0) * v_paid;

  -- 4. Deduct the pools
  if v_mfc_taken > 0 then
    update public.inventory set quantity = v_mfc_qty - v_mfc_taken, updated_at = v_now where id = v_mfc_id;
  end if;
  if v_rsc_taken > 0 then
    update public.inventory set quantity = v_rsc_qty - v_rsc_taken, updated_at = v_now where id = v_rsc_id;
  end if;

  v_sale_code := public.get_next_code('sale', 'S');

  -- 5. Cash-to-old-debt FIFO offset (cash orders only) — unchanged logic,
  --    applied against this order's total.
  if p_payment_type = 'cash' then
    v_cash_remaining := v_total_amount;

    for v_old_debt in
      select id, remaining_amount
      from public.debts
      where customer_id = p_customer_id
        and status in ('pending', 'partial')
      order by created_at asc
      for update
    loop
      exit when v_cash_remaining <= 0;

      v_apply_amt := least(v_cash_remaining, v_old_debt.remaining_amount);
      v_old_new_remaining := v_old_debt.remaining_amount - v_apply_amt;
      v_old_new_status := case when v_old_new_remaining <= 0 then 'settled' else 'partial' end;

      update public.debts
      set paid_amount      = paid_amount + v_apply_amt,
          remaining_amount = v_old_new_remaining,
          status           = v_old_new_status,
          created_at       = case when v_old_new_remaining > 0 then v_now else created_at end
      where id = v_old_debt.id;

      insert into public.debt_settlements (debt_id, customer_id, amount_paid, settlement_date, created_by)
      values (v_old_debt.id, p_customer_id, v_apply_amt, v_now,
              p_created_by || ' (auto-applied from sale ' || v_sale_code || ')');

      v_applied_to_old_debt := v_applied_to_old_debt + v_apply_amt;
      v_cash_remaining := v_cash_remaining - v_apply_amt;
    end loop;
  end if;

  -- 6. Sales header. quantity is the BILLED count; free cubes are counted
  --    separately so "cubes sold" keeps its meaning. cube_type/price_per_cube
  --    are populated only when the paid portion came from a single pool.
  insert into public.sales (
    sale_code, customer_id, cube_type, quantity, free_quantity, price_per_cube,
    total_amount, payment_type, sale_date, created_by
  ) values (
    v_sale_code, p_customer_id,
    case when v_paid_mfc > 0 and v_paid_rsc > 0 then null
         when v_paid_rsc > 0 then 'resell'
         when v_paid_mfc > 0 then 'manufactured'
         else null end,
    v_paid, v_free,
    case when v_paid > 0 then v_resolved_price else null end,
    v_total_amount, p_payment_type, v_now, p_created_by
  ) returning id into v_sale_id;

  -- 7. One line per (pool, paid/free) combination that was actually used.
  if v_paid_mfc > 0 then
    insert into public.sale_items (sale_id, cube_type, quantity, price_per_cube, subtotal, is_free)
    values (v_sale_id, 'manufactured', v_paid_mfc, v_resolved_price, v_resolved_price * v_paid_mfc, false);
  end if;
  if v_paid_rsc > 0 then
    insert into public.sale_items (sale_id, cube_type, quantity, price_per_cube, subtotal, is_free)
    values (v_sale_id, 'resell', v_paid_rsc, v_resolved_price, v_resolved_price * v_paid_rsc, false);
  end if;
  if v_free_mfc > 0 then
    insert into public.sale_items (sale_id, cube_type, quantity, price_per_cube, subtotal, is_free)
    values (v_sale_id, 'manufactured', v_free_mfc, 0, 0, true);
  end if;
  if v_free_rsc > 0 then
    insert into public.sale_items (sale_id, cube_type, quantity, price_per_cube, subtotal, is_free)
    values (v_sale_id, 'resell', v_free_rsc, 0, 0, true);
  end if;

  -- 8. Inventory audit. Paid and free movements are logged separately so
  --    Inventory History shows what was sold and what was given away, rather
  --    than one merged deduction.
  if v_paid_mfc > 0 then
    insert into public.inventory_transactions (inventory_id, transaction_type, quantity_change, previous_quantity, new_quantity, reference_code, created_by)
    values (v_mfc_id, 'sale_deduction', -v_paid_mfc, v_mfc_qty, v_mfc_qty - v_paid_mfc, v_sale_code, p_created_by);
  end if;
  if v_free_mfc > 0 then
    insert into public.inventory_transactions (inventory_id, transaction_type, quantity_change, previous_quantity, new_quantity, reference_code, created_by)
    values (v_mfc_id, 'free_issue', -v_free_mfc, v_mfc_qty - v_paid_mfc, v_mfc_qty - v_mfc_taken, v_sale_code, p_created_by);
  end if;
  if v_paid_rsc > 0 then
    insert into public.inventory_transactions (inventory_id, transaction_type, quantity_change, previous_quantity, new_quantity, reference_code, created_by)
    values (v_rsc_id, 'sale_deduction', -v_paid_rsc, v_rsc_qty, v_rsc_qty - v_paid_rsc, v_sale_code, p_created_by);
  end if;
  if v_free_rsc > 0 then
    insert into public.inventory_transactions (inventory_id, transaction_type, quantity_change, previous_quantity, new_quantity, reference_code, created_by)
    values (v_rsc_id, 'free_issue', -v_free_rsc, v_rsc_qty - v_paid_rsc, v_rsc_qty - v_rsc_taken, v_sale_code, p_created_by);
  end if;

  -- 9. Credit order — one debt row for the billed total. A wholly free
  --    issue has nothing to owe, so no debt is created.
  if p_payment_type = 'debt' and v_total_amount > 0 then
    insert into public.debts (
      sale_id, customer_id, total_amount, paid_amount, remaining_amount, status, created_at
    ) values (
      v_sale_id, p_customer_id, v_total_amount, 0, v_total_amount, 'pending', v_now
    ) returning id into v_debt_id;
  end if;

  return jsonb_build_object(
    'id', v_sale_id,
    'sale_code', v_sale_code,
    'customer_id', p_customer_id,
    'quantity', v_paid,
    'free_quantity', v_free,
    'price_per_cube', v_resolved_price,
    'total_amount', v_total_amount,
    'payment_type', p_payment_type,
    'sale_date', v_now,
    'debt_id', v_debt_id,
    'applied_to_old_debt', v_applied_to_old_debt,
    'allocation', jsonb_build_object(
      'paid_manufactured', v_paid_mfc,
      'paid_resell', v_paid_rsc,
      'free_manufactured', v_free_mfc,
      'free_resell', v_free_rsc
    )
  );
end;
$$ language plpgsql security definer;

-- --------------------------------------------------------------------------
-- get_public_bill: carry the free-cube fields through to the shared bill
-- --------------------------------------------------------------------------
--
-- The customer-facing bill link renders the same PDF as the in-app one, so it
-- needs free_quantity and sale_items.is_free or free cubes silently vanish
-- from the copy the customer actually opens. Body is otherwise unchanged.

create or replace function public.get_public_bill(p_sale_code text)
returns jsonb as $$
declare
  v_sale public.sales%rowtype;
  v_customer public.customers%rowtype;
  v_settings public.settings%rowtype;
  v_age_hours numeric;
begin
  if p_sale_code is null or length(trim(p_sale_code)) = 0 then
    return jsonb_build_object('status', 'not_found');
  end if;

  select * into v_sale
  from public.sales
  where sale_code = trim(p_sale_code)
  limit 1;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  v_age_hours := extract(epoch from (timezone('utc'::text, now()) - v_sale.sale_date)) / 3600.0;
  if v_age_hours >= 24 then
    -- Expired: acknowledge the bill existed, but return none of its content.
    return jsonb_build_object('status', 'expired', 'sale_code', v_sale.sale_code);
  end if;

  select * into v_customer from public.customers where id = v_sale.customer_id;
  select * into v_settings from public.settings order by id limit 1;

  return jsonb_build_object(
    'status', 'ok',
    'sale', jsonb_build_object(
      'id', v_sale.id,
      'sale_code', v_sale.sale_code,
      'cube_type', v_sale.cube_type,
      'quantity', v_sale.quantity,
      'free_quantity', v_sale.free_quantity,
      'price_per_cube', v_sale.price_per_cube,
      'total_amount', v_sale.total_amount,
      'payment_type', v_sale.payment_type,
      'sale_date', v_sale.sale_date,
      'bill_pdf_url', v_sale.bill_pdf_url,
      'customer', case
        when v_customer.id is null then null
        else jsonb_build_object(
          'name', v_customer.name,
          'customer_code', v_customer.customer_code,
          'whatsapp_number', v_customer.whatsapp_number
        )
      end,
      'sale_items', coalesce(
        (select jsonb_agg(jsonb_build_object(
           'cube_type', si.cube_type,
           'quantity', si.quantity,
           'price_per_cube', si.price_per_cube,
           'subtotal', si.subtotal,
           'is_free', si.is_free
         ) order by si.id)
         from public.sale_items si
         where si.sale_id = v_sale.id),
        '[]'::jsonb
      )
    ),
    'settings', jsonb_build_object(
      'company_name', coalesce(v_settings.company_name, 'Sagacious Ice Factory'),
      'company_address', coalesce(v_settings.company_address, ''),
      'company_phone', coalesce(v_settings.company_phone, ''),
      'company_email', coalesce(v_settings.company_email, ''),
      'logo_url', v_settings.logo_url
    )
  );
end;
$$ language plpgsql security definer set search_path = public;

-- Anonymous access is the entire point — this is the link a customer opens
-- from WhatsApp without logging in.
grant execute on function public.get_public_bill(text) to anon, authenticated;
