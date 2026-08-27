-- ==========================================================================
-- Public bill / receipt: the customer's standing balance
-- ==========================================================================
--
-- Every printed and on-screen document now states what the customer still
-- owes across ALL their invoices, and when that figure last moved — a bill's
-- own total, or a single settlement's remainder, is only part of the answer
-- for a customer carrying a balance.
--
-- The in-app documents read it from the loaded debts ledger (see
-- src/utils/customerDebt.js). The two anonymous pages cannot: every select
-- policy on `debts` is `to authenticated`, so the figures have to ship inside
-- the same security-definer payload the rest of the document already comes
-- from. Both functions are otherwise unchanged.
--
-- Only two scalars are added — a total and a timestamp. No debt rows, no other
-- invoices, nothing that widens what an expired-in-24-hours link exposes
-- beyond what the document itself prints.

create or replace function public.get_public_bill(p_sale_code text)
returns jsonb as $$
declare
  v_sale public.sales%rowtype;
  v_customer public.customers%rowtype;
  v_settings public.settings%rowtype;
  v_age_hours numeric;
  v_debt_total numeric(12, 2);
  v_debt_updated_at timestamptz;
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

  -- The balance counts open debts only; the timestamp is taken across all of
  -- them, settled included, so a customer who has just cleared everything gets
  -- "LKR 0.00, as of <when they cleared it>" rather than a blank.
  select coalesce(sum(remaining_amount) filter (where status <> 'settled'), 0),
         max(coalesce(last_activity_at, created_at))
    into v_debt_total, v_debt_updated_at
  from public.debts
  where customer_id = v_sale.customer_id;

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
      -- FIN-17: a cash order can now carry a balance. When its cash was
      -- diverted to the customer's older invoices, the shortfall is booked as
      -- a debt against THIS sale — so a bill that simply says "Paid Cash"
      -- tells the customer they owe nothing while the ledger says otherwise.
      -- Both figures ship with the bill so it can state the truth.
      'outstanding', coalesce(
        (select d.remaining_amount from public.debts d where d.sale_id = v_sale.id), 0),
      'amount_paid', v_sale.total_amount - coalesce(
        (select d.remaining_amount from public.debts d where d.sale_id = v_sale.id), 0),
      -- What the customer owes in all, and when that last changed.
      'customer_debt_total', coalesce(v_debt_total, 0),
      'customer_debt_updated_at', v_debt_updated_at,
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

grant execute on function public.get_public_bill(text) to anon, authenticated;


-- The settlement receipt carries the same pair. `customer_remaining_total` was
-- already returned and stays for the page's "Balance still due" strip;
-- `customer_debt_total` / `customer_debt_updated_at` are what the PDF and the
-- shared preview components read, under the names every other document uses.

create or replace function public.get_public_settlement_receipt(p_settlement_code text)
returns jsonb as $$
declare
  v_row public.debt_settlements%rowtype;
  v_customer public.customers%rowtype;
  v_settings public.settings%rowtype;
  v_age_hours numeric;
  v_ids bigint[];
  v_total numeric(12, 2);
  v_cheque_no text;
  v_bank_name text;
  v_lines jsonb;
  v_debt_total numeric(12, 2);
  v_debt_updated_at timestamptz;
begin
  if p_settlement_code is null or length(trim(p_settlement_code)) = 0 then
    return jsonb_build_object('status', 'not_found');
  end if;

  select * into v_row
  from public.debt_settlements
  where settlement_code = trim(p_settlement_code)
  limit 1;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  v_age_hours := extract(epoch from (timezone('utc'::text, now()) - v_row.settlement_date)) / 3600.0;
  if v_age_hours >= 24 then
    -- Expired: acknowledge the receipt existed, return none of its content.
    return jsonb_build_object('status', 'expired', 'settlement_code', v_row.settlement_code);
  end if;

  -- Every row written by the same payment.
  select array_agg(id order by id), coalesce(sum(amount_paid), 0)
    into v_ids, v_total
  from public.debt_settlements
  where customer_id is not distinct from v_row.customer_id
    and settlement_date = v_row.settlement_date
    and is_auto_applied = v_row.is_auto_applied;

  select * into v_customer from public.customers where id = v_row.customer_id;
  select * into v_settings from public.settings order by id limit 1;

  select coalesce(sum(remaining_amount) filter (where status <> 'settled'), 0),
         max(coalesce(last_activity_at, created_at))
    into v_debt_total, v_debt_updated_at
  from public.debts
  where customer_id = v_row.customer_id;

  -- Where the money went, when it wasn't cash. Both tables point at the FIRST
  -- settlement row of the payment (settle_customer_debt_transaction's
  -- v_first_id), so the lookup spans the whole group.
  select cr.cheque_no, cr.bank_name into v_cheque_no, v_bank_name
  from public.cheque_records cr
  where cr.settlement_id = any(v_ids)
  limit 1;

  if v_bank_name is null then
    select bd.bank_name into v_bank_name
    from public.bank_deposits bd
    where bd.settlement_id = any(v_ids)
    limit 1;
  end if;

  select coalesce(jsonb_agg(line order by line->>'settlement_code'), '[]'::jsonb)
    into v_lines
  from (
    select jsonb_build_object(
             'settlement_code', ds.settlement_code,
             -- Coalesced: a settlement whose debt row was removed (a deleted
             -- sale) would otherwise put nulls into the receipt's table, and
             -- the PDF's status pill has no text to size itself from.
             'sale_code', coalesce(s.sale_code, 'N/A'),
             'amount_applied', ds.amount_paid,
             'remaining_amount', coalesce(d.remaining_amount, 0),
             'status', coalesce(d.status, 'settled')
           ) as line
      from public.debt_settlements ds
      left join public.debts d on d.id = ds.debt_id
      left join public.sales s on s.id = d.sale_id
     where ds.id = any(v_ids)
  ) grouped;

  return jsonb_build_object(
    'status', 'ok',
    'settlement', jsonb_build_object(
      'settlement_code', v_row.settlement_code,
      'settlement_date', v_row.settlement_date,
      'payment_method', v_row.payment_method,
      'notes', v_row.notes,
      'created_by', v_row.created_by,
      'amount_paid', v_total,
      -- Defensive: generateSettlementReceiptPDF falls back to these scalars
      -- when the per-debt breakdown is empty (a settlement whose debt row has
      -- since been removed), and would otherwise read undefined.
      'remaining_amount', coalesce(v_debt_total, 0),
      'status', 'settled',
      'cheque_no', v_cheque_no,
      'bank_name', v_bank_name,
      -- What the customer owes in all after this payment, and when that last
      -- changed — printed on the receipt.
      'customer_debt_total', coalesce(v_debt_total, 0),
      'customer_debt_updated_at', v_debt_updated_at,
      'customer', case
        when v_customer.id is null then null
        else jsonb_build_object(
          'name', v_customer.name,
          'customer_code', v_customer.customer_code,
          'whatsapp_number', v_customer.whatsapp_number
        )
      end,
      'settlements', v_lines,
      -- Retained under its original name for the page's "Balance still due".
      'customer_remaining_total', coalesce(v_debt_total, 0)
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

grant execute on function public.get_public_settlement_receipt(text) to anon, authenticated;
