-- ════════════════════════════════════════════════════════════════════
-- Remove the food / menu feature.
--
-- The resort does not sell food — guests bring their own and use the
-- BBQ / grilling area. The menu, combo discounts, recipe-linked stock and
-- the "Pool + Food" package were added by the project team, not taken
-- from how the resort actually runs, and none of the capstone objectives
-- cover them. Keeping them would only add upkeep for a one-admin resort.
--
-- Written as a new migration rather than an edit to 20260923090000 so a
-- database that already ran that one is brought forward cleanly.
--
-- Run it with `supabase db push`, or paste it into the Supabase SQL editor.
-- Every statement is guarded, so running it twice is harmless.
-- ════════════════════════════════════════════════════════════════════

begin;

-- ── Menu items ──────────────────────────────────────────────────────
-- Nothing references this table, so it can go outright. Its RLS policy
-- and index are dropped with it.
drop table if exists public.menu_items;

-- ── Packages ────────────────────────────────────────────────────────
-- The "Pool + Food" package only existed to sell food at a discount.
-- Bookings store the package title as plain text, not a foreign key, so
-- any past booking made under it keeps its label.
delete from public.packages where code = 'POOL-FOOD';

alter table public.packages drop column if exists food_discount_pct;
alter table public.packages drop column if exists food_note;

-- ── Inventory ───────────────────────────────────────────────────────
-- 'Food Ingredients' rows only existed to be deducted by menu recipes.
-- They are removed first, because the tightened check below would
-- otherwise reject the table.
delete from public.inventory where category = 'Food Ingredients';

alter table public.inventory
  drop constraint if exists inventory_category_check;
alter table public.inventory
  add constraint inventory_category_check
  check (category in ('Pool & Chemicals','Furniture & Misc','Cleaning Tools'));

commit;
