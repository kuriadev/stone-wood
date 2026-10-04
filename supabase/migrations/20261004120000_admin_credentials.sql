-- Admin credentials the owner can change from inside the app.
--
-- Until now the username and password lived only in ADMIN_USERNAME and
-- ADMIN_PASSWORD. Environment variables cannot be rewritten by a running
-- app, so the owner had to open the hosting dashboard and redeploy to
-- change a password — in practice, it never got changed.
--
-- This table holds at most one row. While it is empty the env vars are
-- still what count, so an existing deployment keeps working untouched and
-- nothing has to be migrated; the first save from the Admin account screen
-- creates the row and from then on the row wins.
--
-- The password is never stored. What is stored is a scrypt hash and the
-- random salt it was derived with, so the column is useless to anyone who
-- gets a copy of the table.

create table if not exists public.admin_credentials (
  -- One row, always. The check makes a second row impossible rather than
  -- relying on the application to remember.
  id            smallint primary key default 1 check (id = 1),
  username      text        not null,
  password_hash text        not null,
  password_salt text        not null,
  updated_at    timestamptz not null default now()
);

comment on table public.admin_credentials is
  'At most one row: the admin sign-in. Empty means the ADMIN_USERNAME / ADMIN_PASSWORD env vars are in force.';
comment on column public.admin_credentials.password_hash is
  'scrypt(password, salt) — the password itself is never stored.';

alter table public.admin_credentials enable row level security;

-- No policy is created on purpose. With RLS on and no policy, the anon key
-- can neither read nor write this table; only the service-role key used by
-- the server routes can touch it. A policy here would be a way in.
