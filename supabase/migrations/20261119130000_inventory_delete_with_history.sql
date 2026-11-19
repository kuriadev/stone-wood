-- Deleting an archived item for good (Supplies & Equipment → Archive →
-- Delete) failed with "Could not delete that item": the item's stock
-- history is removed with it (on delete cascade), and the append-only rule
-- on inventory_movements refused every delete, including that one.
--
-- History stays append-only for everything else: a movement can't be edited,
-- and can't be deleted on its own. Only the cascade from deleting its item
-- (a delete fired by the foreign key, one trigger level down, after the item
-- row is already gone) is let through.

create or replace function public.inventory_movements_append_only()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE'
     and (pg_trigger_depth() > 1 or not exists (select 1 from public.inventory where id = old.item_id)) then
    return old;
  end if;
  raise exception 'Stock movements are append-only: record a correction instead.';
end;
$$;
