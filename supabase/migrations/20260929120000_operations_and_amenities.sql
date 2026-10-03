-- ════════════════════════════════════════════════════════════════════
-- Daily Operations + owner-managed amenities.
--
-- 1. bookings: the day-of steps the Operations screen walks a reservation
--    through, each as a timestamp so the history says WHEN it happened:
--
--      checked_in_at    the group actually arrived (a tap, not a guess
--                       from the clock — that is also how a no-show shows)
--      checked_out_at   the after-use inspection was done; damage recorded
--      settled_at       the per-booking liquidation: balance and penalties
--                       paid (or closed with the unpaid amount written down)
--                       — only then is the booking Completed
--      settlement_note  why a booking was closed with money still owed
--
-- 2. facilities: the owner adds amenities from the admin instead of asking
--    a developer.
--
--      area          which bookings use it: 'Pool' (pool-side amenities),
--                    'Venue' (events hall), 'Common' (every booking, e.g.
--                    parking). NULL for rooms, which link by room_id.
--                    Replaces matching on hard-coded names.
--      description   the line shown on the public website
--      show_on_site  whether the public amenities list shows it
--      active        retired instead of deleted, so old inspections and
--                    damage records that name it stay intact
--
-- Safe to run twice.
-- ════════════════════════════════════════════════════════════════════

begin;

-- ── 1. Booking stages ───────────────────────────────────────────────
alter table public.bookings add column if not exists checked_in_at   timestamptz;
alter table public.bookings add column if not exists checked_out_at  timestamptz;
alter table public.bookings add column if not exists settled_at      timestamptz;
alter table public.bookings add column if not exists settlement_note text not null default '';

-- Bookings completed before this migration went through the old one-step
-- check-out, which inspected and settled together. Give them the same
-- timestamps so the history reads the same as new ones.
update public.bookings b
   set checked_out_at = coalesce(b.checked_out_at, i.inspected_at),
       settled_at     = coalesce(b.settled_at, i.inspected_at)
  from (
    select booking_id, max(inspected_at) as inspected_at
      from public.facility_inspections
     where stage = 'Checkout'
     group by booking_id
  ) i
 where i.booking_id = b.id
   and b.status = 'Completed';

create index if not exists bookings_date_idx on public.bookings (date);

-- ── 2. Amenities ────────────────────────────────────────────────────
alter table public.facilities add column if not exists area         text;
alter table public.facilities add column if not exists description  text not null default '';
alter table public.facilities add column if not exists show_on_site boolean not null default true;
alter table public.facilities add column if not exists active       boolean not null default true;

alter table public.facilities drop constraint if exists facilities_area_check;
alter table public.facilities add constraint facilities_area_check
  check (
    (category = 'Room'    and area is null) or
    (category = 'Amenity' and area in ('Pool','Venue','Common'))
  );

-- The rules the code used to apply by name, written down as data.
update public.facilities set area = 'Venue'  where category = 'Amenity' and area is null and name = 'Events Venue';
update public.facilities set area = 'Common' where category = 'Amenity' and area is null and name = 'Parking Area';
update public.facilities set area = 'Pool'   where category = 'Amenity' and area is null;

-- The public descriptions that used to live in lib/constants.ts.
update public.facilities set description = 'Private pool for whole-day rental, up to 30 guests.' where name = 'Swimming Pool'       and description = '';
update public.facilities set description = 'Open-air grilling stations for group cookouts.'      where name = 'BBQ / Grilling Area' and description = '';
update public.facilities set description = 'Full-size billiards table available for all guests.' where name = 'Billiards'           and description = '';
update public.facilities set description = 'Full videoke setup for group entertainment.'         where name = 'Videoke'             and description = '';
update public.facilities set description = 'Secure on-site parking for all guests.'              where name = 'Parking Area'        and description = '';
update public.facilities set description = 'Covered events hall for parties and gatherings.'     where name = 'Events Venue'        and description = '';

commit;
