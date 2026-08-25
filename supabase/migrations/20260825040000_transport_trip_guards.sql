-- ==========================================================================
-- Transport trips: one ongoing trip per vehicle, End KM strictly > Start KM
-- ==========================================================================
--
-- 1. ONE ONGOING TRIP PER VEHICLE. Nothing stopped the same vehicle being
--    started on two trips at once — a partial unique index on (vehicle_id)
--    where status = 'ongoing' makes it impossible at the database level, not
--    just in the UI, so two operators racing to start the same vehicle can't
--    both succeed.
--
--    If this fails to create, it means duplicate ongoing trips already exist
--    for some vehicle — end (or soft-delete) the extras for that vehicle
--    first, then re-run this migration.
--
-- 2. END KM MUST BE STRICTLY GREATER THAN START KM. The existing check
--    constraint allowed end_odometer = start_odometer (a zero-distance trip).
--    Tightened to a real ">".

create unique index if not exists idx_transport_trips_one_ongoing_per_vehicle
  on public.transport_trips(vehicle_id)
  where status = 'ongoing';

-- NOT VALID: enforced for every new insert/update from this point on, but
-- does not retroactively scan and reject existing rows. A historical trip
-- that happens to have End KM = Start KM (allowed under the old >= rule)
-- is left exactly as recorded rather than blocking this migration.
alter table public.transport_trips drop constraint if exists transport_trips_odometer_order;
alter table public.transport_trips add constraint transport_trips_odometer_order
  check (end_odometer is null or end_odometer > start_odometer) not valid;
