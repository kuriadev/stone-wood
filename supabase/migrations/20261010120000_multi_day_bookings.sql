-- ── Multi-day bookings ──────────────────────────────────────────────
--
-- A booking used to occupy exactly one date. It can now run over several
-- days: `date` is the first day and `end_date` the last, inclusive.
--
-- A stay is a RUN OF DAY-USE DAYS, not an overnight stay. The guest has the
-- same slot (Day / Night / Whole Day) on each date of the range, and the
-- rooms are still turned over between slots — see the long note at the top
-- of lib/occupancy.ts, which this change deliberately does NOT overturn.
--
-- Existing rows all become one-day bookings (end_date = date), so nothing
-- that is already booked changes meaning.
--
-- Safe to run more than once.

begin;

-- 1. The column. Nullable first, so the backfill has something to fill.
alter table public.bookings
  add column if not exists end_date date;

-- 2. Every booking written before today is a single day.
update public.bookings
   set end_date = date
 where end_date is null;

-- 3. A trigger fills it in for any insert that leaves it out. The app always
--    sends it, but older deploys and the seed route do not, and a NOT NULL
--    column with no default would reject them.
create or replace function public.bookings_fill_end_date()
returns trigger
language plpgsql
as $$
begin
  if new.end_date is null then
    new.end_date := new.date;
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_fill_end_date on public.bookings;
create trigger bookings_fill_end_date
  before insert or update on public.bookings
  for each row execute function public.bookings_fill_end_date();

-- 4. Now it can be required.
alter table public.bookings
  alter column end_date set not null;

-- 5. A range that ends before it starts would read backwards in every
--    availability check, so the database refuses it outright.
alter table public.bookings
  drop constraint if exists bookings_end_date_after_start;
alter table public.bookings
  add constraint bookings_end_date_after_start check (end_date >= date);

-- 6. "Which bookings overlap these dates" is the query every availability
--    check now runs: date <= :to and end_date >= :from.
create index if not exists bookings_date_range_idx
  on public.bookings (date, end_date);

commit;
