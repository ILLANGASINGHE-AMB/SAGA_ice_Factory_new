-- ============================================================================
-- Financial correctness + broken-code fixes (MainIssues.txt, 2026-08-25)
--
-- Covers, on the database side:
--   FIN-01  edit_sale_transaction now rewrites sale_items
--   FIN-02  debts.created_at is no longer overwritten (last_activity_at added)
--   FIN-03  delete_sale_transaction — atomic delete + settlement reversal
--   FIN-04  settle_customer_debt_transaction — one transaction for a payment
--           spanning several debts, including its Cash & Bank ledger row
--   FIN-07  Edit Bill honours the customer's negotiated rate
--   FIN-08  Edit Bill no longer discards a staff-entered rate
--   FIN-09  Edit Bill handles free cubes
--   FIN-10  Edit Bill reverses and replays the cash-to-old-debt offset
--   FIN-13  index supporting ledger-derived stock figures
--   FIN-15  debt_settlements.settlement_code is persisted
--   FIN-16  atomic cheque deposit / deposit delete / bank writes
--   BRK-01  Edit Bill works for pooled orders spanning both pools
--   BRK-04  trigram indexes for server-side global search
--   BRK-06  the two dead order RPCs are dropped
--   BRK-08  transport trip end-time is constrained
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Schema additions
-- ----------------------------------------------------------------------------

-- FIN-02: a debt's created_at is the date it was incurred and must never move
-- (aging buckets and the FIFO order both read it). "Last activity" gets its
-- own column instead.
alter table public.debts
  add column if not exists last_activity_at timestamptz;

-- FIN-15: the settlement code printed on the receipt / WhatsApp message is now
-- stored, so a customer quoting it can actually be looked up.
alter table public.debt_settlements
  add column if not exists settlement_code text;

-- FIN-03 / FIN-10: which sale produced an auto-applied settlement. Needed to
-- reverse the offset when that sale is edited or deleted; parsing created_by
-- text was the only prior link and is not a link at all.
alter table public.debt_settlements
  add column if not exists source_sale_id bigint references public.sales(id) on delete set null;

-- FIN-05: expenses are paid either out of the till or out of the bank, and
-- until now neither balance knew about them.
alter table public.expense_ledger_rows
  add column if not exists payment_source text not null default 'cash';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'expense_ledger_rows_payment_source_check'
  ) then
    alter table public.expense_ledger_rows
      add constraint expense_ledger_rows_payment_source_check
      check (payment_source in ('cash', 'bank'));
  end if;
end $$;

create index if not exists idx_debt_settlements_source_sale on public.debt_settlements(source_sale_id);
create index if not exists idx_debt_settlements_auto_applied on public.debt_settlements(is_auto_applied);

-- FIN-13: the Daily Report derives opening/closing stock from the transaction
-- ledger ("the last row before the window, per cube type"), which needs this.
create index if not exists idx_inventory_transactions_inv_created
  on public.inventory_transactions (inventory_id, created_at);

-- BRK-04: global search pushes the term into the query instead of downloading
-- an arbitrary 100 rows and filtering client-side.
create extension if not exists pg_trgm;
create index if not exists idx_customers_name_trgm on public.customers using gin (name gin_trgm_ops);
create index if not exists idx_employees_name_trgm on public.employees using gin (name gin_trgm_ops);
create index if not exists idx_vehicles_no_trgm on public.vehicles using gin (vehicle_no gin_trgm_ops);
create index if not exists idx_sales_code_trgm on public.sales using gin (sale_code gin_trgm_ops);
create index if not exists idx_notes_text_trgm on public.notes using gin (note_text gin_trgm_ops);
create index if not exists idx_expense_ledger_rows_desc_trgm
  on public.expense_ledger_rows using gin (description gin_trgm_ops);

-- BRK-08: a trip cannot end before it started. The hook checks it too, but the
-- database is where the guarantee belongs.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'transport_trips_end_after_start_check'
  ) then
    alter table public.transport_trips
      add constraint transport_trips_end_after_start_check
      check (end_datetime is null or end_datetime > start_datetime) not valid;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2. Backfills / repairs
-- ----------------------------------------------------------------------------

-- FIN-02 repair: a debt's true date is its sale's date. Any row whose
-- created_at was moved by the old offset logic is put back.
update public.debts d
   set last_activity_at = coalesce(d.last_activity_at, d.created_at)
 where d.last_activity_at is null;

update public.debts d
   set created_at = s.sale_date
  from public.sales s
 where s.id = d.sale_id
   and d.created_at is distinct from s.sale_date;

-- FIN-03 backfill: link historical auto-applied settlements to the sale that
-- created them, using the sale code the old code wrote into created_by.
update public.debt_settlements ds
   set source_sale_id = s.id
  from public.sales s
 where ds.is_auto_applied
   and ds.source_sale_id is null
   and ds.created_by like '%(auto-applied from sale ' || s.sale_code || ')%';

-- FIN-15 backfill: historical settlements get a code so old receipts become
-- searchable. Deterministic (id-based) so re-running changes nothing.
update public.debt_settlements
   set settlement_code = 'SIFD_LEGACY_' || lpad(id::text, 6, '0')
 where settlement_code is null;

create unique index if not exists idx_debt_settlements_code
  on public.debt_settlements(settlement_code);

-- ----------------------------------------------------------------------------
-- 3. Shared helpers — so the order path and the edit path cannot diverge again
-- ----------------------------------------------------------------------------

