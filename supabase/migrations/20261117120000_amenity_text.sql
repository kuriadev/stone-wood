-- The Swimming Pool description from 2026-09-29 says "Private pool for
-- whole-day rental", from before the pool could be shared. Replace it only
-- where the owner never changed it.
update public.facilities
   set description = 'Share it with other groups, or book it for your group alone.'
 where name = 'Swimming Pool'
   and description = 'Private pool for whole-day rental, up to 30 guests.';
