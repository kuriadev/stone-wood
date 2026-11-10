-- A guest can correct their own name, email and number from Manage booking
-- (app/api/bookings/[id]/details), once every 12 hours. This is when they
-- last did.
alter table public.bookings
  add column if not exists details_updated_at timestamptz;
