-- Daily Manager Report: employee/vehicle sections now read live from
-- employee_attendance and vehicle_trips (per DailyManagerReport.md's
-- "Fetch data from: Employee Details All History" / "Vehicles, Vehicle
-- History" spec) instead of being typed in ad hoc on the report form.
-- The employee_logs/vehicle_logs jsonb columns are no longer written by
-- the app, so they're dropped rather than left as dead columns.

alter table public.daily_manager_reports
  drop column if exists employee_logs;

alter table public.daily_manager_reports
  drop column if exists vehicle_logs;
