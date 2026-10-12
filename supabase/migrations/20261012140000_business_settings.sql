-- ── Rates & Settings ────────────────────────────────────────────────
--
-- Prices, discounts, capacity, booking limits, opening hours and contact
-- details were constants in the code, so changing the per-head rate took a
-- developer and a redeploy. They are now one record the owner edits in
-- Rates & Settings (lib/settings.ts validates it; app/api/settings saves
-- it).
--
-- One row (id = 1), stored as JSON so a new setting needs no migration.
-- An empty table — or a field missing from the JSON — means the default,
-- which is exactly what the code has always used. Nothing changes until
-- the owner saves.
--
-- Package prices are not here: each package keeps its own price in
-- Packages & Prices.
--
-- Safe to run more than once.

begin;

create table if not exists public.business_settings (
  id              smallint primary key default 1 check (id = 1),
  data            jsonb       not null default '{}'::jsonb,
  updated_at      timestamptz not null default now(),
  updated_by_name text
);

comment on table public.business_settings is
  'At most one row: the owner''s rates, discounts, limits, hours and contacts. Missing fields use the defaults in lib/settings.ts.';

alter table public.business_settings enable row level security;
-- No policy: read through /api/settings (public, these are published
-- prices and hours anyway) and written only by the owner's session.

commit;
