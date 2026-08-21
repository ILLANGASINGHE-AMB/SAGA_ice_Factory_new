-- Rename the Brine Cubes inventory code from WST-0001 to BNC-0001, matching
-- the WST -> BNC rename applied across the frontend (Badge.jsx, SalesPage.jsx,
-- InventoryPage.jsx) and the seed data in supabase_schema.sql.

update public.inventory
set code = 'BNC-0001'
where code = 'WST-0001';