-- FIN-07: one place that answers "what does this customer pay per cube?".
-- Explicit rate wins (staff may price — see 20260825050000), then the
-- customer's negotiated rate, then the Production list price.
create or replace function public.resolve_cube_price(
  p_customer_id bigint,
  p_explicit_price numeric
) returns numeric as $$
declare
  v_customer_price numeric(10, 2);
  v_list_price numeric(10, 2);
begin
  if p_explicit_price is not null and p_explicit_price > 0 then
    return p_explicit_price;
  end if;

  select price_per_cube into v_customer_price
    from public.customer_cube_prices
   where customer_id = p_customer_id and cube_type = 'manufactured';

  select price_per_cube into v_list_price
    from public.inventory where type = 'manufactured';

  return coalesce(v_customer_price, v_list_price);
end;
$$ language plpgsql stable security definer set search_path = public;

-- FIN-02 / FIN-10: the cash-to-old-debt FIFO offset, extracted so the order
-- path and the edit path run the same code. created_at is NOT touched here —
-- that was the bug that destroyed debt aging and inverted FIFO.
create or replace function public.apply_cash_to_old_debts(
  p_customer_id bigint,
  p_amount numeric,
  p_sale_id bigint,
  p_sale_code text,
  p_created_by text
) returns numeric as $$
declare
  v_left numeric(10, 2) := coalesce(p_amount, 0);
  v_applied numeric(10, 2) := 0;
  v_debt record;
  v_apply numeric(10, 2);
  v_new_remaining numeric(10, 2);
  v_now timestamptz := timezone('utc'::text, now());
begin
  if p_customer_id is null or v_left <= 0 then
    return 0;
  end if;

  for v_debt in
    select id, remaining_amount
      from public.debts
     where customer_id = p_customer_id
       and status in ('pending', 'partial')
       and (p_sale_id is null or sale_id is distinct from p_sale_id)
     order by created_at asc, id asc
     for update
  loop
    exit when v_left <= 0;
    v_apply := least(v_left, v_debt.remaining_amount);
    continue when v_apply <= 0;

    v_new_remaining := v_debt.remaining_amount - v_apply;

    update public.debts
       set paid_amount      = paid_amount + v_apply,
           remaining_amount = v_new_remaining,
           status           = case when v_new_remaining <= 0 then 'settled' else 'partial' end,
           last_activity_at = v_now
     where id = v_debt.id;

    insert into public.debt_settlements (
      debt_id, customer_id, amount_paid, settlement_date, created_by,
      is_auto_applied, source_sale_id, settlement_code
    ) values (
      v_debt.id, p_customer_id, v_apply, v_now,
      coalesce(p_created_by, 'System') || ' (auto-applied from sale ' || coalesce(p_sale_code, '?') || ')',
      true, p_sale_id, public.get_next_code('settlement', 'D')
    );

    v_applied := v_applied + v_apply;
    v_left := v_left - v_apply;
  end loop;

  return v_applied;
end;
$$ language plpgsql security definer set search_path = public;

-- FIN-03 / FIN-10: undo everything apply_cash_to_old_debts did for one sale.
-- Each reversed settlement puts its amount back onto the debt it reduced and
-- then disappears, so the receivables ledger returns to its pre-sale state.
create or replace function public.reverse_auto_applied_settlements(p_sale_id bigint)
returns numeric as $$
declare
  v_row record;
  v_total numeric(10, 2) := 0;
  v_now timestamptz := timezone('utc'::text, now());
begin
  if p_sale_id is null then
    return 0;
  end if;

  for v_row in
    select id, debt_id, amount_paid
      from public.debt_settlements
     where source_sale_id = p_sale_id
       and is_auto_applied
     order by id
  loop
    -- Every column reference below reads the pre-UPDATE value, so the
    -- repeated greatest(...) expressions all describe the same new figure.
    update public.debts
       set paid_amount      = greatest(0, paid_amount - v_row.amount_paid),
           remaining_amount = total_amount - greatest(0, paid_amount - v_row.amount_paid),
           status           = case
                                when total_amount - greatest(0, paid_amount - v_row.amount_paid) <= 0 then 'settled'
                                when greatest(0, paid_amount - v_row.amount_paid) > 0 then 'partial'
                                else 'pending'
                              end,
           last_activity_at = v_now
     where id = v_row.debt_id;

    delete from public.debt_settlements where id = v_row.id;
    v_total := v_total + v_row.amount_paid;
  end loop;

  return v_total;
end;
$$ language plpgsql security definer set search_path = public;

-- FIN-05 / FIN-16: the authoritative balances, mirroring cashBankMath.js so a
-- server-side check can never disagree with the figure on screen.
create or replace function public.current_cash_balance() returns numeric as $$
  select greatest(0,
      coalesce((select amount from public.opening_balances where scope = 'cash'), 0)
    + coalesce((select sum(total_amount) from public.sales where payment_type = 'cash'), 0)
    + coalesce((select sum(amount_paid) from public.debt_settlements
                 where not is_auto_applied
                   and payment_method not in ('bank_transfer', 'cheque')), 0)
    + coalesce((select sum(amount) from public.cash_receives), 0)
    - coalesce((select sum(amount) from public.bank_deposits
                 where cash_method not in ('cheques', 'debt_settlement')), 0)
    - coalesce((select sum(a.amount)
                  from public.expense_amounts a
                  join public.expense_ledger_rows r on r.id = a.ledger_row_id
                 where r.payment_source = 'cash'), 0)
  );
$$ language sql stable security definer set search_path = public;

