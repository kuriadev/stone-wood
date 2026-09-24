-- ════════════════════════════════════════════════════════════════════
-- Day / Night / Whole Day slots, and the new package line-up.
--
-- 1. bookings.slot — Day (7 AM–5 PM), Night (7 PM–12 AM) or WholeDay.
--    Each slot has its own pool capacity, venue and rooms, so a Day group
--    and a Night group can share a date. Before this, the date was the
--    only unit: an Exclusive day booking blocked that night too.
--    Existing rows are filled in from their package label.
--
-- 2. packages.slot_mode — "Single" (guest picks Day or Night; the price
--    is for one slot) or "WholeDay" (both slots).
--
-- 3. The packages themselves are replaced with the nine agreed with the
--    owner. Prices follow lib/pricing.ts: 5% off an exclusive pool slot,
--    10% off any bundle (Whole Day, or Pool + Venue), venue ₱5,000/slot.
--    Old bookings store the package title as text, so removing the old
--    rows doesn't touch them.
--
-- Safe to run twice.
-- ════════════════════════════════════════════════════════════════════

begin;

-- ── 1. Booking slot ─────────────────────────────────────────────────
alter table public.bookings add column if not exists slot text;

alter table public.bookings drop constraint if exists bookings_slot_check;
alter table public.bookings add constraint bookings_slot_check
  check (slot is null or slot in ('Day','Night','WholeDay'));

update public.bookings
   set slot = case when package ilike 'night%' then 'Night' else 'Day' end
 where slot is null;

create index if not exists bookings_date_slot_idx on public.bookings (date, slot);

-- ── 2. Package slot mode ────────────────────────────────────────────
alter table public.packages
  add column if not exists slot_mode text not null default 'Single';

alter table public.packages drop constraint if exists packages_slot_mode_check;
alter table public.packages add constraint packages_slot_mode_check
  check (slot_mode in ('Single','WholeDay'));

-- The food discount and food note columns are already gone (remove_food).

-- ── 3. Packages ─────────────────────────────────────────────────────
delete from public.packages
 where code in ('POOL-ROOM','POOL-EXCLUSIVE','VENUE-ONLY','POOL-VENUE');

insert into public.packages
  (code, title, resource, status, price, list_price, capacity,
   requires_room, slot_mode, cover, gallery, blurb, includes, note, active)
