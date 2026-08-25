-- ==========================================================================
-- FIN-17: a cash order must not write off debt it did not pay for
-- ==========================================================================
-- Reported case:
--
--   Customer owes 25,000 on an earlier credit order.
--   They place a 35,000 order and pay 35,000 cash.
--   FIFO applies the first 25,000 to the old invoice, clearing it.
--   Only 10,000 of that cash is left for the 35,000 order they just took.
--   => they still owe 25,000, now against the NEW invoice.
--
-- What the system did instead: apply_cash_to_old_debts cleared the old
-- 25,000, and the sale was booked as a fully paid cash order with no debt of
-- its own. The customer ended up owing NOTHING -- 60,000 of ice handed over
-- for 35,000 of cash, with 25,000 of receivables destroyed. The same rupees
-- were spent twice: once paying for the new order, once settling the old one.
--
-- The general invariant, and the cheapest way to test this by hand:
--
--   A CASH ORDER NEVER CHANGES A CUSTOMER'S TOTAL OUTSTANDING.
--
-- They pay exactly what the order is worth, so the balance is a wash. FIFO
-- only moves which invoice carries the debt, never how much is carried:
--
--   prior 25,000 + cash order 35,000 -> applied 25,000, shortfall 25,000 -> 25,000 owed
--   prior 10,000 + cash order 35,000 -> applied 10,000, shortfall 10,000 -> 10,000 owed
--   prior 50,000 + cash order 35,000 -> applied 35,000, shortfall 35,000 -> 50,000 owed
--   prior      0 + cash order 35,000 -> applied      0, shortfall      0 ->      0 owed
--
-- Cash Balance is untouched by this migration and stays correct: the sale row
-- still carries its full 35,000 into cashSalesTotal, and every offset
-- settlement remains flagged is_auto_applied, which is what stops
-- cashBankMath counting the same money twice.
--
-- Both writers of the offset are patched -- placing an order and re-pricing
-- one -- so the two paths cannot drift.
-- --------------------------------------------------------------------------

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
  v_rsc_id bigint;
  v_rsc_qty integer := 0;

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

  v_resolved_price numeric(10, 2);

  v_sale_code text;
  v_sale_id bigint;
  v_total_amount numeric(10, 2) := 0;
  v_now timestamp with time zone := timezone('utc'::text, now());

  v_mfc_taken integer;
  v_rsc_taken integer;

  v_debt_id bigint := null;
  v_applied_to_old_debt numeric(10, 2) := 0;
