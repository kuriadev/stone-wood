-- Adds the maintenance switch that closes the public site.
--
-- A single-row table rather than a key/value store: there is exactly one
-- site, the columns are typed, and the reason is constrained to the same
-- three codes types/maintenance.ts defines — so an invalid state cannot be
-- written even by hand in the SQL editor.
--
-- The `id = 1` check is what keeps it single-row. Without it a second
-- INSERT would quietly create a rival settings row and the app would read
-- whichever came back first.

create table if not exists public.site_settings (
  id                  smallint     primary key default 1,
  maintenance_active  boolean      not null default false,
  maintenance_reason  text         not null default 'website_maintenance',
  maintenance_message text         not null default '',
  updated_at          timestamptz  not null default now(),
  constraint site_settings_single_row check (id = 1),
  constraint site_settings_reason_check check (
    maintenance_reason in ('resort_maintenance', 'resort_closed', 'website_maintenance')
  )
);

-- The one row. `on conflict do nothing` keeps this migration safe to re-run
-- and, importantly, never resets a live maintenance state back to off.
insert into public.site_settings (id) values (1)
on conflict (id) do nothing;

alter table public.site_settings enable row level security;

-- Public read: every visitor's browser has to learn the site is closed.
-- There is nothing sensitive here — it is the same banner they are shown.
-- Writes go through the service role key on the server only, exactly as
-- every other admin table does.
drop policy if exists "site_settings public read" on public.site_settings;
create policy "site_settings public read"
  on public.site_settings for select
  using (true);