create or replace function public.current_hand_cheques() returns numeric as $$
  select greatest(0,
      coalesce((select amount from public.opening_balances where scope = 'cheques'), 0)
    + coalesce((select sum(amount) from public.cheque_records where status = 'pending'), 0)
    - coalesce((select sum(d.amount) from public.bank_deposits d
                 where d.cash_method = 'cheques'
                   and not exists (select 1 from public.cheque_records c where c.deposit_id = d.id)), 0)
  );
$$ language sql stable security definer set search_path = public;

create or replace function public.current_bank_balance(p_bank_name text default null) returns numeric as $$
  select
      coalesce((select sum(amount) from public.opening_balances
                 where scope = 'bank'
                   and (p_bank_name is null
                        or coalesce(nullif(trim(bank_name), ''), 'Opening Balance') = p_bank_name)), 0)
    + coalesce((select sum(amount) from public.bank_deposits
                 where p_bank_name is null
                    or coalesce(nullif(trim(bank_name), ''), 'Unspecified') = p_bank_name), 0)
    - coalesce((select sum(amount) from public.bank_withdrawals
                 where p_bank_name is null
                    or coalesce(nullif(trim(bank_name), ''), 'Unspecified') = p_bank_name), 0)
    - coalesce((select sum(a.amount)
                  from public.expense_amounts a
                  join public.expense_ledger_rows r on r.id = a.ledger_row_id
                 where r.payment_source = 'bank'
                   and p_bank_name is null), 0);
$$ language sql stable security definer set search_path = public;

-- ----------------------------------------------------------------------------
-- 4. Order placement — same behaviour, but the FIFO offset now runs through
--    the shared helper (so it stops rewriting created_at, records which sale
--    produced each auto-applied settlement, and can be reversed).
-- ----------------------------------------------------------------------------

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

-- ----------------------------------------------------------------------------
-- 5. Edit Bill, rebuilt around the pooled model (FIN-01, FIN-07..FIN-10, BRK-01)
--
-- The old version took a cube type and a billed quantity, updated only the
-- `sales` header, ignored free cubes, re-priced to the list rate, and could
-- not be called at all for an order whose paid portion spanned both pools
-- (sales.cube_type is NULL for those). It is replaced, not patched:
--   - the operator edits the same two numbers they entered at the till
--     (quantity + free quantity) and the server re-allocates across pools
--     exactly as a new order does;
--   - old stock is restored from `sale_items`, not from sales.quantity, so
--     free cubes come back too;
--   - `sale_items` is rewritten, so every screen reading it agrees with the
--     header afterwards;
--   - the cash-to-old-debt offset this sale caused is reversed and replayed
--     against the corrected total.
-- ----------------------------------------------------------------------------

drop function if exists public.edit_sale_transaction(bigint, text, integer, numeric, text, text);

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
    if v_debt_id is not null then
      if coalesce(v_debt_paid, 0) > 0 then
        raise exception 'Cannot convert to cash: LKR % has already been settled against this sale''s debt', v_debt_paid;
      end if;
      delete from public.debts where id = v_debt_id;
      v_debt_id := null;
    end if;

    -- ...and then this cash behaves like any other cash order: it pays down
    -- the customer's oldest outstanding debts first.
    v_applied_to_old_debt := public.apply_cash_to_old_debts(
      v_customer_id, v_new_total, p_sale_id, v_sale_code, p_edited_by
    );
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

-- ----------------------------------------------------------------------------
-- 6. Deleting a sale (FIN-03)
--
-- Previously the JS restored stock with an unlocked read-then-write, logged no
-- inventory transaction, ran BEFORE the delete, and left the auto-applied debt
-- reductions the sale had funded standing — revenue vanished, the write-off it
-- paid for did not. All of it now happens in one transaction.
-- ----------------------------------------------------------------------------

-- The single invariant every debt has to satisfy: paid_amount is the sum of
-- its settlements. Used wherever settlements are added back or taken away.
create or replace function public.recalc_debt_totals(p_debt_id bigint)
returns void as $$
declare
  v_total numeric(10, 2);
  v_paid numeric(10, 2);
begin
  select total_amount into v_total from public.debts where id = p_debt_id for update;
  if not found then return; end if;

  select coalesce(sum(amount_paid), 0) into v_paid
    from public.debt_settlements where debt_id = p_debt_id;

  update public.debts
     set paid_amount      = v_paid,
         remaining_amount = v_total - v_paid,
         status           = case when v_total - v_paid <= 0 then 'settled'
                                 when v_paid > 0 then 'partial'
                                 else 'pending' end
   where id = p_debt_id;
end;
$$ language plpgsql security definer set search_path = public;

-- What deleting this sale will undo, so the operator can be shown exactly
-- which debts get un-paid before they confirm.
create or replace function public.sale_deletion_impact(p_sale_id bigint)
returns jsonb as $$
  select jsonb_build_object(
    'restore_items', coalesce((
      select jsonb_agg(jsonb_build_object('cube_type', cube_type, 'quantity', quantity, 'is_free', is_free) order by id)
        from public.sale_items where sale_id = p_sale_id), '[]'::jsonb),
    'auto_applied_settlements', coalesce((
      select jsonb_agg(jsonb_build_object(
               'settlement_id', ds.id,
               'debt_id', ds.debt_id,
               'amount', ds.amount_paid,
               'customer_name', c.name,
               'debt_sale_code', s.sale_code
             ) order by ds.id)
        from public.debt_settlements ds
        left join public.debts d on d.id = ds.debt_id
        left join public.sales s on s.id = d.sale_id
        left join public.customers c on c.id = ds.customer_id
       where ds.source_sale_id = p_sale_id and ds.is_auto_applied), '[]'::jsonb),
    'auto_applied_total', coalesce((
      select sum(amount_paid) from public.debt_settlements
       where source_sale_id = p_sale_id and is_auto_applied), 0)
  );
