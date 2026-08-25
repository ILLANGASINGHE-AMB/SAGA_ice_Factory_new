-- ==========================================================================
-- Mark auto-applied debt settlements so they stop double-counting as income
-- ==========================================================================
--
-- THE BUG. When a CASH order is placed for a customer who already owes money,
-- place_*_order_transaction applies that cash against their oldest debts FIFO
-- and writes a debt_settlements row for each amount applied. Those rows have
-- no payment_method of their own, so they default to 'cash'.
--
-- Every figure that adds "cash sales + cash settlements" therefore counted the
-- same money twice. A LKR 1,000 cash sale against a LKR 400 old debt:
--
--   cash sales total          1,000   (the sale)
--   cash settlements total    + 400   (the auto-applied offset)
--   ------------------------------
--   reported cash in          1,400   <- but only 1,000 was handed over
--
-- That inflated Cash Balance on the Cash & Bank page, Total Income on the
-- Daily Manager Report, and Settlements Collected in the analytical reports.
--
-- THE FIX. An explicit flag on the row. These settlements are real — the debt
-- genuinely was reduced, and they must keep counting toward debt balances —
-- they simply are not money arriving at the till, because it already arrived
-- as the sale.
--
-- The flag is set two ways, deliberately belt-and-braces:
--   1. place_pooled_order_transaction stamps it explicitly (the live path).
--   2. A BEFORE INSERT trigger sets it from the '(auto-applied from sale …)'
--      marker the order RPCs write into created_by. That covers the two
--      legacy order functions without restating ~150 lines of each, and any
--      future one that follows the same convention. It never overrides an
--      explicit true, so explicit stamping always wins.

alter table public.debt_settlements
  add column if not exists is_auto_applied boolean not null default false;

comment on column public.debt_settlements.is_auto_applied is
  'True when this settlement was created automatically by applying a cash order''s payment against the customer''s existing debt, rather than by someone taking a payment. Such a row reduces debt but is NOT new money at the till — the cash was already counted as the sale.';

-- Backfill from the marker the order RPCs have always written.
update public.debt_settlements
set is_auto_applied = true
where is_auto_applied = false
  and created_by like '%(auto-applied from sale %';

create or replace function public.mark_auto_applied_settlement()
returns trigger as $$
begin
  if new.is_auto_applied is not true
     and new.created_by like '%(auto-applied from sale %' then
    new.is_auto_applied := true;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_mark_auto_applied_settlement on public.debt_settlements;
create trigger trg_mark_auto_applied_settlement
  before insert on public.debt_settlements
  for each row execute function public.mark_auto_applied_settlement();

create index if not exists idx_debt_settlements_is_auto_applied
  on public.debt_settlements(is_auto_applied);
