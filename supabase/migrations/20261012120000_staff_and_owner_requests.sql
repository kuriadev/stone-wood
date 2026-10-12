-- ── Staff accounts, roles and requests to the owner ────────────────
--
-- Until now there was ONE admin sign-in (admin_credentials, or the
-- ADMIN_USERNAME / ADMIN_PASSWORD env vars) and every action was logged as
-- "Admin". Whoever worked the counter or cleaned the pool either used the
-- owner's password or told the owner, who typed it in. The system recorded
-- the work but did not take any of it off the owner.
--
-- 1. staff — one row per person, with a role:
--      Owner      everything, and the only one who can approve requests
--      FrontDesk  the counter: bookings, walk-ins, payments, check-in/out
--      Caretaker  facilities: prepare, inspect, clean, upkeep, stock use
--    The table starts EMPTY. While it is empty the old single sign-in still
--    works and is the Owner; the first time the owner signs in after this
--    migration, their row is created from those same credentials. Nothing
--    has to be entered by hand and nobody is locked out.
--
-- 2. owner_requests — what front desk asks the owner to do (refund, void a
--    payment, cancel or delete a booking, close the day). The request keeps
--    the exact call that was refused; approving it replays that call as the
--    owner, so the refund/void/cancel logic exists in one place only.
--
-- 3. activity_log gains staff_id / staff_name, so every line says WHO.
--
-- Safe to run more than once. Only adds; nothing existing is changed.

begin;

-- ── 1. Staff ────────────────────────────────────────────────────────
create table if not exists public.staff (
  id             uuid primary key default gen_random_uuid(),
  name           text        not null check (char_length(name) between 2 and 60),
  username       text        not null,
  role           text        not null check (role in ('Owner','FrontDesk','Caretaker')),
  -- scrypt, exactly as admin_credentials: the password is never stored.
  password_hash  text        not null,
  password_salt  text        not null,
  active         boolean     not null default true,
  -- Set when the owner resets a password, so the person picks their own
  -- at their next sign-in.
  must_change_password boolean not null default false,
  created_at     timestamptz not null default now(),
  last_login_at  timestamptz
);

-- Usernames are case-insensitive: "Ana" and "ana" are the same person.
create unique index if not exists staff_username_key on public.staff (lower(username));

comment on table public.staff is
  'Everyone who signs in to the admin. Empty means the single admin_credentials / env sign-in is still in force (as Owner).';

alter table public.staff enable row level security;
-- No policy on purpose: only the server (service-role key) may read it.

-- ── 2. Requests to the owner ────────────────────────────────────────
create table if not exists public.owner_requests (
  id             bigint generated always as identity primary key,
  kind           text        not null,
  status         text        not null default 'Pending'
                   check (status in ('Pending','Approved','Declined','Withdrawn')),
  -- The refused call, replayed on approval.
  method         text        not null check (method in ('POST','PATCH','PUT','DELETE')),
  path           text        not null,
  body           jsonb,
  -- What the screen shows: "Void ₱2,000 GCash payment on SW-10150".
  summary        text        not null default '',
  reason         text        not null default '',
  booking_id     text,
  requested_by   uuid        references public.staff (id),
  requested_by_name text     not null default '',
  requested_at   timestamptz not null default now(),
  decided_by     uuid        references public.staff (id),
  decided_by_name text,
  decided_at     timestamptz,
  decision_note  text,
  -- The last time an approval was tried and the action itself failed
  -- (e.g. the payment had already been voided). The request stays Pending.
  last_error     text
);

create index if not exists owner_requests_status_idx  on public.owner_requests (status, requested_at desc);
create index if not exists owner_requests_booking_idx on public.owner_requests (booking_id);

alter table public.owner_requests enable row level security;

-- ── 3. Who did it ───────────────────────────────────────────────────
alter table public.activity_log add column if not exists staff_id   uuid;
alter table public.activity_log add column if not exists staff_name text;
create index if not exists activity_log_staff_idx on public.activity_log (staff_id);

commit;
