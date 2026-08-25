-- ==========================================================================
-- FIN-17 follow-up: assert the cash-order invariant instead of trusting it
-- ==========================================================================
-- 20260826030000 fixed the arithmetic; nothing verifies it stayed fixed.
-- ledger_consistency_report() checks quantities, debt aging, paid-vs-
-- settlements and cheque routing, but has no assertion at all about the
-- shortfall a cash order opens -- so if that logic ever regresses, the
-- receivables quietly drain again with a clean report.
--
-- Two checks are added. The first is mechanical, the second is the business
-- rule itself:
--
--   1. cash_order_shortfall_debt
--      A cash order whose cash was diverted to older invoices must carry a
--      debt of exactly what was diverted -- no more, no less, and never
--      missing.
--
--   2. customer_outstanding_vs_ledger
--      A customer owes the value of the ice they took ON CREDIT, less every
--      rupee they have actually handed over. Cash orders cancel out of this
--      identity entirely, which is the invariant stated the long way round:
--
--        A CASH ORDER NEVER CHANGES A CUSTOMER'S TOTAL OUTSTANDING.
--
--      Worked against the reported chain:
--
--        credit order  32,500                    -> owed 32,500
--        cash order    40,000 (32,500 diverted)  -> owed 32,500
--        cash order    95,000 (32,500 diverted)  -> owed 32,500
--
--        credit taken 32,500 - payments 0 = 32,500  == open debts  OK
--
--      The third order opens a debt of 32,500, not 62,500: the 62,500 is the
--      cash left over AFTER clearing the previous invoice, and that money
--      paid for the order rather than being owed on it. Booking 62,500 would
--      have the customer owing MORE after paying 95,000 cash for 95,000 of
--      ice -- 30,000 conjured out of nothing, which check 2 rejects.
--
-- Both are reports, not constraints, for the reason given at the top of
-- section 11: a hard constraint would turn historical bad data into an outage.
--
--   select * from public.ledger_consistency_report();   -- expect 0 rows
-- --------------------------------------------------------------------------

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

  -- FIN-17: a cash order whose cash was diverted to the customer's older
  -- invoices must carry a debt of exactly what was diverted.
  --
  -- The cap at the order total matters: cash cannot fund more of other
  -- invoices than the customer actually handed over for this one, so an
  -- `applied` above the order total is itself the bug being caught.
  --
  -- A cash order that diverted nothing must carry no debt, which the same
  -- comparison covers -- least(0, total) is 0.
  select 'cash_order_shortfall_debt'::text,
         s.sale_code,
         format('cash order %s diverted %s to older invoices but carries a debt of %s (expected %s)',
                s.total_amount, coalesce(x.applied, 0), coalesce(d.total_amount, 0),
                least(coalesce(x.applied, 0), s.total_amount))
    from public.sales s
    left join (
      select source_sale_id, sum(amount_paid) as applied
        from public.debt_settlements
       where is_auto_applied and source_sale_id is not null
       group by source_sale_id
    ) x on x.source_sale_id = s.id
    left join public.debts d on d.sale_id = s.id
   where s.payment_type = 'cash'
     and coalesce(d.total_amount, 0)
         is distinct from least(coalesce(x.applied, 0), s.total_amount)

  union all

  -- FIN-17: the business rule itself. What a customer owes is the ice they
  -- took on credit, less every rupee they actually handed over. Cash orders
  -- appear on neither side -- they pay for themselves -- which is exactly why
  -- one can never move the balance.
  --
  -- Auto-applied settlements are excluded from "handed over" on purpose: that
  -- row is the FIFO offset moving a balance between two invoices, not new
  -- money at the till. Counting it would credit the same rupees twice, which
  -- is the original FIN-17 loss in a different guise.
  --
  -- Debts with no sale behind them (a hand-entered opening balance) count as
  -- credit taken, or every such customer reports as broken.
  select 'customer_outstanding_vs_ledger'::text,
         coalesce(c.customer_code, c.id::text),
         format('open debts %s, but credit taken %s - payments received %s = %s',
                t.owed, t.credit_taken, t.payments, t.credit_taken - t.payments)
    from public.customers c
    join lateral (
      select
        coalesce((select sum(d.remaining_amount)
                    from public.debts d
                   where d.customer_id = c.id and d.status <> 'settled'), 0) as owed,
        coalesce((select sum(s.total_amount)
                    from public.sales s
                   where s.customer_id = c.id and s.payment_type = 'debt'), 0)
        + coalesce((select sum(d.total_amount)
                      from public.debts d
                     where d.customer_id = c.id and d.sale_id is null), 0) as credit_taken,
        coalesce((select sum(ds.amount_paid)
                    from public.debt_settlements ds
                   where ds.customer_id = c.id and not ds.is_auto_applied), 0) as payments
    ) t on true
   where t.owed is distinct from (t.credit_taken - t.payments)

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

