-- ── Website text staff edit (site_content) ──
--
-- Words on the public site that staff change from the admin, one row per
-- piece, stored as JSON so a new editable piece needs no migration.
--
-- First piece: 'home_rate_cards', the "Tours & Room Add-ons" cards on Home
-- (lib/homeCards.ts validates them). No row means the automatic cards,
-- built from Rates & Settings, which is what the site has always shown.
--
-- Kept apart from business_settings on purpose: saving Rates & Settings
-- rebuilds that record from its known fields, which would drop anything
-- else stored in it.
--
-- Safe to run more than once.

begin;

create table if not exists public.site_content (
  key             text        primary key,
  data            jsonb       not null,
  updated_at      timestamptz not null default now(),
  updated_by_name text
);

comment on table public.site_content is
  'Website text staff edit in the admin, one row per piece (e.g. home_rate_cards). No row means the built-in default.';

alter table public.site_content enable row level security;
-- No policy: read through /api/site-content (public, it is page text) and
-- written only by a staff session with catalog.manage.

commit;
