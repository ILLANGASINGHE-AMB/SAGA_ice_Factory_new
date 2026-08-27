-- ==========================================================================
-- Public debt-settlement receipt links (24-hour)
-- ==========================================================================
--
-- A sale's WhatsApp/SMS message already carries a /bill/<sale_code> link that
-- get_public_bill serves for 24 hours. A debt settlement's message carried no
-- link at all, so a customer who paid off a debt had no way to see or keep the
-- receipt — the settlement PDF only ever existed inside the app.
--
-- This is the settlement-side twin of get_public_bill, and follows exactly the
-- same rules:
--   * matched on the exact settlement_code,
--   * the 24-hour window is enforced HERE, server-side, so an expired link
--     stops returning receipt content rather than merely being told not to
--     render it,
--   * only the fields the receipt prints come back — no address, no other
--     debts, nothing about the customer's remaining ledger beyond the balance
--     the receipt itself states.
--
-- One customer payment is applied FIFO across several debts and writes one
-- debt_settlements row per debt, all sharing the same customer and the same
-- settlement_date (they are written inside one transaction from a single
-- `v_now`). The receipt is the whole payment, so the group is rebuilt from
-- that pair rather than returning only the row whose code was in the link.

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
      'remaining_amount', coalesce((
        select sum(remaining_amount) from public.debts
         where customer_id = v_row.customer_id and status <> 'settled'), 0),
      'status', 'settled',
      'cheque_no', v_cheque_no,
      'bank_name', v_bank_name,
      'customer', case
        when v_customer.id is null then null
        else jsonb_build_object(
          'name', v_customer.name,
          'customer_code', v_customer.customer_code,
          'whatsapp_number', v_customer.whatsapp_number
        )
      end,
      'settlements', v_lines,
      -- What the customer still owes in total after this payment. The receipt
      -- states it, so it is the one figure beyond this payment that is shared.
      'customer_remaining_total', coalesce((
        select sum(remaining_amount) from public.debts
         where customer_id = v_row.customer_id and status <> 'settled'), 0)
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
-- from WhatsApp or SMS without logging in.
grant execute on function public.get_public_settlement_receipt(text) to anon, authenticated;
