-- ════════════════════════════════════════════════════════════════════
-- One preparation record per booking.
--
-- Saving a preparation used to INSERT a new row every time, so preparing a
-- booking twice (or re-opening it to look) left several "Prepared" records,
-- some with nothing ticked. /api/inspections now updates the booking's one
-- preparation instead; this removes the extra copies already saved (the
-- most recent is kept, since it is the state the owner last saved) and
-- makes the database refuse a second one.
--
-- Check-out inspections are already one per booking: /api/checkout stamps
-- checked_out_at and refuses a second check-out.
--
-- Safe to run twice.
-- ════════════════════════════════════════════════════════════════════

begin;

delete from public.facility_inspections i
 using public.facility_inspections newer
 where i.stage = 'Preparation'
   and newer.stage = 'Preparation'
   and newer.booking_id = i.booking_id
   and (newer.inspected_at, newer.id) > (i.inspected_at, i.id);

create unique index if not exists facility_inspections_one_prep_per_booking
  on public.facility_inspections (booking_id)
  where stage = 'Preparation';

commit;
