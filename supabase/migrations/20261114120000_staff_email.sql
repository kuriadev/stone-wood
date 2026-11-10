-- A confirmed email on each staff account (Staff Accounts → Edit). Saved
-- only after a 6-digit code sent to it is typed in, and used to reset a
-- forgotten password from the sign-in page (app/api/auth/forgot).
alter table public.staff
  add column if not exists email text,
  add column if not exists email_verified_at timestamptz;

-- One account per address.
create unique index if not exists staff_email_unique on public.staff (lower(email)) where email is not null;