-- --------------------------------------------------------------------------
-- One customer's receivables, event by event
-- --------------------------------------------------------------------------
-- What the report above cannot do is show WHERE a balance went wrong. This
-- replays a single customer's orders and payments in the order they happened,
-- so the chain can be read off directly:
--
--   select * from public.customer_debt_ledger(<customer_id>);
--
--   kind          code   order_total  cash_diverted  debt_opened  balance_after
--   credit order  S0001       32,500              0       32,500         32,500
--   cash order    S0002       40,000         32,500       32,500         32,500
--   cash order    S0003       95,000         32,500       32,500         32,500
--
-- balance_after is derived from the business rule, NOT from the debts table:
-- credit taken so far minus payments received so far. Where it stops agreeing
-- with the debt rows on the same line is where the bug is. A cash order moves
-- it by zero, every time -- that column IS the invariant.
create or replace function public.customer_debt_ledger(p_customer_id bigint)
returns table (
  occurred_at    timestamptz,
  kind           text,
  code           text,
  order_total    numeric,
  cash_diverted  numeric,
  debt_opened    numeric,
  debt_remaining numeric,
  balance_after  numeric
) as $$
  -- Every output column below is qualified with the `e.` alias on purpose.
  -- In a SQL-language function the RETURNS TABLE names are parameters, and an
  -- unqualified `occurred_at` in the outer select is ambiguous against them --
  -- the kind of ambiguity that resolves to a column of NULLs rather than an
  -- error. Qualifying leaves nothing to resolve.
  with events as (
    select
      s.sale_date as ev_at,
      case when s.payment_type = 'debt' then 'credit order' else 'cash order' end as ev_kind,
      s.sale_code as ev_code,
      s.total_amount as ev_order_total,
      -- What this order's cash was pulled away to pay off elsewhere.
      coalesce((select sum(ds.amount_paid)
                  from public.debt_settlements ds
                 where ds.source_sale_id = s.id and ds.is_auto_applied), 0) as ev_diverted,
      coalesce((select d.total_amount from public.debts d
                 where d.sale_id = s.id order by d.id limit 1), 0) as ev_debt_opened,
      coalesce((select d.remaining_amount from public.debts d
                 where d.sale_id = s.id order by d.id limit 1), 0) as ev_debt_remaining,
      -- Only credit orders move the balance. This is the whole rule.
      case when s.payment_type = 'debt' then s.total_amount else 0 end as ev_delta,
      s.id as ev_tiebreak
    from public.sales s
    where s.customer_id = p_customer_id

    union all

    -- Real money handed over later. Auto-applied rows are deliberately absent:
    -- they are an internal transfer between two of this customer's invoices,
    -- already accounted for by the shortfall the funding order opened.
    select
      ds.settlement_date,
      'payment (' || ds.payment_method || ')',
      ds.settlement_code,
      0, 0, 0, 0,
      -ds.amount_paid,
      ds.id
    from public.debt_settlements ds
    where ds.customer_id = p_customer_id
      and not ds.is_auto_applied
  )
  select
    e.ev_at, e.ev_kind, e.ev_code, e.ev_order_total,
    e.ev_diverted, e.ev_debt_opened, e.ev_debt_remaining,
    sum(e.ev_delta) over (order by e.ev_at, e.ev_tiebreak
                          rows between unbounded preceding and current row)
  from events e
  order by e.ev_at, e.ev_tiebreak;
$$ language sql stable security definer set search_path = public;

grant execute on function public.ledger_consistency_report() to authenticated;
grant execute on function public.customer_debt_ledger(bigint) to authenticated;
