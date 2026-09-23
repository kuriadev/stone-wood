-- Completes the schema so every collection AppContext persists has a table.
--
-- The initial migration covered six of the nine: rooms, bookings, inventory,
-- customer_messages, closed_dates and gallery. Menu items, facilities and
-- packages were still localStorage-only, so an admin editing the menu on one
-- machine changed nothing for anyone else. This adds those three.
--
-- It also repairs one constraint: inventory.category rejected
-- 'Food Ingredients', which is a value the app both defines in
-- types/inventory.ts and depends on — MenuTab's recipe linking filters
-- inventory by exactly that category, so an insert from the UI would have
-- failed against the live database.

-- ── FIX: inventory.category was missing 'Food Ingredients' ──────────
alter table public.inventory
  drop constraint if exists inventory_category_check;

alter table public.inventory
  add constraint inventory_category_check
  check (category in ('Pool & Chemicals','Furniture & Misc','Cleaning Tools','Food Ingredients'));

-- ── MENU ITEMS ──────────────────────────────────────────────────────
create table if not exists public.menu_items (
  id          bigint generated always as identity primary key,
  category    text    not null
                check (category in ('Combo','Grilled & BBQ','Rice Meals','Snacks','Drinks','Desserts')),
  name        text    not null,
  -- `desc` is a reserved word; mapped back to `desc` in lib/supabase.ts.
  description text    not null default '',
  price       numeric(10,2) not null check (price >= 0),
  img         text    not null default '',
  available   boolean not null default true,
  -- MenuRecipeLine[]: [{ ingredientId, qtyPerOrder }]. JSONB rather than a
  -- join table because the app reads and writes it as one opaque list.
  recipe      jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists menu_items_category_idx on public.menu_items (category);

-- ── FACILITIES ──────────────────────────────────────────────────────
create table if not exists public.facilities (
  id                   bigint generated always as identity primary key,
  category             text not null check (category in ('Amenity','Room')),
  name                 text not null,
  icon                 text not null default '',
  status               text not null default 'Available'
                         check (status in ('Available','In Use','Needs Cleaning','Under Maintenance')),
  room_id              bigint references public.rooms (id) on delete set null,
  last_used_booking_id text references public.bookings (id) on delete set null,
  last_used_guest_name text,
  last_checked_at      timestamptz,
  notes                text not null default '',
  before_use_checklist text[],
  after_use_checklist  text[],
  created_at           timestamptz not null default now()
);

-- ── PACKAGES ────────────────────────────────────────────────────────
create table if not exists public.packages (
  id                bigint generated always as identity primary key,
  code              text not null unique,
  title             text not null,
  resource          text not null check (resource in ('Pool','Venue','Pool+Venue')),
  status            text not null check (status in ('Shared','Exclusive')),
  price             numeric(10,2) not null check (price >= 0),
  list_price        numeric(10,2) check (list_price >= 0),
  capacity          integer not null check (capacity > 0),
  requires_room     boolean not null default false,
  food_discount_pct numeric(4,3) check (food_discount_pct >= 0 and food_discount_pct <= 1),
  cover             text not null default '',
  gallery           jsonb not null default '[]'::jsonb,
  blurb             text not null default '',
  includes          text[] not null default '{}',
  food_note         text not null default '',
  note              text,
  active            boolean not null default true,
  created_at        timestamptz not null default now()
);

-- ── ROW LEVEL SECURITY ──────────────────────────────────────────────
-- Same rule as the first migration: customers read what the public site
-- shows, and write nothing. All admin writes go through the service role
-- on the server.
alter table public.menu_items enable row level security;
alter table public.facilities enable row level security;
alter table public.packages   enable row level security;

-- The public Menu page lists every item, available or not (it shows an
-- "Unavailable" badge rather than hiding the dish), so the whole table is
-- readable. Same for packages, which the Home and Packages pages render.
drop policy if exists "menu items are publicly readable" on public.menu_items;
create policy "menu items are publicly readable"
  on public.menu_items for select using (true);

drop policy if exists "packages are publicly readable" on public.packages;
create policy "packages are publicly readable"
  on public.packages for select using (true);

-- Facilities are staff-facing only: the caretaker checklist, notes and who
-- last used a room are not customer information. No anon policy, so the
-- table is server-only by default, exactly like inventory.