begin
  if p_customer_id is null then raise exception 'Customer is required'; end if;
  if p_payment_type not in ('cash', 'debt') then raise exception 'Invalid payment type'; end if;
  if v_paid < 0 or v_free < 0 then raise exception 'Quantities cannot be negative'; end if;
  if v_paid + v_free = 0 then raise exception 'Enter a cube quantity or a free cube quantity'; end if;

  v_needed := v_paid + v_free;

  -- 1. Lock both pool rows in a fixed order (manufactured, then resell) so
  --    concurrent orders can never deadlock against each other.
  select id, quantity into v_mfc_id, v_mfc_qty
  from public.inventory where type = 'manufactured' for update;
  if not found then raise exception 'Inventory item for Production not found'; end if;

  select id, quantity into v_rsc_id, v_rsc_qty
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

  -- 3. Resolve the billed rate through the shared resolver — explicit rate,
  --    else this customer's negotiated rate, else the Production list price.
  v_resolved_price := public.resolve_cube_price(p_customer_id, p_price_per_cube);

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

  -- 5. Sales header. quantity is the BILLED count; free cubes are counted
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

  -- 6. One line per (pool, paid/free) combination that was actually used.
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

  -- 7. Inventory audit. Paid and free movements are logged separately so
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

  -- 8. Credit order — one debt row for the billed total. A wholly free
  --    issue has nothing to owe, so no debt is created.
  if p_payment_type = 'debt' and v_total_amount > 0 then
    insert into public.debts (
      sale_id, customer_id, total_amount, paid_amount, remaining_amount, status, created_at, last_activity_at
    ) values (
      v_sale_id, p_customer_id, v_total_amount, 0, v_total_amount, 'pending', v_now, v_now
    ) returning id into v_debt_id;
  end if;

  -- 9. Cash-to-old-debt FIFO offset (cash orders only). Runs after the sale
  --    exists so every settlement it writes carries source_sale_id and can be
  --    reversed if this sale is later edited or deleted.
  if p_payment_type = 'cash' then
    v_applied_to_old_debt := public.apply_cash_to_old_debts(
      p_customer_id, v_total_amount, v_sale_id, v_sale_code, p_created_by
    );

    -- Cash diverted to older invoices is cash THIS order did not receive, so
    -- an equal shortfall opens against it.
    --
    -- Without this the same rupees were spent twice: the sale was booked as
    -- fully paid AND the old debt was written off. A customer holding a
    -- LKR 25,000 debt who then placed a LKR 35,000 cash order walked away
    -- owing nothing -- LKR 60,000 of ice for LKR 35,000 of cash, with
    -- LKR 25,000 of receivables silently destroyed.
    --
    -- The invariant this restores: A CASH ORDER NEVER CHANGES A CUSTOMER'S
    -- TOTAL OUTSTANDING. They hand over exactly what the order is worth, so
    -- the balance is a wash; FIFO only moves WHICH invoice carries it (oldest
    -- cleared, shortfall opened on this one), never how much is carried.
    --   before: 25,000 owed on the old invoice
    --   pay   : 35,000 cash -> 25,000 clears the old invoice, 10,000 lands here
    --   after : 25,000 owed on THIS invoice (35,000 billed - 10,000 received)
    -- Cash Balance still receives the full 35,000: the sale row is unchanged
    -- and every offset settlement is flagged is_auto_applied, which is what
    -- keeps cashBankMath from counting the same money a second time.

    -- total_amount is the shortfall, not the order total, and paid_amount stays
    -- 0 with no settlement row behind it. That is deliberate: the ledger's own
    -- consistency check (`debt_paid_amount_vs_settlements`) requires
    -- paid_amount to equal the sum of a debt's settlements, so recording the
    -- LKR 10,000 that DID land here as `paid` would demand a settlement row --
    -- and delete_sale_transaction would then capture that row twice in one
    -- trash snapshot (once under this debt, once as an auto-applied offset),
    -- making the sale impossible to restore. The shortfall alone is the figure
    -- every balance actually needs.
    if v_applied_to_old_debt > 0 then
      insert into public.debts (
        sale_id, customer_id, total_amount, paid_amount, remaining_amount,
        status, created_at, last_activity_at
      ) values (
        v_sale_id, p_customer_id, v_applied_to_old_debt, 0, v_applied_to_old_debt,
        'pending', v_now, v_now
      ) returning id into v_debt_id;
    end if;
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
$$ language plpgsql security definer set search_path = public;

create or replace function public.edit_sale_transaction(
  p_sale_id bigint,
  p_quantity integer,
  p_price_per_cube numeric,
  p_free_quantity integer,
  p_payment_type text,
  p_edited_by text
) returns jsonb as $$
declare
  v_old_payment_type text;
  v_customer_id bigint;
  v_sale_code text;

  v_paid integer := coalesce(p_quantity, 0);
  v_free integer := coalesce(p_free_quantity, 0);
  v_needed integer;

  v_mfc_id bigint;
  v_mfc_qty integer := 0;
  v_rsc_id bigint;
  v_rsc_qty integer := 0;

  -- What this sale currently holds out of each pool (paid + free together).
  v_restore_mfc integer := 0;
  v_restore_rsc integer := 0;
  v_avail_mfc integer;
  v_avail_rsc integer;

  v_paid_mfc integer := 0;
  v_paid_rsc integer := 0;
  v_free_mfc integer := 0;
  v_free_rsc integer := 0;
  v_mfc_left integer;

  v_mfc_final integer;
  v_rsc_final integer;

  v_resolved_price numeric(10, 2);
  v_new_total numeric(10, 2);
  v_now timestamp with time zone := timezone('utc'::text, now());

  v_debt_id bigint;
  v_debt_paid numeric(10, 2);
  v_new_remaining numeric(10, 2);
  v_new_status text;
  v_reversed numeric(10, 2) := 0;
  v_applied_to_old_debt numeric(10, 2) := 0;