$$ language sql stable security definer set search_path = public;

create or replace function public.delete_sale_transaction(
  p_sale_id bigint,
  p_restore_stock boolean default true,
  p_deleted_by text default 'Admin',
  p_deleted_by_role text default null
) returns jsonb as $$
declare
  v_sale_code text;
  v_mfc_id bigint;
  v_mfc_qty integer := 0;
  v_rsc_id bigint;
  v_rsc_qty integer := 0;
  v_restore_mfc integer := 0;
  v_restore_rsc integer := 0;
  v_auto_rows jsonb := '[]'::jsonb;
  v_trash_id bigint;
  v_reversed numeric(10, 2) := 0;
  v_settlement_ids bigint[];
  v_debt_ids bigint[];
  v_debt_id bigint;
  v_now timestamptz := timezone('utc'::text, now());
begin
  select sale_code into v_sale_code from public.sales where id = p_sale_id for update;
  if not found then raise exception 'Sale record not found'; end if;

  -- 1. Stock, under the same locks every other inventory path takes, with an
  --    audit row so the movement is visible in Inventory History.
  if p_restore_stock then
    select id, quantity into v_mfc_id, v_mfc_qty
      from public.inventory where type = 'manufactured' for update;
    select id, quantity into v_rsc_id, v_rsc_qty
      from public.inventory where type = 'resell' for update;

    select
      coalesce(sum(quantity) filter (where cube_type = 'manufactured'), 0),
      coalesce(sum(quantity) filter (where cube_type = 'resell'), 0)
      into v_restore_mfc, v_restore_rsc
    from public.sale_items where sale_id = p_sale_id;

    if v_mfc_id is not null and v_restore_mfc > 0 then
      update public.inventory set quantity = v_mfc_qty + v_restore_mfc, updated_at = v_now where id = v_mfc_id;
      insert into public.inventory_transactions (inventory_id, transaction_type, quantity_change, previous_quantity, new_quantity, reference_code, created_by)
      values (v_mfc_id, 'adjustment', v_restore_mfc, v_mfc_qty, v_mfc_qty + v_restore_mfc, v_sale_code || ' (deleted — stock restored)', p_deleted_by);
    end if;

    if v_rsc_id is not null and v_restore_rsc > 0 then
      update public.inventory set quantity = v_rsc_qty + v_restore_rsc, updated_at = v_now where id = v_rsc_id;
      insert into public.inventory_transactions (inventory_id, transaction_type, quantity_change, previous_quantity, new_quantity, reference_code, created_by)
      values (v_rsc_id, 'adjustment', v_restore_rsc, v_rsc_qty, v_rsc_qty + v_restore_rsc, v_sale_code || ' (deleted — stock restored)', p_deleted_by);
    end if;
  end if;

  -- 2. Capture the auto-applied settlements BEFORE the sale goes. Two reasons
  --    this has to happen first: source_sale_id is `on delete set null`, so
  --    the moment the sale row disappears these become unfindable by that
  --    link; and they hang off OTHER customers' debts, so nothing cascades
  --    them away either. Everything below therefore works from ids captured
  --    here, never from a re-query on source_sale_id.
  select coalesce(jsonb_agg(to_jsonb(ds) order by ds.id), '[]'::jsonb),
         coalesce(sum(ds.amount_paid), 0)
    into v_auto_rows, v_reversed
  from public.debt_settlements ds
  where ds.source_sale_id = p_sale_id and ds.is_auto_applied;

  select coalesce(array_agg(ds.id), array[]::bigint[])
    into v_settlement_ids
  from public.debt_settlements ds
  where ds.source_sale_id = p_sale_id and ds.is_auto_applied;

  select coalesce(array_agg(distinct ds.debt_id), array[]::bigint[])
    into v_debt_ids
  from public.debt_settlements ds
  where ds.source_sale_id = p_sale_id and ds.is_auto_applied and ds.debt_id is not null;

  -- 3. Trash + delete (sale_items and this sale's own debt cascade).
  perform public.soft_delete_row('sales', p_sale_id, p_deleted_by, p_deleted_by_role);

  -- Carry the reversed settlements into the same trash entry so a restore
  -- brings the whole picture back, not just the sale.
  select id into v_trash_id from public.trash
   where entity_table = 'sales' and entity_id = p_sale_id::text
   order by id desc limit 1;

  if v_trash_id is not null and jsonb_array_length(v_auto_rows) > 0 then
    update public.trash
       set snapshot = jsonb_set(
             snapshot, '{children}',
             coalesce(snapshot->'children', '[]'::jsonb) ||
             jsonb_build_array(jsonb_build_object('table', 'debt_settlements', 'rows', v_auto_rows))
           )
     where id = v_trash_id;
  end if;

  -- 4. Un-pay the debts this sale's cash was applied to. Addressed by the ids
  --    captured in step 2 — source_sale_id was nulled by the delete above.
  if array_length(v_settlement_ids, 1) > 0 then
    delete from public.debt_settlements where id = any(v_settlement_ids);
  end if;

  foreach v_debt_id in array coalesce(v_debt_ids, array[]::bigint[])
  loop
    perform public.recalc_debt_totals(v_debt_id);
  end loop;

  return jsonb_build_object(
    'sale_code', v_sale_code,
    'stock_restored', p_restore_stock,
    'restored_manufactured', v_restore_mfc,
    'restored_resell', v_restore_rsc,
    'reversed_settlement_total', v_reversed,
    'reversed_debt_count', coalesce(array_length(v_debt_ids, 1), 0)
  );
end;
$$ language plpgsql security definer set search_path = public;

-- Restoring a sale has to put back the debt reductions its cash funded, or the
-- restore is not the inverse of the delete. Recomputing each affected debt
-- from its settlement rows is exact in both directions.
create or replace function public.restore_trash_item(p_trash_id bigint, p_performed_by text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trash public.trash%rowtype;
  v_row jsonb;
  v_child jsonb;
  v_grandchild jsonb;
  v_debt_id bigint;
begin
  select * into v_trash from public.trash where id = p_trash_id;
  if not found then
    raise exception 'Trash item not found';
  end if;

  v_row := v_trash.snapshot->'row';

  execute format(
    'insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)',
    v_trash.entity_table, v_trash.entity_table
  ) using v_row;

  for v_child in select * from jsonb_array_elements(coalesce(v_trash.snapshot->'children', '[]'::jsonb))
  loop
    if jsonb_array_length(coalesce(v_child->'rows', '[]'::jsonb)) > 0 then
      execute format(
        'insert into public.%I select * from jsonb_populate_recordset(null::public.%I, $1)',
        v_child->>'table', v_child->>'table'
      ) using (v_child->'rows');
    end if;

    for v_grandchild in select * from jsonb_array_elements(coalesce(v_child->'children', '[]'::jsonb))
    loop
      if jsonb_array_length(coalesce(v_grandchild->'rows', '[]'::jsonb)) > 0 then
        execute format(
          'insert into public.%I select * from jsonb_populate_recordset(null::public.%I, $1)',
          v_grandchild->>'table', v_grandchild->>'table'
        ) using (v_grandchild->'rows');
      end if;
    end loop;
  end loop;

  -- Any debt touched by a restored settlement is recomputed from its
  -- settlements, so re-applied auto-offsets land back on the right balances.
  for v_debt_id in
    select distinct (r->>'debt_id')::bigint
      from jsonb_array_elements(coalesce(v_trash.snapshot->'children', '[]'::jsonb)) c,
           jsonb_array_elements(coalesce(c->'rows', '[]'::jsonb)) r
     where c->>'table' = 'debt_settlements'
       and coalesce(r->>'debt_id', '') <> ''
  loop
    perform public.recalc_debt_totals(v_debt_id);
  end loop;

  insert into public.activity_log (action, entity_type, entity_id, entity_label, description, performed_by)
  values ('restore', v_trash.entity_table, v_trash.entity_id, v_trash.entity_label,
    format('Restored %s %s from Trash', v_trash.entity_table, coalesce(v_trash.entity_label, v_trash.entity_id)), p_performed_by);

  delete from public.trash where id = p_trash_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. Settlements (FIN-04, FIN-14, FIN-15)
-- ----------------------------------------------------------------------------

-- Single-debt settlement — unchanged behaviour, except the code it generates
-- is now written to the row instead of being printed and thrown away.
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
      status = v_new_status,
      last_activity_at = v_now
  where id = p_debt_id;

  v_settlement_code := public.get_next_code('settlement', 'D');

  insert into public.debt_settlements (
    debt_id, customer_id, amount_paid, payment_method, notes, settlement_date, created_by, settlement_code
  ) values (
    p_debt_id, v_customer_id, p_amount_paid, coalesce(p_payment_method, 'cash'), p_notes, v_now, coalesce(p_created_by, 'Admin'), v_settlement_code
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
    'settlement_date', v_now,
    'customer_remaining_total', coalesce((
      select sum(remaining_amount) from public.debts
       where customer_id = v_customer_id and status <> 'settled'), 0)
  );
end;
$$ language plpgsql security definer set search_path = public;

-- One customer payment spanning however many of their debts it covers, in ONE
-- transaction — including the Cash & Bank row it produces. The JS loop this
-- replaces committed per debt: a failure partway left the earlier debts paid,
-- reported "Failed to settle debt", and the retry paid them a second time.
create or replace function public.settle_customer_debt_transaction(
  p_customer_id bigint,
  p_amount numeric,
  p_payment_method text default 'cash',
  p_notes text default null,
  p_details jsonb default '{}'::jsonb,
  p_created_by text default 'Admin'
) returns jsonb as $$
declare
  v_left numeric(10, 2) := coalesce(p_amount, 0);
  v_total_outstanding numeric(10, 2) := 0;
  v_debt record;
  v_apply numeric(10, 2);
  v_new_paid numeric(10, 2);
  v_new_remaining numeric(10, 2);
  v_new_status text;
  v_code text;
  v_settlement_id bigint;
  v_first_code text;
  v_first_id bigint;
  v_lines jsonb := '[]'::jsonb;
  v_touched integer := 0;
  v_now timestamptz := timezone('utc'::text, now());
  v_method text := coalesce(p_payment_method, 'cash');
  v_cheque_no text := nullif(trim(coalesce(p_details->>'chequeNo', '')), '');
  v_bank_name text := nullif(trim(coalesce(p_details->>'bankName', '')), '');
  v_payer_name text := nullif(trim(coalesce(p_details->>'payerName', '')), '');
  v_customer_name text;
  v_customer_remaining numeric(10, 2);
begin
  if p_customer_id is null then raise exception 'Customer is required'; end if;
  if v_left <= 0 then raise exception 'Settlement amount must be a positive number'; end if;
  if v_method not in ('cash', 'bank_transfer', 'cheque', 'card', 'other') then
    raise exception 'Invalid payment method';
  end if;

  -- A cheque has to carry enough detail to become a real Hand Cheques record,
  -- so it is rejected before any money moves.
  if v_method = 'cheque' then
    if v_cheque_no is null then raise exception 'Cheque number is required for a cheque settlement'; end if;
    if v_bank_name is null then raise exception 'Bank name is required for a cheque settlement'; end if;
  end if;

  select name into v_customer_name from public.customers where id = p_customer_id;

  -- Lock the customer's open debts first (an aggregate cannot carry FOR
  -- UPDATE), then total them under that lock.
  perform 1 from public.debts
   where customer_id = p_customer_id and status <> 'settled'
   for update;

  select coalesce(sum(remaining_amount), 0) into v_total_outstanding
    from public.debts
   where customer_id = p_customer_id and status <> 'settled';

  if v_total_outstanding <= 0 then
    raise exception 'This customer has no outstanding debt';
  end if;
  if v_left > v_total_outstanding then
    raise exception 'Payment amount exceeds total outstanding debt (LKR %)', v_total_outstanding;
  end if;

  -- FIFO across the customer's oldest debts. created_at is the incurrence
  -- date and is never rewritten (FIN-02), so "oldest" means oldest.
  for v_debt in
    select d.id, d.total_amount, d.paid_amount, d.remaining_amount, s.sale_code
      from public.debts d
      left join public.sales s on s.id = d.sale_id
     where d.customer_id = p_customer_id and d.status <> 'settled'
     order by d.created_at asc, d.id asc
     for update of d
  loop
    exit when v_left <= 0;
    v_apply := least(v_left, v_debt.remaining_amount);
    continue when v_apply <= 0;

    v_new_paid := v_debt.paid_amount + v_apply;
    v_new_remaining := v_debt.total_amount - v_new_paid;
    v_new_status := case when v_new_remaining <= 0 then 'settled' else 'partial' end;

    update public.debts
       set paid_amount = v_new_paid,
           remaining_amount = v_new_remaining,
           status = v_new_status,
           last_activity_at = v_now
     where id = v_debt.id;

    v_code := public.get_next_code('settlement', 'D');

    insert into public.debt_settlements (
      debt_id, customer_id, amount_paid, payment_method, notes, settlement_date, created_by, settlement_code
    ) values (
      v_debt.id, p_customer_id, v_apply, v_method, p_notes, v_now, coalesce(p_created_by, 'Admin'), v_code
    ) returning id into v_settlement_id;

    if v_first_code is null then
      v_first_code := v_code;
      v_first_id := v_settlement_id;
    end if;

    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'settlement_id', v_settlement_id,
      'settlement_code', v_code,
      'debt_id', v_debt.id,
      'sale_code', v_debt.sale_code,
      'amount_applied', v_apply,
      'remaining_amount', v_new_remaining,
      'status', v_new_status
    ));

    v_touched := v_touched + 1;
    v_left := v_left - v_apply;
  end loop;

  if v_touched = 0 then
    raise exception 'This customer has no outstanding debt';
  end if;

  -- Put the money where it actually went. Cash needs no row (Cash Balance is
  -- derived from debt_settlements); the other two never touch the till, so
  -- each files its own ledger entry — in this same transaction, so the books
  -- can no longer be left out of balance by a half-completed payment.
  if v_method = 'bank_transfer' then
    insert into public.bank_deposits (amount, cash_method, bank_name, settlement_id, created_by, deposited_at)
    values (p_amount, 'debt_settlement', v_bank_name, v_first_id, coalesce(p_created_by, 'Admin'), v_now);
  elsif v_method = 'cheque' then
    insert into public.cheque_records (cheque_no, bank_name, amount, payer_name, customer_id, settlement_id, created_by, received_at)
    values (v_cheque_no, v_bank_name, p_amount, coalesce(v_payer_name, v_customer_name, 'Customer'),
            p_customer_id, v_first_id, coalesce(p_created_by, 'Admin'), v_now);
  end if;

  -- FIN-14: the authoritative post-payment balance, so the receipt and the
  -- WhatsApp message can stop re-deriving it from a debounced local cache.
  select coalesce(sum(remaining_amount), 0) into v_customer_remaining
    from public.debts where customer_id = p_customer_id and status <> 'settled';

  return jsonb_build_object(
    'id', v_first_id,
    'settlement_code', v_first_code,
    'customer_id', p_customer_id,
    'amount_paid', p_amount,
    'payment_method', v_method,
    'notes', p_notes,
    'settlement_date', v_now,
    'created_by', p_created_by,
    'cheque_no', v_cheque_no,
    'bank_name', v_bank_name,
    'settlements', v_lines,
    'debts_touched', v_touched,
    'customer_remaining_total', v_customer_remaining
  );
