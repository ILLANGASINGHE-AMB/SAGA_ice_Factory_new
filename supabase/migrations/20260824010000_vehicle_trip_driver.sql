-- Vehicle trips: assign a driver.
--
-- The Vehicles tab's "Add Trip" form had no driver field at all, so trips
-- logged from a vehicle profile could not record who drove — unlike
-- transport_trips, which has required employee_id from the start. Nullable
-- here because historical vehicle_trips rows have no driver to backfill with,
-- and `on delete set null` so removing an employee never destroys trip history.

alter table public.vehicle_trips
  add column if not exists employee_id bigint references public.employees(id) on delete set null;

create index if not exists idx_vehicle_trips_employee_id
  on public.vehicle_trips(employee_id);
