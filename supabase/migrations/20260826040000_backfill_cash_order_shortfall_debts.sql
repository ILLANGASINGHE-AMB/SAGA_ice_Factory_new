-- ==========================================================================
-- FIN-17 repair: rebuild the receivables past cash orders wrote off
-- ==========================================================================
-- 20260826030000 stops the loss happening again, but every cash order already
-- placed against an outstanding balance has ALREADY destroyed receivables:
-- its cash cleared an old invoice and no shortfall was ever opened against the
-- order itself.
--
-- This is deliberately NOT applied automatically. It creates debt rows against
-- real customers, which is a business decision -- run the dry run, read the
-- list, then run it for real:
--
--   select * from public.backfill_cash_order_shortfall_debts();       -- preview
--   select * from public.backfill_cash_order_shortfall_debts(false);  -- apply
--
-- The repair is idempotent: a sale that already carries a debt row is skipped,
-- so running it twice cannot double-charge anyone.
-- --------------------------------------------------------------------------

create or replace function public.backfill_cash_order_shortfall_debts(
  p_dry_run boolean default true
)
returns table (
  sale_code       text,
  customer_name   text,
  sale_date       timestamptz,
  order_total     numeric,
  applied_to_old  numeric,
  shortfall       numeric,
  action          text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  if not public.is_admin() then
    raise exception 'Only admins can repair receivables';
  end if;

  for v_row in
    select s.id, s.sale_code, s.sale_date, s.customer_id, s.total_amount,
           c.name as customer_name,
           sum(ds.amount_paid) as applied
      from public.sales s
      join public.debt_settlements ds
        on ds.source_sale_id = s.id and ds.is_auto_applied
      left join public.customers c on c.id = s.customer_id
     where s.payment_type = 'cash'
       -- Idempotency: a sale that already carries its own debt row has either
       -- been repaired already or was written by the patched RPC.
       and not exists (select 1 from public.debts d where d.sale_id = s.id)
     group by s.id, s.sale_code, s.sale_date, s.customer_id, s.total_amount, c.name
     order by s.sale_date, s.id
  loop
    -- The shortfall is whatever this order's cash was diverted to, capped at
    -- the order total: cash cannot fund more of other invoices than the
    -- customer actually handed over for this one.
    if not p_dry_run then
      insert into public.debts (
        sale_id, customer_id, total_amount, paid_amount, remaining_amount,
        status, created_at, last_activity_at
      ) values (
        v_row.id, v_row.customer_id,
        least(v_row.applied, v_row.total_amount), 0,
        least(v_row.applied, v_row.total_amount),
        'pending',
        -- Matches the sale's date, both for the `debt_created_at_vs_sale_date`
        -- ledger check and so FIFO aging places it correctly among the
        -- customer's other invoices.
        v_row.sale_date, timezone('utc'::text, now())
      );
    end if;

    sale_code      := v_row.sale_code;
    customer_name  := coalesce(v_row.customer_name, '(deleted customer)');
    sale_date      := v_row.sale_date;
    order_total    := v_row.total_amount;
    applied_to_old := v_row.applied;
    shortfall      := least(v_row.applied, v_row.total_amount);
    action         := case when p_dry_run then 'would create' else 'created' end;
    return next;
  end loop;
end;
$$;

grant execute on function public.backfill_cash_order_shortfall_debts(boolean) to authenticated;
