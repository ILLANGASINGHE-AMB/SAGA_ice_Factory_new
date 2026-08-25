-- ==========================================================================
-- Staff can price Ice Cubes: New Order override and Inventory price editing
-- ==========================================================================
--
-- Both places a cube rate is set were restricted to admins:
--   1. place_pooled_order_transaction only honored a caller-supplied
--      p_price_per_cube when public.is_admin() was true — a staff operator's
--      typed override was silently discarded and the customer/inventory
--      default price was used instead.
--   2. update_inventory_price hard-refused any non-admin caller outright.
--
-- Both now allow any authenticated user. The UI-side admin-only gates on
-- these two inputs are removed to match (see SalesPage.jsx / InventoryPage.jsx).

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

  -- 3. Resolve the billed rate. Any authenticated caller's explicit rate
  --    wins when one is supplied (staff and admins alike can override the
  --    per-order price now); otherwise it falls back to this customer's
  --    custom Production rate when one is set, and the live Production price
  --    otherwise. One rate applies to the whole paid quantity regardless of
  --    which pool it was drawn from.
  select price_per_cube into v_customer_price
  from public.customer_cube_prices
  where customer_id = p_customer_id and cube_type = 'manufactured';

  if p_price_per_cube is not null and p_price_per_cube > 0 then
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

      -- is_auto_applied: this reduces the debt but is NOT new money at the
      -- till — the cash was already counted as this sale. See
      -- 20260825030000_auto_applied_settlement_flag.sql.
      insert into public.debt_settlements (debt_id, customer_id, amount_paid, settlement_date, created_by, is_auto_applied)
      values (v_old_debt.id, p_customer_id, v_apply_amt, v_now,
              p_created_by || ' (auto-applied from sale ' || v_sale_code || ')', true);

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
-- update_inventory_price: drop the admin-only check
-- --------------------------------------------------------------------------

create or replace function public.update_inventory_price(p_id bigint, p_price numeric)
returns void as $$
begin
  if p_price <= 0 then
    raise exception 'Price must be a positive value';
  end if;

  update public.inventory
  set price_per_cube = p_price,
      updated_at = timezone('utc'::text, now())
  where id = p_id;
end;
$$ language plpgsql security definer;
