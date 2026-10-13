-- ── Let the owner look a staff password up (the eye on Staff Accounts) ──
--
-- The owner asked to be able to see each person's password, for
-- transparency and for the day somebody forgets theirs. sign-in still uses
-- the scrypt hash in password_hash and never touches this column.
--
-- password_reveal holds the same password ENCRYPTED (AES-256-GCM, keyed from
-- the server's SESSION_SECRET), never as plain text. The key lives only in
-- the server's environment, so a copy of the database on its own reads as
-- noise. Only the owner's /api/staff/password route decrypts it, and every
-- time it does, the Activity History records who looked.
--
-- Existing accounts have nothing here yet: it fills in the next time that
-- person signs in, or when the owner resets their password.
--
-- Safe to run more than once. Only adds a column.

alter table public.staff add column if not exists password_reveal text;
