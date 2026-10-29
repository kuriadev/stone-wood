-- ── A title and a line of text on each gallery photo ──
--
-- The owner wanted guests to know what each photo shows ("Deluxe Room",
-- "Main Pool at dusk"). The text appears when a guest hovers a photo on
-- /gallery (always shown on touch screens, which cannot hover) and under the
-- photo in the full-size viewer. Staff write it in the admin Gallery tab.
--
-- Both default to '' so every existing photo simply has no caption.
-- Until this runs, the site keeps working: photos save without their text
-- and the admin Gallery tab says this migration is needed.
--
-- Safe to run more than once. Only adds columns.

alter table public.gallery add column if not exists title text not null default '';
alter table public.gallery add column if not exists description text not null default '';
