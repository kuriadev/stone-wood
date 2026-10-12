-- ── Caretaker tasks and stock that moves by itself ─────────────────
--
-- Inventory was a list of numbers that changed only when someone typed a
-- new one, so it was always out of date and nobody trusted it. Stock now
-- changes at the moments it is actually used up or bought:
--
--   Used      a caretaker finishes an upkeep task (weekly pool cleaning)
--             or cleans a facility after a check-out — the standard
--             amounts are pre-filled and they confirm what they really used
--   Broken    a damaged item recorded at a check-out inspection, when that
--             item on the damage rate list is linked to an inventory item
--   Bought    a purchase: stock goes up AND the cost is an expense in Sales
--   Counted   a physical count — the difference is recorded, not hidden
--
-- 1. inventory: qty and min_qty become numeric (0.5 kg of pH reducer), the
--    "never below zero" rule goes (a caretaker who used more than the books
--    show must still be able to say so; the screen flags it for a count),
--    and each item is a Supply (used up) or Equipment (only breaks).
-- 2. inventory_movements: the append-only history. A trigger applies each
--    movement to inventory.qty in the same insert, so the two can never
--    disagree.
-- 3. damage_rates.inventory_item_id: "1 monobloc chair broken" at
--    inspection also takes one off the chairs.
-- 4. upkeep_tasks (+ supplies, + runs): the owner's schedule of repeating
--    work — "Pool cleaning, every 7 days, uses 2 chlorine tablets".
-- 5. facility_cleaning_supplies / facility_cleanings: what cleaning each
--    facility uses, and when it was cleaned and by whom.
-- 6. facility_inspections.photos and inspected_by_name: the caretaker's
--    photos at check-out, and who did each inspection.
--
-- Needs 20261012120000_staff_and_owner_requests.sql first (staff ids).
-- Safe to run more than once. Only adds and widens; nothing is removed.

begin;

-- ── 1. Inventory ────────────────────────────────────────────────────
alter table public.inventory alter column qty     type numeric(10,2) using qty::numeric;
alter table public.inventory alter column min_qty type numeric(10,2) using min_qty::numeric;
alter table public.inventory drop constraint if exists inventory_qty_check;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'inventory' and column_name = 'kind'
  ) then
    alter table public.inventory add column kind text not null default 'Supply';
    -- First run only: furniture, and the tools that are kept rather than
    -- used up, are equipment (the same rule as guessKind in
    -- types/inventory.ts). The owner can change any item.
    update public.inventory set kind = 'Equipment'
     where category = 'Furniture & Misc'
        or name ~* '\m(mop|vacuum|skimmer|broom|dustpan|bucket|brush|hose|ladder)\M';
  end if;
end $$;

alter table public.inventory drop constraint if exists inventory_kind_check;
alter table public.inventory add constraint inventory_kind_check check (kind in ('Supply','Equipment'));

-- ── 2. Stock movements ──────────────────────────────────────────────
create table if not exists public.inventory_movements (
  id          bigint generated always as identity primary key,
  item_id     bigint not null references public.inventory (id) on delete cascade,
  -- + in, − out. A count that matched the books is recorded too (0).
  delta       numeric(10,2) not null,
  reason      text not null check (reason in ('Used','Broken','Bought','Counted','Adjusted')),
  -- What caused it: 'upkeep_run', 'cleaning', 'damage', 'expense', 'count'.
  ref_type    text,
  ref_id      text,
  booking_id  text,
  unit_cost   numeric(10,2),
  expense_id  bigint references public.expenses (id) on delete set null,
  staff_id    uuid,
  staff_name  text,
  note        text not null default '',
  at          timestamptz not null default now()
);

create index if not exists inventory_movements_item_idx on public.inventory_movements (item_id, at desc);
create index if not exists inventory_movements_at_idx   on public.inventory_movements (at desc);

create or replace function public.inventory_apply_movement()
returns trigger language plpgsql as $$
begin
  update public.inventory set qty = qty + new.delta where id = new.item_id;
  return new;
end;
$$;

drop trigger if exists inventory_movements_apply on public.inventory_movements;
create trigger inventory_movements_apply
  after insert on public.inventory_movements
  for each row execute function public.inventory_apply_movement();

-- Append-only, like the activity log: a wrong entry is corrected by a new
-- 'Adjusted' or 'Counted' line, never by editing history.
create or replace function public.inventory_movements_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'Stock movements are append-only: record a correction instead.';
end;
$$;

drop trigger if exists inventory_movements_no_change on public.inventory_movements;
create trigger inventory_movements_no_change
  before update or delete on public.inventory_movements
  for each row execute function public.inventory_movements_append_only();

alter table public.inventory_movements enable row level security;

-- ── 3. Breakage → stock ─────────────────────────────────────────────
alter table public.damage_rates
  add column if not exists inventory_item_id bigint references public.inventory (id) on delete set null;

-- ── 4. Upkeep schedule ──────────────────────────────────────────────
create table if not exists public.upkeep_tasks (
  id           bigint generated always as identity primary key,
  title        text not null check (char_length(title) between 2 and 80),
  facility_id  bigint references public.facilities (id) on delete set null,
  every_days   integer not null check (every_days between 1 and 365),
  start_date   date not null,
  notes        text not null default '',
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

create table if not exists public.upkeep_task_supplies (
  task_id  bigint not null references public.upkeep_tasks (id) on delete cascade,
  item_id  bigint not null references public.inventory (id) on delete cascade,
  qty      numeric(10,2) not null check (qty > 0),
  primary key (task_id, item_id)
);

create table if not exists public.upkeep_runs (
  id            bigint generated always as identity primary key,
  task_id       bigint not null references public.upkeep_tasks (id) on delete cascade,
  -- The scheduled day this run covers; one run per task per due day.
  due_date      date not null,
  done_at       timestamptz not null default now(),
  done_by       uuid,
  done_by_name  text,
  note          text not null default '',
  unique (task_id, due_date)
);

-- ── 5. Cleaning ─────────────────────────────────────────────────────
create table if not exists public.facility_cleaning_supplies (
  facility_id  bigint not null references public.facilities (id) on delete cascade,
  item_id      bigint not null references public.inventory (id) on delete cascade,
  qty          numeric(10,2) not null check (qty > 0),
  primary key (facility_id, item_id)
);

create table if not exists public.facility_cleanings (
  id            bigint generated always as identity primary key,
  facility_id   bigint not null references public.facilities (id) on delete cascade,
  booking_id    text,
  done_at       timestamptz not null default now(),
  done_by       uuid,
  done_by_name  text,
  note          text not null default ''
);

create index if not exists facility_cleanings_facility_idx on public.facility_cleanings (facility_id, done_at desc);

-- ── 6. Inspection photos, and who inspected ─────────────────────────
-- [{ facilityId, src }] — compressed data URLs, like room and receipt photos.
alter table public.facility_inspections
  add column if not exists photos jsonb not null default '[]'::jsonb;
-- The caretaker's name on the record itself, so the stay record and the
-- inspection list say who checked without searching the activity log.
alter table public.facility_inspections
  add column if not exists inspected_by_name text;

alter table public.upkeep_tasks               enable row level security;
alter table public.upkeep_task_supplies       enable row level security;
alter table public.upkeep_runs                enable row level security;
alter table public.facility_cleaning_supplies enable row level security;
alter table public.facility_cleanings         enable row level security;

commit;
