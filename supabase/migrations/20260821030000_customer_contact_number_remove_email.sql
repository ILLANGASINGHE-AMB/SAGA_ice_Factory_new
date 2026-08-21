-- Add a separate Contact Number field to customers, make WhatsApp Number
-- optional (either number is enough), and drop the email column entirely.

alter table public.customers
  add column if not exists contact_number text;

alter table public.customers
  alter column whatsapp_number drop not null;

alter table public.customers
  drop column if exists email;

alter table public.customers
  add constraint customers_has_a_number check (whatsapp_number is not null or contact_number is not null);
