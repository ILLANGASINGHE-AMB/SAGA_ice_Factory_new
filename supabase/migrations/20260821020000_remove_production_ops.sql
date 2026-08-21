-- Remove "Production & Ops" (production_batches + equipment_maintenance),
-- matching the feature's full removal from the frontend and from
-- supabase_schema.sql. Permanently deletes any historical freezing-batch and
-- equipment-maintenance records.

drop index if exists public.idx_production_batches_date;

drop policy if exists "Allow read production_batches" on public.production_batches;
drop policy if exists "Allow write production_batches" on public.production_batches;
drop policy if exists "Allow read equipment_maintenance" on public.equipment_maintenance;
drop policy if exists "Allow write equipment_maintenance" on public.equipment_maintenance;

drop table if exists public.production_batches;
drop table if exists public.equipment_maintenance;
