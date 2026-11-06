-- ── No-show, as its own flag ──
--
-- A no-show is stored as a Cancelled booking (the date is freed and, under
-- the no-refund policy, what was paid is kept), so availability, money and
-- archiving treat it exactly like one. This flag is what tells the two
-- apart: it is set ONLY by "Mark no-show" on a guest's card in Guest
-- bookings (or the owner approving front desk's request to). Staff then see
-- the booking as "No-show" rather than "Cancelled", and Reports count it
-- on its own.
--
-- Bookings already marked with the button carry its standard reason,
-- "No-show: …", so those are flagged here. A booking cancelled the ordinary
-- way, whatever its reason says, stays Cancelled.
--
-- Until this runs, "Mark no-show" still cancels the booking (the write is
-- retried without the flag) but it shows as Cancelled.
--
-- Safe to run more than once.

alter table public.bookings add column if not exists no_show boolean not null default false;

update public.bookings
   set no_show = true
 where status = 'Cancelled'
   and cancel_reason like 'No-show:%'
   and no_show = false;

-- ── A no-show can still move to a new date ──
--
-- The day after a booking is marked a no-show, the guest is emailed a link
-- to pick a new date (POST /api/reminders sends it; the Dashboard calls it
-- each day). This stamps when that email went out, so it is sent once, and
-- choice_deadline (already on bookings, used for resort cancellations) is
-- set to 20 days after it. The date they pick is held 48 hours for the
-- front desk or the owner to approve; what they paid carries over.

alter table public.bookings add column if not exists no_show_notified_at timestamptz;
