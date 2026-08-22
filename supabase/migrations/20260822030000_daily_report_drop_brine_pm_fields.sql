-- Daily Manager Report Section 01: only Free Issue and Damaged Cubes are
-- manager-editable now — Brine reverts to a fully auto-calculated,
-- read-only figure (same as Production/Purchases), and the unused
-- "PM Production Quantity" text box is removed entirely. The manual-entry
-- override columns behind both are no longer written by the app, so
-- they're dropped rather than left as dead columns (same precedent as
-- 20260822010000_daily_report_drop_manual_logs.sql).

alter table public.daily_manager_reports
  drop column if exists brine_cubes;

alter table public.daily_manager_reports
  drop column if exists brine_cubes_confirmed;

alter table public.daily_manager_reports
  drop column if exists pm_production_qty;
