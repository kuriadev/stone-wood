-- ── Reminding guests the day before ─────────────────────────────────
--
-- Guests forgot, or came at the wrong hour, and the owner had no reminder
-- except their own memory. Now the day before each visit:
--
--   - an email goes out by itself (app/api/reminders), the first time any
--     staff member opens the Dashboard that day, or from a scheduler with
--     NOTIFY_SECRET; and
--   - the Dashboard lists tomorrow's arrivals with a one-tap text message,
--     because most guests here read texts, not email.
--
-- reminded_at makes the email happen once per booking, however many times
-- the Dashboard is opened. Until this column exists the automatic email
-- stays off (it could not tell what it already sent); the texts work.
--
-- Safe to run more than once.

alter table public.bookings add column if not exists reminded_at timestamptz;