begin
  if v_paid < 0 or v_free < 0 then raise exception 'Quantities cannot be negative'; end if;
  if v_paid + v_free = 0 then raise exception 'Enter a cube quantity or a free cube quantity'; end if;
  if p_payment_type not in ('cash', 'debt') then raise exception 'Invalid payment type'; end if;

  v_needed := v_paid + v_free;

  -- 1. Lock and read the existing sale
  select payment_type, customer_id, sale_code
    into v_old_payment_type, v_customer_id, v_sale_code
  from public.sales
  where id = p_sale_id
  for update;

  if not found then raise exception 'Sale record not found'; end if;

  -- 2. Lock both pools in the same fixed order every other path uses
  select id, quantity into v_mfc_id, v_mfc_qty
  from public.inventory where type = 'manufactured' for update;
  if not found then raise exception 'Inventory item for Production not found'; end if;

  select id, quantity into v_rsc_id, v_rsc_qty
  from public.inventory where type = 'resell' for update;
  if not found then raise exception 'Inventory item for Resell not found'; end if;

  -- 3. What the sale currently holds, taken from its line items — the only
  --    record that covers free cubes and both-pool orders.
  select
    coalesce(sum(quantity) filter (where cube_type = 'manufactured'), 0),
    coalesce(sum(quantity) filter (where cube_type = 'resell'), 0)
    into v_restore_mfc, v_restore_rsc
  from public.sale_items
  where sale_id = p_sale_id;

  v_avail_mfc := v_mfc_qty + v_restore_mfc;
  v_avail_rsc := v_rsc_qty + v_restore_rsc;

  if v_avail_mfc + v_avail_rsc < v_needed then
    raise exception 'Insufficient stock. Available: % cubes (Production % + Resell %)',
      v_avail_mfc + v_avail_rsc, v_avail_mfc, v_avail_rsc;
  end if;

  -- 4. Re-allocate exactly as a fresh order would: paid first, Production
  --    before Resell.
  v_paid_mfc := least(v_paid, v_avail_mfc);
  v_paid_rsc := v_paid - v_paid_mfc;

  v_mfc_left := v_avail_mfc - v_paid_mfc;
  v_free_mfc := least(v_free, v_mfc_left);
  v_free_rsc := v_free - v_free_mfc;

  v_mfc_final := v_avail_mfc - v_paid_mfc - v_free_mfc;
  v_rsc_final := v_avail_rsc - v_paid_rsc - v_free_rsc;

  -- 5. Rate: explicit (any operator may price — 20260825050000), else this
  --    customer's negotiated rate, else the list price.
  v_resolved_price := public.resolve_cube_price(v_customer_id, p_price_per_cube);

  if v_paid > 0 and (v_resolved_price is null or v_resolved_price <= 0) then
    raise exception 'Price per cube must be a valid positive number';
  end if;

  v_new_total := coalesce(v_resolved_price, 0) * v_paid;

  -- 6. Apply the stock movement and log it as one net adjustment per pool.
  if v_mfc_final <> v_mfc_qty then
    update public.inventory set quantity = v_mfc_final, updated_at = v_now where id = v_mfc_id;
    insert into public.inventory_transactions (inventory_id, transaction_type, quantity_change, previous_quantity, new_quantity, reference_code, created_by)
    values (v_mfc_id, 'adjustment', v_mfc_final - v_mfc_qty, v_mfc_qty, v_mfc_final, v_sale_code || ' (edit)', p_edited_by);
  end if;

  if v_rsc_final <> v_rsc_qty then
    update public.inventory set quantity = v_rsc_final, updated_at = v_now where id = v_rsc_id;
    insert into public.inventory_transactions (inventory_id, transaction_type, quantity_change, previous_quantity, new_quantity, reference_code, created_by)
    values (v_rsc_id, 'adjustment', v_rsc_final - v_rsc_qty, v_rsc_qty, v_rsc_final, v_sale_code || ' (edit)', p_edited_by);
  end if;

  -- 7. Rewrite the line items so header and items can never disagree.
  delete from public.sale_items where sale_id = p_sale_id;

  if v_paid_mfc > 0 then
    insert into public.sale_items (sale_id, cube_type, quantity, price_per_cube, subtotal, is_free)
    values (p_sale_id, 'manufactured', v_paid_mfc, v_resolved_price, v_resolved_price * v_paid_mfc, false);
  end if;
  if v_paid_rsc > 0 then
    insert into public.sale_items (sale_id, cube_type, quantity, price_per_cube, subtotal, is_free)
    values (p_sale_id, 'resell', v_paid_rsc, v_resolved_price, v_resolved_price * v_paid_rsc, false);
  end if;
  if v_free_mfc > 0 then
    insert into public.sale_items (sale_id, cube_type, quantity, price_per_cube, subtotal, is_free)
    values (p_sale_id, 'manufactured', v_free_mfc, 0, 0, true);
  end if;
  if v_free_rsc > 0 then
    insert into public.sale_items (sale_id, cube_type, quantity, price_per_cube, subtotal, is_free)
    values (p_sale_id, 'resell', v_free_rsc, 0, 0, true);
  end if;

  -- 8. Header
  update public.sales
  set cube_type = case when v_paid_mfc > 0 and v_paid_rsc > 0 then null
                       when v_paid_rsc > 0 then 'resell'
                       when v_paid_mfc > 0 then 'manufactured'
                       else null end,
      quantity = v_paid,
      free_quantity = v_free,
      price_per_cube = case when v_paid > 0 then v_resolved_price else null end,
      total_amount = v_new_total,
      payment_type = p_payment_type,
      bill_pdf_url = null
  where id = p_sale_id;

  -- 9. Undo the cash-to-old-debt offset this sale funded. It was sized
  --    against the OLD total; leaving it standing writes off debt with money
  --    the corrected sale no longer contains.
  v_reversed := public.reverse_auto_applied_settlements(p_sale_id);

  -- 10. Reconcile this sale's own debt against the new terms/total.
  select id, paid_amount into v_debt_id, v_debt_paid
  from public.debts
  where sale_id = p_sale_id
  for update;

  if p_payment_type = 'debt' then
    if v_debt_id is not null then
      v_new_remaining := v_new_total - coalesce(v_debt_paid, 0);
      if v_new_remaining < 0 then
        raise exception 'New total (LKR %) is less than the LKR % already paid against this debt', v_new_total, v_debt_paid;
      end if;
      v_new_status := case when v_new_remaining <= 0 then 'settled'
                           when coalesce(v_debt_paid, 0) > 0 then 'partial'
                           else 'pending' end;

      update public.debts
      set total_amount = v_new_total,
          remaining_amount = v_new_remaining,
          status = v_new_status,
          last_activity_at = v_now
      where id = v_debt_id;
    elsif v_new_total > 0 then
      -- cash -> debt, or a previously free-only order that now bills.
      insert into public.debts (sale_id, customer_id, total_amount, paid_amount, remaining_amount, status, created_at, last_activity_at)
      values (p_sale_id, v_customer_id, v_new_total, 0, v_new_total, 'pending', v_now, v_now)
      returning id into v_debt_id;
    end if;
  else
    -- Converting to cash: only safe to drop the debt if nothing has been
    -- collected against it yet.
    -- A cash order can now carry a debt of its own (the shortfall left when
    -- its cash was diverted to older invoices), so this branch is reached for
    -- cash -> cash edits too, not just debt -> cash conversions. Either way the
    -- rule is the same: the row is only safe to drop if nothing has been
    -- collected against it.
    if v_debt_id is not null then
      if coalesce(v_debt_paid, 0) > 0 then
        raise exception 'Cannot re-price this sale: LKR % has already been settled against the debt it carries', v_debt_paid;
      end if;
      delete from public.debts where id = v_debt_id;
      v_debt_id := null;
    end if;

    -- ...and then this cash behaves like any other cash order: it pays down
    -- the customer's oldest outstanding debts first.
    v_applied_to_old_debt := public.apply_cash_to_old_debts(
      v_customer_id, v_new_total, p_sale_id, v_sale_code, p_edited_by
    );

    -- Cash diverted to older invoices is cash THIS order did not receive, so
    -- an equal shortfall opens against it.
    --
    -- Without this the same rupees were spent twice: the sale was booked as
    -- fully paid AND the old debt was written off. A customer holding a
    -- LKR 25,000 debt who then placed a LKR 35,000 cash order walked away
    -- owing nothing -- LKR 60,000 of ice for LKR 35,000 of cash, with
    -- LKR 25,000 of receivables silently destroyed.
    --
    -- The invariant this restores: A CASH ORDER NEVER CHANGES A CUSTOMER'S
    -- TOTAL OUTSTANDING. They hand over exactly what the order is worth, so
    -- the balance is a wash; FIFO only moves WHICH invoice carries it (oldest
    -- cleared, shortfall opened on this one), never how much is carried.
    --   before: 25,000 owed on the old invoice
    --   pay   : 35,000 cash -> 25,000 clears the old invoice, 10,000 lands here
    --   after : 25,000 owed on THIS invoice (35,000 billed - 10,000 received)
    -- Cash Balance still receives the full 35,000: the sale row is unchanged
    -- and every offset settlement is flagged is_auto_applied, which is what
    -- keeps cashBankMath from counting the same money a second time.

    if v_applied_to_old_debt > 0 then
      insert into public.debts (
        sale_id, customer_id, total_amount, paid_amount, remaining_amount,
        status, created_at, last_activity_at
      ) values (
        p_sale_id, v_customer_id, v_applied_to_old_debt, 0, v_applied_to_old_debt,
        'pending',
        -- created_at is the SALE's date, not the edit's. Two reasons: the
        -- ledger check `debt_created_at_vs_sale_date` requires them to match,
        -- and apply_cash_to_old_debts orders by created_at -- dating a
        -- re-priced order's debt to today would jump it to the back of the
        -- FIFO queue and quietly break that customer's debt aging.
        (select sale_date from public.sales where id = p_sale_id),
        v_now
      ) returning id into v_debt_id;
    end if;
  end if;

  return jsonb_build_object(
    'id', p_sale_id,
    'sale_code', v_sale_code,
    'customer_id', v_customer_id,
    'quantity', v_paid,
    'free_quantity', v_free,
    'price_per_cube', v_resolved_price,
    'total_amount', v_new_total,
    'payment_type', p_payment_type,
    'debt_id', v_debt_id,
    'reversed_from_old_debt', v_reversed,
    'applied_to_old_debt', v_applied_to_old_debt,
    'allocation', jsonb_build_object(
      'paid_manufactured', v_paid_mfc,
      'paid_resell', v_paid_rsc,
      'free_manufactured', v_free_mfc,
      'free_resell', v_free_rsc
    )
  );
end;
$$ language plpgsql security definer set search_path = public;
