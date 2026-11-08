-- The resort takes money exactly two ways: cash, and QR Ph.
--   'PayMongo' = the online QR Ph checkout
--   'GCash'    = a QR Ph code scanned at the front desk (the stored value
--                older rows already use; every screen shows it as "QR Ph")
-- Bank transfers are not accepted, so the database no longer allows one.
-- No row has ever used 'Bank Transfer' (checked 2026-11-08), so this
-- changes no data.

alter table public.payments drop constraint if exists payments_method_check;
alter table public.payments add constraint payments_method_check
  check (method in ('PayMongo','Cash','GCash'));

alter table public.expenses drop constraint if exists expenses_method_check;
alter table public.expenses add constraint expenses_method_check
  check (method in ('Cash','GCash'));