end;
$$ language plpgsql security definer set search_path = public;

-- ----------------------------------------------------------------------------
-- 8. Cash & Bank writes (FIN-16)
--
-- Each of these was previously either two independent writes (money could be
-- created or destroyed if the second failed) or a client-side check against a
-- possibly-stale snapshot with no server-side equivalent. transport_trips is
-- the template: check on the client for a fast message, guarantee on the
-- server under a lock.
-- ----------------------------------------------------------------------------

create or replace function public.deposit_cheque_transaction(
  p_cheque_id bigint,
  p_created_by text default 'Admin'
) returns jsonb as $$
declare
  v_cheque public.cheque_records%rowtype;
  v_deposit_id bigint;
  v_now timestamptz := timezone('utc'::text, now());
begin
  select * into v_cheque from public.cheque_records where id = p_cheque_id for update;
  if not found then raise exception 'Cheque record not found'; end if;
  if v_cheque.status <> 'pending' then
    raise exception 'This cheque has already been deposited';
  end if;

  insert into public.bank_deposits (amount, cash_method, bank_name, created_by, deposited_at)
  values (v_cheque.amount, 'cheques', v_cheque.bank_name, coalesce(p_created_by, 'Admin'), v_now)
  returning id into v_deposit_id;

  update public.cheque_records
     set status = 'deposited', deposited_at = v_now, deposit_id = v_deposit_id
   where id = p_cheque_id;

  return jsonb_build_object('cheque_id', p_cheque_id, 'deposit_id', v_deposit_id, 'amount', v_cheque.amount);
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.delete_bank_deposit_transaction(
  p_deposit_id bigint,
  p_deleted_by text default 'Admin',
  p_deleted_by_role text default null
) returns void as $$
begin
  perform 1 from public.bank_deposits where id = p_deposit_id for update;
  if not found then raise exception 'Deposit record not found'; end if;

  -- Reverse a linked cheque back to pending in the SAME transaction as the
  -- delete. The FK's `on delete set null` would otherwise clear deposit_id
  -- and leave status stuck at 'deposited' — the money would disappear from
  -- Bank Balance and never return to Hand Cheques.
  update public.cheque_records
     set status = 'pending', deposited_at = null, deposit_id = null
   where deposit_id = p_deposit_id;

  perform public.soft_delete_row('bank_deposits', p_deposit_id, p_deleted_by, p_deleted_by_role);
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.add_bank_deposit_transaction(
  p_amount numeric,
  p_cash_method text,
  p_bank_name text default null,
  p_created_by text default 'Admin'
) returns jsonb as $$
declare
  v_id bigint;
  v_available numeric(12, 2);
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Please enter a valid deposit amount'; end if;
  if p_cash_method not in ('sales', 'other', 'cheques') then raise exception 'Please select a cash method'; end if;

  -- Serialise concurrent deposits so two operators cannot both pass the
  -- balance check against the same starting figure.
  perform pg_advisory_xact_lock(hashtext('saga_cash_bank_ledger'));

  if p_cash_method = 'cheques' then
    v_available := public.current_hand_cheques();
    if p_amount > v_available then
      raise exception 'Deposit cannot exceed current Hand Cheques balance (LKR %)', v_available;
    end if;
  else
    v_available := public.current_cash_balance();
    if p_amount > v_available then
      raise exception 'Deposit cannot exceed current Cash Balance (LKR %)', v_available;
    end if;
  end if;

  insert into public.bank_deposits (amount, cash_method, bank_name, created_by)
  values (p_amount, p_cash_method, nullif(trim(coalesce(p_bank_name, '')), ''), coalesce(p_created_by, 'Admin'))
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'amount', p_amount, 'cash_method', p_cash_method);
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.add_bank_withdrawal_transaction(
  p_amount numeric,
  p_bank_name text,
  p_purpose text,
  p_created_by text default 'Admin'
) returns jsonb as $$
declare
  v_id bigint;
  v_available numeric(12, 2);
  v_bank text := nullif(trim(coalesce(p_bank_name, '')), '');
