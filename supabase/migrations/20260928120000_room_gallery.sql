-- Rooms get a photo gallery.
--
-- A room carried a single `img`, so the public room card, the room modal and
-- the "View room" viewer in the booking flow could only ever show one angle.
-- Packages already had a `gallery` column; this brings rooms in line.
--
-- `img` stays and stays NOT NULL: it is the cover used by every existing
-- card, list and booking summary, and nothing that reads it needs to change.
-- The gallery is the full set, cover first.
--
-- The app caps uploads at 5 photos. That cap is enforced in the API and the
-- admin UI rather than here, so raising it later does not need a migration.

alter table public.rooms
  add column if not exists gallery jsonb not null default '[]'::jsonb;

comment on column public.rooms.gallery is
  'Ordered list of image sources for this room, cover first. Mirrors `img` at index 0.';

-- Backfill: every existing room becomes a one-photo gallery holding its
-- current cover, so the column is never an empty array for a room that
-- visibly has a picture.
update public.rooms
   set gallery = jsonb_build_array(img)
 where gallery = '[]'::jsonb
   and img is not null
   and img <> '';
