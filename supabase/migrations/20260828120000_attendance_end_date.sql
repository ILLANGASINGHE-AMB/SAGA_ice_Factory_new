-- Employee attendance: record the date a shift *ends*, not just the date it starts.
--
-- Factory shifts routinely cross midnight (start 08:00 today, end 08:00
-- tomorrow). With a single `attendance_date` there was nowhere to say that,
-- and the grid's "End Time cannot be earlier than Start Time" guard made an
-- overnight shift impossible to save at all. `end_date` closes the shift, so
-- start/end become real points in time and the comparison is done on the
-- full timestamp instead of the clock time alone.
--
-- `attendance_date` keeps its name (it is referenced by the daily manager
-- report and the tab's date filter) and now means the shift's *start* date;
-- the UI labels it "Start Date".

alter table public.employee_attendance
  add column if not exists end_date date;

-- Every existing row was recorded under the same-day assumption, so its shift
-- ended on the day it started. Only rows that actually have an end time get a
-- date — a row with no end time is an open shift with no end to date.
update public.employee_attendance
  set end_date = attendance_date
  where end_date is null and end_time is not null;

-- A shift can span midnight but never runs backwards.
alter table public.employee_attendance
  drop constraint if exists employee_attendance_date_order;
alter table public.employee_attendance
  add constraint employee_attendance_date_order
  check (end_date is null or end_date >= attendance_date);