begin
  if v_bank is null then raise exception 'Please select the bank to withdraw from'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Please enter a valid withdrawal amount'; end if;
  if nullif(trim(coalesce(p_purpose, '')), '') is null then raise exception 'Please enter the purpose of withdrawing'; end if;

  perform pg_advisory_xact_lock(hashtext('saga_cash_bank_ledger'));

  v_available := public.current_bank_balance(v_bank);
  if p_amount > v_available then
    raise exception 'Withdrawal cannot exceed the available balance for % (LKR %)', v_bank, v_available;
  end if;

  insert into public.bank_withdrawals (amount, bank_name, purpose, created_by)
  values (p_amount, v_bank, trim(p_purpose), coalesce(p_created_by, 'Admin'))
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'amount', p_amount, 'bank_name', v_bank);
end;
$$ language plpgsql security definer set search_path = public;

-- ----------------------------------------------------------------------------
-- 9. Dead code (BRK-06)
--
-- Both were superseded by place_pooled_order_transaction, are called from
-- nowhere in src/, write single-pool sales the current model does not expect,
-- and still contain the pre-20260825050000 is_admin() pricing gate — so
-- calling either reintroduced a bug that is supposedly fixed.
-- ----------------------------------------------------------------------------

drop function if exists public.place_order_transaction(bigint, text, integer, numeric, text, text);
drop function if exists public.place_multi_item_order_transaction(bigint, jsonb, text, text);

