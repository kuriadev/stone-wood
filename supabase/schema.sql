-- ════════════════════════════════════════════════════════════════════
-- StoneWood Resort — Supabase schema
-- Run this in the Supabase dashboard → SQL Editor → New query.
-- Mirrors the TypeScript shapes in types/ so the app can move over
-- table by table without changing its interfaces.
-- ════════════════════════════════════════════════════════════════════

-- ── ROOMS ───────────────────────────────────────────────────────────
create table if not exists public.rooms (
  id          bigint generated always as identity primary key,
  name        text    not null,
  beds        text    not null,
  capacity    integer not null check (capacity > 0),
  price       numeric(10,2) not null check (price >= 0),
  -- NOTE: `desc` is a reserved SQL keyword, so the column is
  -- `description`. Map it back to `desc` when you select.
  description text    not null,
  img         text    not null,
  created_at  timestamptz not null default now()
);

-- ── BOOKINGS ────────────────────────────────────────────────────────
-- `id` stays text because the app generates "SW-10007" style ids
-- (see genBookingId in lib/utils.ts).
create table if not exists public.bookings (
  id            text primary key,
  name          text    not null,
  contact       text    not null,
  email         text    not null,
  date          date    not null,
  guests        integer not null check (guests > 0),
  package       text    not null,
  rooms         integer[] not null default '{}',
  overtime      integer not null default 0,
  total         numeric(10,2) not null,
  downpayment   numeric(10,2) not null,
  status        text    not null default 'Paid'
                  check (status in ('Paid','Confirmed','Completed','Cancelled')),
  payment_proof boolean not null default false,
  notes         text    not null default '',
  cancel_reason text,
  created_at    timestamptz not null default now()
);

create index if not exists bookings_date_idx   on public.bookings (date);
create index if not exists bookings_status_idx on public.bookings (status);
create index if not exists bookings_email_idx  on public.bookings (email);

-- ── INVENTORY ───────────────────────────────────────────────────────
create table if not exists public.inventory (
  id         bigint generated always as identity primary key,
  category   text    not null
              check (category in ('Pool & Chemicals','Furniture & Misc','Cleaning Tools')),
  name       text    not null,
  qty        integer not null default 0 check (qty >= 0),
  unit       text    not null,
  min_qty    integer not null default 0 check (min_qty >= 0),
  notes      text    not null default '',
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists inventory_category_idx on public.inventory (category);

-- ── CUSTOMER MESSAGES ───────────────────────────────────────────────
create table if not exists public.customer_messages (
  id          bigint generated always as identity primary key,
  name        text not null,
  email       text not null,
  type        text not null,
  message     text not null,
  date        date not null,
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);

-- ── CLOSED DATES ────────────────────────────────────────────────────
create table if not exists public.closed_dates (
  date   date primary key,
  reason text not null default ''
);

-- ── GALLERY ─────────────────────────────────────────────────────────
create table if not exists public.gallery (
  id         bigint generated always as identity primary key,
  url        text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- ════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- RLS is ON for every table. Public visitors get read-only access to
-- the marketing content and may create a booking; nothing else is
-- reachable with the anon key. Admin work must go through the service
-- role key on the server, never the browser.
-- ════════════════════════════════════════════════════════════════════
alter table public.rooms             enable row level security;
alter table public.bookings          enable row level security;
alter table public.inventory         enable row level security;
alter table public.customer_messages enable row level security;
alter table public.closed_dates      enable row level security;
alter table public.gallery           enable row level security;

-- Public, read-only marketing content.
create policy "rooms are publicly readable"
  on public.rooms for select using (true);

create policy "gallery is publicly readable"
  on public.gallery for select using (true);

create policy "closed dates are publicly readable"
  on public.closed_dates for select using (true);

-- Visitors may submit a booking or an enquiry, but never read them back.
create policy "anyone may create a booking"
  on public.bookings for insert with check (true);

create policy "anyone may send a message"
  on public.customer_messages for insert with check (true);

-- inventory has no anon policy at all, so it is server-only by default.
