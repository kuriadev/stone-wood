-- Emergency requests (app/api/bookings/[id]/emergency). Inside the
-- date-change notice window a guest can't cancel or move online; they send
-- the resort what happened, with proof, and it lands in Guest Messages as
-- type 'Emergency'. Staff look at the proof and approve or decline it.

alter table public.customer_messages
  add column if not exists booking_id text,
  -- The proof: [{ name, type, data }] with data a data: URL (a compressed
  -- photo or a small PDF). Loaded only when staff open the message.
  add column if not exists attachments jsonb not null default '[]'::jsonb,
  add column if not exists attachment_count smallint not null default 0,
  add column if not exists resolution text,
  add column if not exists resolution_note text,
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by text;

alter table public.customer_messages
  drop constraint if exists customer_messages_resolution_check;
alter table public.customer_messages
  add constraint customer_messages_resolution_check check (resolution is null or resolution in ('Approved', 'Declined'));

create index if not exists customer_messages_booking_id_idx on public.customer_messages (booking_id);
