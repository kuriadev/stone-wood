-- ── No online payment gateway: GCash with proof of payment, or cash ─────────
--
-- PayMongo is gone. Online guests send money to the resort's GCash and
-- upload the receipt; staff check it (20261115120000_payment_proofs.sql).
-- At the desk, the guest scans the resort's GCash QR and staff type the
-- reference number from the receipt.
--
-- Earlier online payments were QR payments into the resort's account; they
-- are kept, now recorded as GCash like every other e-wallet payment.
--
-- Apply this only together with the version of the site that has no
-- PayMongo (branch manual-payment-proof): the older version still records
-- online payments as 'PayMongo' and would be refused.

update public.payments set method = 'GCash' where method = 'PayMongo';

alter table public.payments drop constraint if exists payments_method_check;
alter table public.payments add constraint payments_method_check
  check (method in ('Cash','GCash'));

drop index if exists public.payments_paymongo_ref_key;
