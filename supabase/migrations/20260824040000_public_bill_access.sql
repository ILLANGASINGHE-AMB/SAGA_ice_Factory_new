-- Public bill links.
--
-- The WhatsApp invoice message hands the customer a /bill/<sale_code> link,
-- but PublicBillPage read `sales`, `customers` and `settings` straight through
-- PostgREST — and every select policy on those tables is `to authenticated`.
-- An anonymous customer opening the link therefore always got "Bill invoice
-- not found", which is why the bill link never worked.
--
-- Rather than opening those tables to anon (which would expose the whole
-- customer and sales ledger), this exposes ONE security-definer function that
-- returns just the single bill being asked for. It:
--   * matches on the exact sale_code (an unguessable-enough per-sale token),
--   * enforces the documented 24-hour window server-side, so an expired link
--     stops returning bill data rather than merely being told not to show it,
--   * returns only the fields the bill page renders — no customer address,
--     no notes, nothing about other sales.

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
           'subtotal', si.subtotal
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
