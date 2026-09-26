-- ════════════════════════════════════════════════════════════════════
-- Sales monitoring + facility operations (capstone objectives 1 and 2).
--
-- 1. bookings.status 'Paid' → 'Pending'. "Paid" meant "waiting for the
--    admin to approve", which clashes with a ledger where "paid" means money
--    actually received. The meaning is unchanged; only the word is.
--
-- 2. bookings.arrival_time. The walk-in form asked for it but it was only
--    ever glued onto the notes text.
--
-- 3. payments — the sales ledger. Every peso received is its own row:
--    downpayment, balance, full payment, damage penalty, or refund. A row is
--    never deleted or edited; a mistake is VOIDED with a reason, so the
--    history stays auditable.
--
-- 4. expenses + daily_closings — the liquidation side: money going out, and
--    the end-of-day cash count compared with what the system expected.
--
-- 5. damage_rates, facility_inspections, damage_records — preparation and
--    check-out inspections per reservation, and damage penalties computed
--    from the owner's own rate list.
--
-- 6. Backfill: existing bookings get their already-received money copied
--    into payments, so past sales do not vanish from the new module.
--
-- Safe to run twice.
-- ════════════════════════════════════════════════════════════════════

begin;

-- ── 1. Status rename ────────────────────────────────────────────────
alter table public.bookings drop constraint if exists bookings_status_check;
update public.bookings set status = 'Pending' where status = 'Paid';
alter table public.bookings alter column status set default 'Pending';
alter table public.bookings add constraint bookings_status_check
  check (status in ('Pending','Confirmed','Completed','Cancelled'));

-- ── 2. Arrival time ─────────────────────────────────────────────────
alter table public.bookings add column if not exists arrival_time text;
alter table public.bookings drop constraint if exists bookings_arrival_time_check;
alter table public.bookings add constraint bookings_arrival_time_check
  check (arrival_time is null or arrival_time ~ '^\d{2}:\d{2}$');

