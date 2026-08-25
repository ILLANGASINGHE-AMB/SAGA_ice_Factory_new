-- ==========================================================================
-- Debt settlements: route the money to the right store of value
-- ==========================================================================
--
-- Until now every debt settlement was treated as cash in the till, whatever
-- the payment method said. Settlements can now be taken as Cash, a
-- Bank/Online Transfer, or a Cheque, and each must land in its own store:
--
--   Cash              -> Cash Balance      (unchanged, derived from debt_settlements)
--   Bank/Online       -> Bank Balance      (a bank_deposits row, cash_method 'debt_settlement')
--   Cheque            -> Hand Cheques      (a cheque_records row, status 'pending')
--
-- 1. bank_deposits.cash_method gains 'debt_settlement'. It is kept distinct
--    from 'sales'/'other' because those two mean "cash physically left the
--    till and went to the bank" and therefore REDUCE Cash Balance. A debt
--    paid by online transfer never passed through the till, so it must not.
--
-- 2. Both bank_deposits and cheque_records gain a nullable settlement_id so
--    a banked transfer or a received cheque can be traced back to the
--    settlement that produced it. NULL for every row entered by hand in the
--    Cash & Bank page, which is the existing behaviour.

alter table public.bank_deposits drop constraint if exists bank_deposits_cash_method_check;
alter table public.bank_deposits add constraint bank_deposits_cash_method_check
  check (cash_method in ('sales', 'other', 'cheques', 'debt_settlement'));

alter table public.bank_deposits
  add column if not exists settlement_id bigint references public.debt_settlements(id) on delete set null;

alter table public.cheque_records
  add column if not exists settlement_id bigint references public.debt_settlements(id) on delete set null;

create index if not exists idx_bank_deposits_settlement_id on public.bank_deposits(settlement_id);
create index if not exists idx_cheque_records_settlement_id on public.cheque_records(settlement_id);
