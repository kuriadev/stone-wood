-- Children under 3 on a booking (lib/children.ts). Inside `guests` for a
-- Shared booking (billed per guest), free and on top of it for Exclusive.
alter table public.bookings
  add column if not exists children smallint not null default 0;

alter table public.bookings
  drop constraint if exists bookings_children_range;
alter table public.bookings
  add constraint bookings_children_range check (children between 0 and 100);
