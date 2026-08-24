-- One-time (walk-in) customers.
--
-- Selling to someone who is not a registered account previously meant either
-- picking the wrong customer or forcing a full registration — the quick form
-- demands a name AND a valid 10-digit WhatsApp number, and the table itself
-- required at least one contact number. A walk-in buying a few cubes for cash
-- has neither.
--
-- One-time customers are still real rows (so the sale, its bill and any
-- cheque stay properly attributed), just flagged so they can be kept out of
-- the main registry views and are exempt from the contact-number requirement.

alter table public.customers
  add column if not exists is_one_time boolean not null default false;

-- Relax the contact requirement for one-time customers only. Registered
-- accounts still need a number, since that is how they get notified.
alter table public.customers
  drop constraint if exists customers_has_a_number;

alter table public.customers
  add constraint customers_has_a_number
  check (is_one_time or whatsapp_number is not null or contact_number is not null);

create index if not exists idx_customers_is_one_time on public.customers(is_one_time);
