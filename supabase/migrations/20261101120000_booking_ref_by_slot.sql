-- ── Booking references that say what was booked ──
--
-- New bookings are numbered as before, but start with the booking type:
--   DT-10201  Day Tour
--   NT-10202  Night Tour
--   SC-10203  Staycation (Whole Day)
-- instead of SW- for every one. Existing bookings keep their SW- reference,
-- so links and emails already sent keep working; the app accepts all four.
--
-- The column default used to build the reference; a default can't see the
-- other columns, so a trigger does it instead, from the booking's slot.
-- The number still comes from booking_ref_seq, one per booking, no gaps
-- from the default and the trigger both drawing a number.
--
-- Safe to run more than once.

begin;

create or replace function public.booking_ref_by_slot()
returns trigger
language plpgsql
as $$
begin
  if new.id is null or new.id = '' then
    new.id := (case new.slot
                 when 'Night' then 'NT-'
                 when 'WholeDay' then 'SC-'
                 else 'DT-'
               end) || nextval('public.booking_ref_seq');
  end if;
  return new;
end;
$$;

-- No default any more: the trigger fills the id before the NOT NULL check.
alter table public.bookings alter column id drop default;

drop trigger if exists bookings_ref_by_slot on public.bookings;
create trigger bookings_ref_by_slot
  before insert on public.bookings
  for each row execute function public.booking_ref_by_slot();

commit;
