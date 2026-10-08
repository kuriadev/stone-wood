-- ── A resort-cancelled guest who didn't pick in time stays resort-cancelled
--
-- After the resort cancels, the guest has 7 days to pick a new date on their
-- booking page. When those days ran out, the app used to turn the booking
-- into a plain "Cancelled" one with the guest's payment still held. That hid
-- "Set a new date" and "Guest chose a refund" from the owner, and Sales
-- showed the held payment as "Forfeited", so the money had no way out.
--
-- The app now leaves such a booking "ResortCancelled" (only the guest's own
-- date picker closes; see sweepExpired in lib/rebooking.server.ts). This puts
-- back any booking the old rule already changed.
--
-- Which ones: "Cancelled" with money still held and no refund recorded.
-- held_amount is only ever set by a resort cancellation, and choosing a
-- refund or getting a new date sets it back to 0, so nothing else matches.
--
-- Each one restored gets an activity log entry. Safe to run twice: a second
-- run finds nothing to change.

begin;

with restored as (
  update public.bookings
     set status = 'ResortCancelled',
         choice_deadline = null
   where status = 'Cancelled'
     and held_amount > 0
     and refund_status is null
  returning id, held_amount
)
insert into public.activity_log (actor, action, entity, entity_id, booking_id, summary, details)
select 'System', 'booking.choice_restored', 'booking', id, id,
       'Booking ' || id || ' is back to "cancelled by the resort": the guest''s time to pick a new date had run out, which used to cancel it outright. ₱'
         || to_char(held_amount, 'FM999,999,990.00') || ' is still held for them. Agree a new date or a refund with them.',
       jsonb_build_object('from', 'Cancelled', 'to', 'ResortCancelled', 'held', held_amount)
  from restored;

commit;
