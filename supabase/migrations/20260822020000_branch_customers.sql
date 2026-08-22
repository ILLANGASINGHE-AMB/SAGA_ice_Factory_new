-- Settings "Set Branch" feature: permanent branch "customers" (e.g. an
-- internal branch location cubes are transferred to) that behave exactly
-- like normal customers in Customers/Sales, flagged so the UI can show a
-- small red "B" indicator next to their name and route edit/delete through
-- the Settings tab only. Generalizes the previous hardcoded "Branch PK"
-- customer-name check in the Daily Manager Report into a real flag any
-- number of branches can carry.

alter table public.customers
  add column if not exists is_branch boolean not null default false;

alter table public.customers
  add column if not exists notes text default '';
