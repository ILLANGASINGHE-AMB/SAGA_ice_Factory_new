-- Atomic Sale Edit Transaction (SalesTab.md "Edit bill button")
-- Lets an existing sale's cube type / quantity / rate / payment terms be
-- corrected after the fact, while keeping inventory and the debts ledger
-- consistent:
--   - Inventory: the sale's original quantity is restored to its original
--     cube type's stock, then the new quantity is deducted from the new
--     cube type's stock (same row if the type didn't change). Both affected
--     inventory rows are locked in a fixed (alphabetical) order so two
--     concurrent edits/orders can never deadlock against each other.
--   - Debts: cash->cash / debt->debt just re-prices the linked debt (if
--     any). debt->cash deletes the debt, but only if nothing has been paid
--     against it yet (paid_amount = 0) — refuses otherwise, since silently
--     dropping a debt that already has settlement history would destroy
--     that payment record. cash->debt creates a fresh pending debt for the
--     new total. Note: unlike place_order_transaction, this does NOT replay
--     the cash-to-old-debt FIFO offset — that offset already happened (or
--     didn't) at the time the sale was originally placed.
create or replace function public.edit_sale_transaction(
  p_sale_id bigint,
  p_cube_type text,
  p_quantity integer,
  p_price_per_cube numeric,
  p_payment_type text,
  p_edited_by text
) returns jsonb as $$
declare
  v_old_cube_type text;
  v_old_quantity integer;
  v_old_payment_type text;
  v_customer_id bigint;
  v_sale_code text;

  v_type_a text;
  v_type_b text;
  v_item_a_id bigint;
  v_item_a_qty integer;
  v_item_b_id bigint;
  v_item_b_qty integer;

  v_old_item_id bigint;
  v_old_item_qty integer;
  v_new_item_id bigint;
  v_new_item_qty integer;

  v_old_item_final_qty integer;
  v_new_item_final_qty integer;

  v_inventory_price numeric(10, 2);
  v_final_price numeric(10, 2);
  v_new_total numeric(10, 2);
  v_now timestamp with time zone := timezone('utc'::text, now());

  v_debt_id bigint;
  v_debt_paid numeric(10, 2);
  v_new_remaining numeric(10, 2);
  v_new_status text;
begin
  if p_quantity is null or p_quantity <= 0 then raise exception 'Quantity must be a positive integer'; end if;
  if p_cube_type not in ('manufactured', 'resell') then raise exception 'Invalid cube type selected'; end if;
  if p_payment_type not in ('cash', 'debt') then raise exception 'Invalid payment type'; end if;

  -- 1. Lock and read the existing sale
  select cube_type, quantity, payment_type, customer_id, sale_code
    into v_old_cube_type, v_old_quantity, v_old_payment_type, v_customer_id, v_sale_code
  from public.sales
  where id = p_sale_id
  for update;

  if not found then raise exception 'Sale record not found'; end if;

  -- 2. Lock the affected inventory row(s) in a fixed order to avoid deadlocks
  --    against concurrent edits/orders touching the same two cube types.
  if v_old_cube_type = p_cube_type then
    select id, quantity into v_old_item_id, v_old_item_qty
    from public.inventory where type = v_old_cube_type for update;
    if not found then raise exception 'Inventory item for % not found', v_old_cube_type; end if;
    v_new_item_id := v_old_item_id;
    v_new_item_qty := v_old_item_qty;
  else
    if v_old_cube_type < p_cube_type then
      v_type_a := v_old_cube_type; v_type_b := p_cube_type;
    else
      v_type_a := p_cube_type; v_type_b := v_old_cube_type;
    end if;

    select id, quantity into v_item_a_id, v_item_a_qty
    from public.inventory where type = v_type_a for update;
    if not found then raise exception 'Inventory item for % not found', v_type_a; end if;

    select id, quantity into v_item_b_id, v_item_b_qty
    from public.inventory where type = v_type_b for update;
    if not found then raise exception 'Inventory item for % not found', v_type_b; end if;

    if v_type_a = v_old_cube_type then
      v_old_item_id := v_item_a_id; v_old_item_qty := v_item_a_qty;
      v_new_item_id := v_item_b_id; v_new_item_qty := v_item_b_qty;
    else
      v_old_item_id := v_item_b_id; v_old_item_qty := v_item_b_qty;
      v_new_item_id := v_item_a_id; v_new_item_qty := v_item_a_qty;
    end if;
  end if;

  -- 3. Restore the old quantity, then deduct the new quantity
  if v_old_item_id = v_new_item_id then
    v_old_item_final_qty := v_old_item_qty + v_old_quantity - p_quantity;
    if v_old_item_final_qty < 0 then
      raise exception 'Insufficient stock. Available: %', v_old_item_qty + v_old_quantity;
    end if;

    update public.inventory
    set quantity = v_old_item_final_qty, updated_at = v_now
    where id = v_old_item_id;

    insert into public.inventory_transactions (inventory_id, transaction_type, quantity_change, previous_quantity, new_quantity, reference_code, created_by)
    values (v_old_item_id, 'adjustment', v_old_item_final_qty - v_old_item_qty, v_old_item_qty, v_old_item_final_qty, v_sale_code || ' (edit)', p_edited_by);
  else
    v_old_item_final_qty := v_old_item_qty + v_old_quantity;
    v_new_item_final_qty := v_new_item_qty - p_quantity;
    if v_new_item_final_qty < 0 then
      raise exception 'Insufficient stock. Available: %', v_new_item_qty;
    end if;

    update public.inventory
    set quantity = v_old_item_final_qty, updated_at = v_now
    where id = v_old_item_id;

    update public.inventory
    set quantity = v_new_item_final_qty, updated_at = v_now
    where id = v_new_item_id;

    insert into public.inventory_transactions (inventory_id, transaction_type, quantity_change, previous_quantity, new_quantity, reference_code, created_by)
    values (v_old_item_id, 'adjustment', v_old_quantity, v_old_item_qty, v_old_item_final_qty, v_sale_code || ' (edit restore)', p_edited_by);

    insert into public.inventory_transactions (inventory_id, transaction_type, quantity_change, previous_quantity, new_quantity, reference_code, created_by)
    values (v_new_item_id, 'adjustment', -p_quantity, v_new_item_qty, v_new_item_final_qty, v_sale_code || ' (edit deduct)', p_edited_by);
  end if;

  -- 4. Resolve price the same way place_order_transaction does: admins may
  --    override, everyone else always gets the current inventory price.
  select price_per_cube into v_inventory_price from public.inventory where id = v_new_item_id;

  if public.is_admin() and p_price_per_cube is not null and p_price_per_cube > 0 then
    v_final_price := p_price_per_cube;
  else
    v_final_price := v_inventory_price;
  end if;

  if v_final_price is null or v_final_price <= 0 then
    raise exception 'Price per cube must be a valid positive number';
  end if;

  v_new_total := v_final_price * p_quantity;

  -- 5. Update the sale record
  update public.sales
  set cube_type = p_cube_type,
      quantity = p_quantity,
      price_per_cube = v_final_price,
      total_amount = v_new_total,
      payment_type = p_payment_type,
      bill_pdf_url = null
  where id = p_sale_id;

  -- 6. Reconcile the linked debt (if any) against the new payment terms/total
  select id, paid_amount into v_debt_id, v_debt_paid
  from public.debts
  where sale_id = p_sale_id
  for update;

  if v_old_payment_type = 'debt' and p_payment_type = 'debt' then
    -- Still a debt: re-price it, keeping whatever has already been paid.
    v_new_remaining := v_new_total - coalesce(v_debt_paid, 0);
    if v_new_remaining < 0 then
      raise exception 'New total (LKR %) is less than the LKR % already paid against this debt', v_new_total, v_debt_paid;
    end if;
    v_new_status := case when v_new_remaining <= 0 then 'settled' else (case when v_debt_paid > 0 then 'partial' else 'pending' end) end;

    update public.debts
    set total_amount = v_new_total,
        remaining_amount = v_new_remaining,
        status = v_new_status
    where id = v_debt_id;

  elsif v_old_payment_type = 'debt' and p_payment_type = 'cash' then
    -- Converting to cash: only safe to drop the debt if nothing has been
    -- collected against it yet.
    if v_debt_id is not null and coalesce(v_debt_paid, 0) > 0 then
      raise exception 'Cannot convert to cash: LKR % has already been settled against this sale''s debt', v_debt_paid;
    end if;
    delete from public.debts where id = v_debt_id;

  elsif v_old_payment_type = 'cash' and p_payment_type = 'debt' then
    -- Converting to debt: open a fresh pending debt for the new total.
    insert into public.debts (sale_id, customer_id, total_amount, paid_amount, remaining_amount, status, created_at)
    values (p_sale_id, v_customer_id, v_new_total, 0, v_new_total, 'pending', v_now)
    returning id into v_debt_id;
  end if;

  return jsonb_build_object(
    'id', p_sale_id,
    'sale_code', v_sale_code,
    'customer_id', v_customer_id,
    'cube_type', p_cube_type,
    'quantity', p_quantity,
    'price_per_cube', v_final_price,
    'total_amount', v_new_total,
    'payment_type', p_payment_type,
    'debt_id', v_debt_id
  );
end;
$$ language plpgsql security definer;
