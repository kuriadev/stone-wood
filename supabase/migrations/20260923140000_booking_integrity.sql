-- ════════════════════════════════════════════════════════════════════
-- Booking integrity: what online bookings need to reach the database
-- intact and stay trustworthy once they are there.
--
-- 1. Columns the app already relied on but the table never had.
--    `source`, `resource`, `tier` and `archived` lived only in the
--    browser, so they were lost on every reload — and capacity checks
--    (Shared vs Exclusive, pool vs venue) silently fell back to guesses.
--
-- 2. `payment_intent_id`, unique. Links a booking to the PayMongo payment
--    that paid for it, and the unique index means one payment can never
--    be turned into two bookings (a retry or a replayed request just
--    finds the booking that already exists).
--
-- 3. Booking references come from the database. The browser used to
--    build them as "SW-" + (10007 + how many bookings it could see) —
--    every guest saw the same count, so every guest got the same
--    reference. A sequence cannot hand out the same number twice.
--
-- Safe to run twice.
-- ════════════════════════════════════════════════════════════════════

begin;

-- ── 1. Missing columns ──────────────────────────────────────────────
alter table public.bookings
  add column if not exists source      text not null default 'Online',
  add column if not exists resource    text,
  add column if not exists tier        text,
  add column if not exists archived    boolean not null default false,
  add column if not exists archived_at timestamptz;

alter table public.bookings drop constraint if exists bookings_source_check;
alter table public.bookings add constraint bookings_source_check
  check (source in ('Online','Walk-In'));

-- NULL is kept legal for rows written before these columns existed; the
-- app reads a NULL resource as 'Pool' and derives a NULL tier from the
-- guest count, exactly as it always has.
alter table public.bookings drop constraint if exists bookings_resource_check;
alter table public.bookings add constraint bookings_resource_check
  check (resource is null or resource in ('Pool','Venue','Pool+Venue'));

alter table public.bookings drop constraint if exists bookings_tier_check;
alter table public.bookings add constraint bookings_tier_check
  check (tier is null or tier in ('Shared','Exclusive'));

-- ── 2. Payment link ─────────────────────────────────────────────────
alter table public.bookings
  add column if not exists payment_intent_id text;

create unique index if not exists bookings_payment_intent_id_key
  on public.bookings (payment_intent_id)
  where payment_intent_id is not null;

-- ── 3. Server-generated references ──────────────────────────────────
create sequence if not exists public.booking_ref_seq;

-- Start above every reference already in the table, so no new booking
-- can collide with an old one. 10100 is a floor for an empty table.
select setval(
  'public.booking_ref_seq',
  greatest(
    10100,
    coalesce((select max((substring(id from '^SW-(\d+)$'))::bigint) from public.bookings), 0) + 1
  ),
  false
);

alter table public.bookings
  alter column id set default ('SW-' || nextval('public.booking_ref_seq'));

-- The API routes insert with the service-role key; make sure that role
-- can draw from the sequence the default now calls.
grant usage, select on sequence public.booking_ref_seq to service_role;

commit;
