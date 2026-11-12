-- ── Proof of payment: the guest pays by GCash and uploads the receipt ─────
--
-- Online bookings no longer go through PayMongo. The guest sends the amount
-- shown as "Pay now" to the resort's GCash, then uploads a screenshot of the
-- receipt. The browser reads it first (OCR: reference number, date, amount),
-- and the booking waits as Pending until staff check the money arrived:
-- "Confirm partial payment", "Confirm full payment" or "Reject payment".
--
-- One row per upload, so a rejected receipt and the guest's new one are both
-- kept. The image itself is in the private storage bucket "payment-proofs"
-- (created by the app on first use); `path` is its name there.

create table if not exists public.payment_proofs (
  id            bigint generated always as identity primary key,
  booking_id    text not null references public.bookings(id) on delete cascade,
  path          text not null,
  status        text not null default 'Submitted'
                  check (status in ('Submitted', 'Approved', 'Rejected', 'Replaced')),
  -- What the guest chose: the 50% down payment or the full amount.
  pay_choice    text not null default 'Downpayment' check (pay_choice in ('Downpayment', 'Full')),
  -- The amount the booking page asked them to send.
  amount_due    numeric(12,2) not null,
  -- What the browser read off the receipt: reference, date, amount, name.
  ocr           jsonb not null default '{}'::jsonb,
  reference     text,
  submitted_at  timestamptz not null default now(),
  reviewed_at   timestamptz,
  reviewed_by   text,
  -- Staff decision: 'Downpayment' or 'Full' when approved.
  approved_as   text check (approved_as in ('Downpayment', 'Full')),
  reject_reason text
);

create index if not exists payment_proofs_booking_idx on public.payment_proofs (booking_id);
create index if not exists payment_proofs_open_idx on public.payment_proofs (submitted_at) where status = 'Submitted';
-- The same receipt can't pay for two bookings.
create unique index if not exists payment_proofs_reference_uq
  on public.payment_proofs (lower(reference))
  where reference is not null and status <> 'Rejected' and status <> 'Replaced';

-- Only the server (service role) reads and writes these.
alter table public.payment_proofs enable row level security;
