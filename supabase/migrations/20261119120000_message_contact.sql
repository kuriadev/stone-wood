-- The Customer Service form asks for a mobile number, so the resort can call
-- the guest back. Older messages have none.
alter table public.customer_messages add column if not exists contact text;