values
  ('BARKADA-ROOM', 'Barkada Pool + Room', 'Pool', 'Shared', 3000, null, 15, true, 'Single', 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?q=80&w=1200&auto=format&fit=crop', '[{"label":"Room","src":"https://images.unsplash.com/photo-1631049307264-da0ec9d70304?q=80&w=1200&auto=format&fit=crop","kind":"Room"},{"label":"Main Pool","src":"https://images.unsplash.com/photo-1536745511564-a5fa6e596e7b?q=80&w=1200&auto=format&fit=crop","kind":"Pool"}]'::jsonb, 'Pool access shared with other groups, plus a room to rest and change in — pick your room at checkout at a discounted rate.', array['Pool access for up to 15 guests','1 room of your choice (8% off)','Day (7:00 AM – 5:00 PM) or Night (7:00 PM – 12:00 AM)','BBQ area, billiards & videoke','Parking']::text[], 'Shared pool', true),
  ('PRIVATE-POOL', 'Private Pool', 'Pool', 'Exclusive', 5700, 6000, 30, false, 'Single', 'https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?q=80&w=1200&auto=format&fit=crop', '[{"label":"Full Resort","src":"https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?q=80&w=1200&auto=format&fit=crop","kind":"Resort"},{"label":"Main Pool","src":"https://images.unsplash.com/photo-1536745511564-a5fa6e596e7b?q=80&w=1200&auto=format&fit=crop","kind":"Pool"}]'::jsonb, 'The whole pool to your group — no other bookings in your slot.', array['Exclusive pool for up to 30 guests','Day (7:00 AM – 5:00 PM) or Night (7:00 PM – 12:00 AM)','All resort amenities','Parking']::text[], 'Exclusive', true),
  ('PRIVATE-POOL-ROOM', 'Private Pool + Room', 'Pool', 'Exclusive', 5700, 6000, 30, true, 'Single', 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?q=80&w=1200&auto=format&fit=crop', '[{"label":"Room","src":"https://images.unsplash.com/photo-1631049307264-da0ec9d70304?q=80&w=1200&auto=format&fit=crop","kind":"Room"},{"label":"Main Pool","src":"https://images.unsplash.com/photo-1536745511564-a5fa6e596e7b?q=80&w=1200&auto=format&fit=crop","kind":"Pool"}]'::jsonb, 'The whole pool to your group, plus a room — pick it at checkout at a discounted rate.', array['Exclusive pool for up to 30 guests','1 room of your choice (8% off)','Day (7:00 AM – 5:00 PM) or Night (7:00 PM – 12:00 AM)','All resort amenities']::text[], 'Exclusive', true),
  ('WHOLE-DAY', 'Whole Day Buyout', 'Pool', 'Exclusive', 10800, 12000, 30, false, 'WholeDay', 'https://images.unsplash.com/photo-1540541338287-41700207dee6?q=80&w=1200&auto=format&fit=crop', '[{"label":"Main Pool","src":"https://images.unsplash.com/photo-1536745511564-a5fa6e596e7b?q=80&w=1200&auto=format&fit=crop","kind":"Pool"},{"label":"Second Pool","src":"https://images.unsplash.com/photo-1540541338287-41700207dee6?q=80&w=1200&auto=format&fit=crop","kind":"Pool"}]'::jsonb, 'The resort is yours from 7:00 AM to 12:00 AM — both the Day and Night slots, for less than booking them separately.', array['Exclusive pool for up to 30 guests','7:00 AM – 12:00 AM','All resort amenities','Parking']::text[], 'Day + Night', true),
  ('WHOLE-DAY-STAY', 'Whole Day Staycation', 'Pool', 'Exclusive', 10800, 12000, 30, true, 'WholeDay', 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?q=80&w=1200&auto=format&fit=crop', '[{"label":"Room","src":"https://images.unsplash.com/photo-1631049307264-da0ec9d70304?q=80&w=1200&auto=format&fit=crop","kind":"Room"},{"label":"Full Resort","src":"https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?q=80&w=1200&auto=format&fit=crop","kind":"Resort"}]'::jsonb, 'A full day and night with the resort to yourselves, and a room for the whole stay.', array['Exclusive pool for up to 30 guests','1 room for the whole day (8% off)','7:00 AM – 12:00 AM','All resort amenities']::text[], 'Day + Night', true),
  ('VENUE', 'Events Venue', 'Venue', 'Exclusive', 5000, null, 50, false, 'Single', 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?q=80&w=1200&auto=format&fit=crop', '[{"label":"Events Venue","src":"https://images.unsplash.com/photo-1519167758481-83f550bb49b3?q=80&w=1200&auto=format&fit=crop","kind":"Venue"}]'::jsonb, 'Just the events hall — for parties, meetings and celebrations that don''t need the pool.', array['Exclusive use of the venue for up to 50 guests','Day (7:00 AM – 5:00 PM) or Night (7:00 PM – 12:00 AM)','Tables & chairs setup','Sound system access']::text[], 'No pool', true),
  ('VENUE-WHOLE-DAY', 'Events Venue — Whole Day', 'Venue', 'Exclusive', 9000, 10000, 50, false, 'WholeDay', 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?q=80&w=1200&auto=format&fit=crop', '[{"label":"Events Venue","src":"https://images.unsplash.com/photo-1519167758481-83f550bb49b3?q=80&w=1200&auto=format&fit=crop","kind":"Venue"}]'::jsonb, 'The events hall from 7:00 AM to 12:00 AM — time to set up, celebrate and pack up.', array['Exclusive use of the venue for up to 50 guests','7:00 AM – 12:00 AM','Tables & chairs setup','Sound system access']::text[], 'No pool', true),
  ('PARTY', 'Party Package', 'Pool+Venue', 'Exclusive', 9900, 11000, 30, false, 'Single', 'https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?q=80&w=1200&auto=format&fit=crop', '[{"label":"Full Resort","src":"https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?q=80&w=1200&auto=format&fit=crop","kind":"Resort"},{"label":"Events Venue","src":"https://images.unsplash.com/photo-1519167758481-83f550bb49b3?q=80&w=1200&auto=format&fit=crop","kind":"Venue"}]'::jsonb, 'The private pool and the events hall together, bundled for less.', array['Exclusive pool for up to 30 guests','Exclusive events venue','Day (7:00 AM – 5:00 PM) or Night (7:00 PM – 12:00 AM)','All resort amenities']::text[], 'Pool + Venue', true),
  ('GRAND', 'Grand Celebration', 'Pool+Venue', 'Exclusive', 19800, 22000, 30, false, 'WholeDay', 'https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?q=80&w=1200&auto=format&fit=crop', '[{"label":"Full Resort","src":"https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?q=80&w=1200&auto=format&fit=crop","kind":"Resort"},{"label":"Events Venue","src":"https://images.unsplash.com/photo-1519167758481-83f550bb49b3?q=80&w=1200&auto=format&fit=crop","kind":"Venue"},{"label":"Main Pool","src":"https://images.unsplash.com/photo-1536745511564-a5fa6e596e7b?q=80&w=1200&auto=format&fit=crop","kind":"Pool"}]'::jsonb, 'Everything, all day: the private pool and the events hall from morning until midnight. Best for weddings, debuts and big celebrations.', array['Exclusive pool for up to 30 guests','Exclusive events venue','7:00 AM – 12:00 AM','All resort amenities']::text[], 'Best for big events', true)
on conflict (code) do update set
  title = excluded.title,
  resource = excluded.resource,
  status = excluded.status,
  price = excluded.price,
  list_price = excluded.list_price,
  capacity = excluded.capacity,
  requires_room = excluded.requires_room,
  slot_mode = excluded.slot_mode,
  cover = excluded.cover,
  gallery = excluded.gallery,
  blurb = excluded.blurb,
  includes = excluded.includes,
  note = excluded.note,
  active = excluded.active;

commit;
