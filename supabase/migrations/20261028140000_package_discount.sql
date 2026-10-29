-- ── A promo discount on a package ──
--
-- The owner can put a package on promo from Packages & Prices: a percentage
-- or a peso amount off its regular price, optionally until a date, e.g.
-- {"type": "percent", "value": 20, "until": "2026-11-30"}.
--
-- The discount is CHARGED, not only shown: the booking quote and the
-- walk-in window price a package through packagePriceToday
-- (lib/pricing.ts), so guests pay the promo price while it runs and the
-- regular price after its end date, with nothing to switch off by hand.
--
-- NULL (every existing package) means no promo. Until this runs, packages
-- still save, without a promo, and Packages & Prices says this is needed.
--
-- Safe to run more than once. Only adds a column.

alter table public.packages add column if not exists discount jsonb;
