-- ════════════════════════════════════════════════════════════════════
-- Activity log, resort cancellations, date changes and refunds.
--
-- Run AFTER 20260929120000_operations_and_amenities.sql and
-- 20260929130000_one_preparation_per_booking.sql.
--
-- 1. activity_log — one row per thing that happened: who (Admin, Guest or
--    System), what, to which record, before → after. Append-only: a
--    trigger refuses UPDATE and DELETE, so the history can't be rewritten,
--    not even from the SQL editor by accident.
--
-- 2. bookings:
--      status 'ResortCancelled'  the resort can't host the booking; the
--                                guest has until choice_deadline to pick a
--                                new date or ask for a refund. The date is
--                                freed and their payment (held_amount)
--                                stays attached to the booking.
--      confirmed_at / cancelled_at   when those happened (they were never
--                                recorded before).
--      refund_status 'Owed' → 'Sent', refund_amount, refund_sent_at and an
--                                optional receipt photo: the refund trail
--                                the guest can see on their booking page.
--
-- 3. date_change_requests — a guest asking to move their booking (held for
--    48 hours, approved or declined by the owner), and a guest picking a
--    new date after a resort cancellation (approved at once). The booking
--    keeps its current date until a request is approved.
--
-- Safe to run twice.
-- ════════════════════════════════════════════════════════════════════

begin;

-- ── 1. Activity log ─────────────────────────────────────────────────
create table if not exists public.activity_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor       text not null check (actor in ('Admin','Guest','System')),
  -- e.g. 'booking.cancelled_by_resort', 'payment.voided', 'room.updated'
  action      text not null,
  entity      text not null default '',
  entity_id   text not null default '',
  -- No foreign key on purpose: a booking's history must outlive the
  -- booking if it is ever deleted.
  booking_id  text,
  summary     text not null,
  details     jsonb not null default '{}'::jsonb
);

create index if not exists activity_log_at_idx      on public.activity_log (at desc);
create index if not exists activity_log_booking_idx on public.activity_log (booking_id);
create index if not exists activity_log_action_idx  on public.activity_log (action);

create or replace function public.activity_log_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'The activity log is append-only: entries cannot be changed or deleted.';
end;
$$;

drop trigger if exists activity_log_no_change on public.activity_log;
create trigger activity_log_no_change
  before update or delete on public.activity_log
  for each row execute function public.activity_log_append_only();

alter table public.activity_log enable row level security;

-- ── 2. Bookings ─────────────────────────────────────────────────────
alter table public.bookings drop constraint if exists bookings_status_check;
alter table public.bookings add constraint bookings_status_check
  check (status in ('Pending','Confirmed','Completed','Cancelled','ResortCancelled'));

alter table public.bookings add column if not exists confirmed_at    timestamptz;
alter table public.bookings add column if not exists cancelled_at    timestamptz;
alter table public.bookings add column if not exists choice_deadline timestamptz;
alter table public.bookings add column if not exists held_amount     numeric(10,2) not null default 0;
alter table public.bookings add column if not exists refund_status   text;
alter table public.bookings add column if not exists refund_amount   numeric(10,2) not null default 0;
alter table public.bookings add column if not exists refund_sent_at  timestamptz;
-- A photo of the transfer receipt, stored the way room and package photos
-- already are (a compressed data URL).
alter table public.bookings add column if not exists refund_receipt  text;

alter table public.bookings drop constraint if exists bookings_refund_status_check;
alter table public.bookings add constraint bookings_refund_status_check
  check (refund_status is null or refund_status in ('Owed','Sent'));

-- Bookings confirmed before this column existed: the creation time is the
-- best record there is. The activity log has exact times from now on.
update public.bookings set confirmed_at = created_at
 where confirmed_at is null and status in ('Confirmed','Completed');

-- ── 3. Date change requests ─────────────────────────────────────────
create table if not exists public.date_change_requests (
  id            bigint generated always as identity primary key,
  booking_id    text not null references public.bookings (id) on delete cascade,
  from_date     date not null,
  to_date       date not null,
  -- 'Guest': the guest asked to move (needs the owner's approval).
  -- 'Resort': the guest picked a new date after a resort cancellation.
  requested_by  text not null check (requested_by in ('Guest','Resort')),
  status        text not null default 'Pending'
                  check (status in ('Pending','Approved','Declined','Expired')),
  -- A pending guest request holds the new date until this time.
  hold_until    timestamptz,
  decided_at    timestamptz,
  note          text not null default '',
  created_at    timestamptz not null default now()
);

create index if not exists date_change_requests_booking_idx on public.date_change_requests (booking_id);
create index if not exists date_change_requests_pending_idx on public.date_change_requests (to_date) where status = 'Pending';
-- One open request per booking.
create unique index if not exists date_change_requests_one_pending
  on public.date_change_requests (booking_id) where status = 'Pending';

alter table public.date_change_requests enable row level security;

commit;