-- ----------------------------------------------------------------------------
-- 10. Grants
-- ----------------------------------------------------------------------------

grant execute on function public.resolve_cube_price(bigint, numeric) to authenticated;
grant execute on function public.apply_cash_to_old_debts(bigint, numeric, bigint, text, text) to authenticated;
grant execute on function public.reverse_auto_applied_settlements(bigint) to authenticated;
grant execute on function public.recalc_debt_totals(bigint) to authenticated;
grant execute on function public.current_cash_balance() to authenticated;
grant execute on function public.current_hand_cheques() to authenticated;
grant execute on function public.current_bank_balance(text) to authenticated;
grant execute on function public.place_pooled_order_transaction(bigint, integer, numeric, integer, text, text) to authenticated;
grant execute on function public.edit_sale_transaction(bigint, integer, numeric, integer, text, text) to authenticated;
grant execute on function public.sale_deletion_impact(bigint) to authenticated;
grant execute on function public.delete_sale_transaction(bigint, boolean, text, text) to authenticated;
grant execute on function public.settle_debt_transaction(bigint, numeric, text, text, text) to authenticated;
grant execute on function public.settle_customer_debt_transaction(bigint, numeric, text, text, jsonb, text) to authenticated;
grant execute on function public.deposit_cheque_transaction(bigint, text) to authenticated;
grant execute on function public.delete_bank_deposit_transaction(bigint, text, text) to authenticated;
grant execute on function public.add_bank_deposit_transaction(numeric, text, text, text) to authenticated;
grant execute on function public.add_bank_withdrawal_transaction(numeric, text, text, text) to authenticated;
grant execute on function public.restore_trash_item(bigint, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 11. Ledger consistency assertions
--
-- Standing in for the tests the audit asks for (this project has no test
-- runner). Each row this returns is a real inconsistency; a clean database
-- returns none, so it works as a CI gate:
--
--   select * from public.ledger_consistency_report();   -- expect 0 rows
--
-- Deliberately a report rather than a CHECK constraint / trigger: the
-- sale_items-vs-header invariant spans two tables, and a hard constraint added
-- now would also reject writes touching rows left inconsistent by the code
-- these fixes replace — turning a historical data problem into an outage.
-- ----------------------------------------------------------------------------

create or replace function public.ledger_consistency_report()
returns table (check_name text, entity_id text, detail text) as $$
  -- FIN-01: billed line items must add up to the sale header's quantity.
  select 'sale_items_vs_sales_quantity'::text,
         s.sale_code,
         format('header quantity %s, paid line items %s', s.quantity, coalesce(i.paid_qty, 0))
    from public.sales s
    left join (
      select sale_id, sum(quantity) filter (where not is_free) as paid_qty
        from public.sale_items group by sale_id
    ) i on i.sale_id = s.id
   where exists (select 1 from public.sale_items si where si.sale_id = s.id)
     and coalesce(i.paid_qty, 0) <> s.quantity

  union all

  -- FIN-09: free cubes physically left stock, so they must be recorded too.
  select 'sale_items_vs_sales_free_quantity'::text,
         s.sale_code,
         format('header free_quantity %s, free line items %s', s.free_quantity, coalesce(i.free_qty, 0))
    from public.sales s
    left join (
      select sale_id, sum(quantity) filter (where is_free) as free_qty
        from public.sale_items group by sale_id
    ) i on i.sale_id = s.id
   where exists (select 1 from public.sale_items si where si.sale_id = s.id)
     and coalesce(i.free_qty, 0) <> coalesce(s.free_quantity, 0)

  union all

  -- FIN-02: a debt's created_at is its incurrence date and must equal its
  -- sale's date. Anything else means something moved it again.
  select 'debt_created_at_vs_sale_date'::text,
         d.id::text,
         format('debt created_at %s, sale_date %s', d.created_at, s.sale_date)
    from public.debts d
    join public.sales s on s.id = d.sale_id
   where d.created_at is distinct from s.sale_date

  union all

  -- FIN-03 / FIN-04: paid_amount is the sum of a debt's settlements. A
  -- mismatch means a settlement was added or reversed without the debt.
  select 'debt_paid_amount_vs_settlements'::text,
         d.id::text,
         format('debt paid_amount %s, settlements %s', d.paid_amount, coalesce(x.total, 0))
    from public.debts d
    left join (
      select debt_id, sum(amount_paid) as total
        from public.debt_settlements group by debt_id
    ) x on x.debt_id = d.id
   where d.paid_amount is distinct from coalesce(x.total, 0)

  union all

  -- FIN-04: remaining_amount is always total minus paid.
  select 'debt_remaining_amount'::text,
         d.id::text,
         format('total %s - paid %s <> remaining %s', d.total_amount, d.paid_amount, d.remaining_amount)
    from public.debts d
   where d.remaining_amount is distinct from (d.total_amount - d.paid_amount)

  union all

  -- FIN-04: a settlement taken as a cheque or a bank transfer never touches
  -- the till, so the ONLY thing holding that money is its cheque_records /
  -- bank_deposits row. The code this replaces wrote that row in a separate
  -- transaction that could fail into a toast, leaving the debt marked paid
  -- with the funds recorded in no store of value at all.
  select 'settlement_without_ledger_row'::text,
         coalesce(ds.settlement_code, ds.id::text),
         format('%s settlement of %s has no %s row',
                ds.payment_method, ds.amount_paid,
                case when ds.payment_method = 'cheque' then 'cheque_records' else 'bank_deposits' end)
    from public.debt_settlements ds
   where not ds.is_auto_applied
     and ds.payment_method in ('cheque', 'bank_transfer')
     -- Either kind of settlement produces exactly one ledger row, in one
     -- table or the other, so "neither table has it" is the whole test.
     and not exists (
       select 1 from public.cheque_records c where c.settlement_id = ds.id
       union all
       select 1 from public.bank_deposits b where b.settlement_id = ds.id
     )

  union all

  -- FIN-16: a deposited cheque must point at a bank deposit that still
  -- exists, or its amount is counted in neither store of value.
  select 'deposited_cheque_without_deposit'::text,
         c.cheque_no,
         format('cheque %s is marked deposited with deposit_id %s', c.cheque_no, c.deposit_id)
    from public.cheque_records c
   where c.status = 'deposited'
     and (c.deposit_id is null
          or not exists (select 1 from public.bank_deposits b where b.id = c.deposit_id));
$$ language sql stable security definer set search_path = public;

grant execute on function public.ledger_consistency_report() to authenticated;
