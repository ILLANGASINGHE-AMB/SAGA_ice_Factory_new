-- ==========================================================================
-- FIN-17 follow-up: tell the customer the truth on a part-paid cash bill
-- ==========================================================================
-- 20260826030000 made a cash order able to carry a balance: when its cash is
-- diverted to the customer's older invoices, the shortfall is booked as a debt
-- against that sale.
--
--   debt order 17,500, then a 25,000 cash order
--   -> 17,500 of the cash clears the old invoice
--   -> 7,500 lands on the new one, 17,500 still owed on SIF_xxxx_xxxx
--
-- The public bill, though, still rendered a flat "Paid Cash" badge for any
-- sale with payment_type = 'cash'. The customer opening that WhatsApp link saw
-- a fully-settled 25,000 bill while the ledger said they owed 17,500 on it.
--
-- get_public_bill now ships what was actually paid and what is still owed, so
-- the page can say so.
-- --------------------------------------------------------------------------

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
      -- FIN-17: a cash order can now carry a balance. When its cash was
      -- diverted to the customer's older invoices, the shortfall is booked as
      -- a debt against THIS sale — so a bill that simply says "Paid Cash"
      -- tells the customer they owe nothing while the ledger says otherwise.
      -- Both figures ship with the bill so it can state the truth.
      'outstanding', coalesce(
        (select d.remaining_amount from public.debts d where d.sale_id = v_sale.id), 0),
      'amount_paid', v_sale.total_amount - coalesce(
        (select d.remaining_amount from public.debts d where d.sale_id = v_sale.id), 0),
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