-- ── 3. Payments ─────────────────────────────────────────────────────
create table if not exists public.payments (
  id           bigint generated always as identity primary key,
  -- set null, not cascade: deleting a booking must never erase money that
  -- was really received. guest_name keeps the row readable on its own.
  booking_id   text references public.bookings (id) on delete set null,
  guest_name   text not null default '',
  type         text not null
                 check (type in ('Downpayment','Balance','Full','Penalty','Refund')),
  method       text not null
                 check (method in ('PayMongo','Cash','GCash','Bank Transfer')),
  -- Always positive. A refund is a positive amount of type 'Refund' and is
  -- subtracted when totals are computed.
  amount       numeric(10,2) not null check (amount > 0),
  reference    text not null default '',
  notes        text not null default '',
  received_at  timestamptz not null default now(),
  voided       boolean not null default false,
  void_reason  text,
  voided_at    timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists payments_booking_idx  on public.payments (booking_id);
create index if not exists payments_received_idx on public.payments (received_at);

-- One PayMongo payment can only ever be recorded once.
create unique index if not exists payments_paymongo_ref_key
  on public.payments (reference)
  where method = 'PayMongo' and reference <> '';

-- ── 4a. Expenses ────────────────────────────────────────────────────
create table if not exists public.expenses (
  id           bigint generated always as identity primary key,
  category     text not null
                 check (category in ('Utilities','Supplies','Repairs','Salaries','Pool Maintenance','Other')),
  description  text not null,
  amount       numeric(10,2) not null check (amount > 0),
  method       text not null default 'Cash'
                 check (method in ('Cash','GCash','Bank Transfer')),
  spent_on     date not null default current_date,
  voided       boolean not null default false,
  void_reason  text,
  voided_at    timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists expenses_spent_on_idx on public.expenses (spent_on);

-- ── 4b. Daily closings (end-of-day liquidation) ─────────────────────
-- One row per day. The figures are stored as they were at closing time,
-- so a later correction elsewhere cannot silently rewrite a closed day.
create table if not exists public.daily_closings (
  closing_date     date primary key,
  opening_float    numeric(10,2) not null default 0 check (opening_float >= 0),
  cash_in          numeric(10,2) not null default 0,
  cash_out         numeric(10,2) not null default 0,
  expected_cash    numeric(10,2) not null default 0,
  counted_cash     numeric(10,2) not null check (counted_cash >= 0),
  difference       numeric(10,2) not null default 0,
  total_collected  numeric(10,2) not null default 0,
  total_expenses   numeric(10,2) not null default 0,
  notes            text not null default '',
  closed_at        timestamptz not null default now()
);

-- ── 5a. Damage rate list ────────────────────────────────────────────
create table if not exists public.damage_rates (
  id          bigint generated always as identity primary key,
  name        text not null,
  category    text not null default 'General',
  unit        text not null default 'pc',
  rate        numeric(10,2) not null check (rate >= 0),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Sample prices only. The owner should replace these with the resort's
-- real replacement/repair charges before the system is used for real.
insert into public.damage_rates (name, category, unit, rate)
select v.name, v.category, v.unit, v.rate
from (values
  ('Monobloc chair',         'Furniture', 'pc',   350),
  ('Folding chair',          'Furniture', 'pc',   650),
  ('Plastic table',          'Furniture', 'pc',  1200),
  ('Pool float / salbabida', 'Pool',      'pc',   400),
  ('Pool tile (per piece)',  'Pool',      'pc',   250),
  ('Towel',                  'Room',      'pc',   300),
  ('Bed sheet / linen',      'Room',      'set',  800),
  ('Pillow',                 'Room',      'pc',   450),
  ('Drinking glass / mug',   'Room',      'pc',    80),
  ('Videoke microphone',     'Amenity',   'pc',  1500),
  ('Billiard cue',           'Amenity',   'pc',   900),
  ('Grill grate',            'Amenity',   'pc',   700)
) as v(name, category, unit, rate)
where not exists (select 1 from public.damage_rates);

-- ── 5b. Inspections ─────────────────────────────────────────────────
-- 'Preparation' = before the group arrives; 'Checkout' = the inspection
-- done before the group leaves. `items` holds one entry per facility:
--   { facilityId, facilityName, checklist: [{label, done}], condition }
create table if not exists public.facility_inspections (
  id            bigint generated always as identity primary key,
  booking_id    text not null references public.bookings (id) on delete cascade,
  stage         text not null check (stage in ('Preparation','Checkout')),
  items         jsonb not null default '[]'::jsonb,
  notes         text not null default '',
  inspected_at  timestamptz not null default now()
);

create index if not exists facility_inspections_booking_idx on public.facility_inspections (booking_id);

-- ── 5c. Damage records ──────────────────────────────────────────────
-- amount = quantity × unit_rate + adjustment. The adjustment exists because
-- real damage is not always full replacement; it requires a reason.
create table if not exists public.damage_records (
  id                 bigint generated always as identity primary key,
  booking_id         text not null references public.bookings (id) on delete cascade,
  inspection_id      bigint references public.facility_inspections (id) on delete set null,
  facility_name      text not null default '',
  rate_id            bigint references public.damage_rates (id) on delete set null,
  item_name          text not null,
  quantity           integer not null check (quantity > 0),
  unit_rate          numeric(10,2) not null check (unit_rate >= 0),
  adjustment         numeric(10,2) not null default 0,
  adjustment_reason  text not null default '',
  amount             numeric(10,2) not null check (amount >= 0),
  description        text not null default '',
  voided             boolean not null default false,
  void_reason        text,
  created_at         timestamptz not null default now()
);

create index if not exists damage_records_booking_idx on public.damage_records (booking_id);

-- ── RLS: staff-only tables, reached through the service role only ───
alter table public.payments             enable row level security;
alter table public.expenses             enable row level security;
alter table public.daily_closings       enable row level security;
alter table public.damage_rates         enable row level security;
alter table public.facility_inspections enable row level security;
alter table public.damage_records       enable row level security;

-- ── 6. Backfill payments from existing bookings ─────────────────────
-- Money already received before this module existed:
--   * bookings with payment_proof = true received their `downpayment`
--     (PayMongo for online, cash for walk-ins that were marked collected).
--   * Completed bookings are assumed to have settled their balance at
--     checkout — the resort does not let a group leave unpaid. The note on
--     each row says so, so it can be voided if that was not the case.
insert into public.payments (booking_id, guest_name, type, method, amount, reference, notes, received_at)
select b.id, b.name,
       case when b.downpayment >= b.total then 'Full' else 'Downpayment' end,
       case when b.payment_intent_id is not null then 'PayMongo' else 'Cash' end,
       b.downpayment,
       coalesce(b.payment_intent_id, ''),
       'Imported from the booking record when the sales module was added.',
       b.created_at
from public.bookings b
where b.payment_proof = true
  and b.downpayment > 0
  and not exists (select 1 from public.payments p where p.booking_id = b.id);

insert into public.payments (booking_id, guest_name, type, method, amount, notes, received_at)
select b.id, b.name, 'Balance', 'Cash', b.total - b.downpayment,
       'Assumed settled at checkout (completed before the sales module was added). Void if not received.',
       (b.date::timestamp + interval '17 hours') at time zone 'Asia/Manila'
from public.bookings b
where b.status = 'Completed'
  and b.payment_proof = true
  and b.total > b.downpayment
  and not exists (select 1 from public.payments p where p.booking_id = b.id and p.type = 'Balance');

commit;
