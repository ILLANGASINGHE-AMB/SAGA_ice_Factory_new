-- Cash/Bank/Cheque logic fixes per Final_Cash_Bank_Cheque_Logic.md.
--
-- Daily Manager Report Section 06 (Bank Deposit Details) is now fully
-- derived, live, from the real Cash & Bank ledger tables (cash_receives /
-- bank_deposits / cheque_records / bank_withdrawals) — the exact same math
-- used by the Cash & Bank page — instead of manager-typed figures that were
-- also being silently overwritten by a separate auto-upsert from the Cash &
-- Bank page (a genuine dueling-writer race) and summed into a nonsensical
-- combined "Total" (Cash Balance + Bank Balance + Hand Cheques), which
-- violates the spec's core rule that these are three separate stores of
-- value that must never be double-counted.
--
-- The manual-entry columns behind that flow are no longer written by the
-- app, so they're dropped rather than left as dead columns (same precedent
-- as 20260822010000_daily_report_drop_manual_logs.sql and
-- 20260822030000_daily_report_drop_brine_pm_fields.sql).

alter table public.daily_manager_reports
  drop column if exists bank_deposit_amount;

alter table public.daily_manager_reports
  drop column if exists bank_deposit_today;

alter table public.daily_manager_reports
  drop column if exists cash_deposited_today;

alter table public.daily_manager_reports
  drop column if exists cash_on_hand;

alter table public.daily_manager_reports
  drop column if exists cash_on_hand_confirmed;

alter table public.daily_manager_reports
  drop column if exists cheques_on_hand;

alter table public.daily_manager_reports
  drop column if exists cheque_entries;

alter table public.daily_manager_reports
  drop column if exists withdrawals;
