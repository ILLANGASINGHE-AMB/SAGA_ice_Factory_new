-- Reconcile the Transport tab's driver selection with the Employees tab.
-- TransportTab.md always specified "Driver: (linked to employee tab)"; the
-- standalone `drivers` table (20260821060000_add_transport.sql) was only a
-- stand-in used because no Employees tab existed yet. Employees now exists
-- (20260821070000_add_employees.sql), so transport_trips.driver_id is
-- repointed at employees(id) — any saved employee can be picked as a
-- driver — and the standalone drivers table is dropped.
--
-- Neither prior migration has been run against a live database yet, so no
-- data backfill is included here. If drivers rows already exist live,
-- migrate them into employees manually first (nic is required/unique on
-- employees and can't be synthesized from a driver row) before applying
-- this migration.

alter table public.transport_trips
  drop constraint if exists transport_trips_driver_id_fkey;

alter table public.transport_trips
  rename column driver_id to employee_id;

alter table public.transport_trips
  add constraint transport_trips_employee_id_fkey
    foreign key (employee_id) references public.employees(id) on delete restrict;

drop index if exists idx_transport_trips_driver_id;
create index if not exists idx_transport_trips_employee_id on public.transport_trips(employee_id);

drop table if exists public.drivers;
