-- =========================================================
-- APP SETTINGS
-- =========================================================

create table if not exists app_settings (
  id int primary key default 1,
  latest_version text not null default '1.0.0',
  release_date timestamptz not null default now(),
  update_url text not null default 'https://github.com/Lucas-hedrix/Cupid-App/releases/download/v{version}/cupid.apk'
);

-- Initialize single row
insert into app_settings (id, latest_version, release_date, update_url) 
values (1, '1.0.0', now(), 'https://github.com/Lucas-hedrix/Cupid-App/releases/download/v{version}/cupid.apk') 
on conflict (id) do nothing;

-- Ensure anyone can read
alter table app_settings enable row level security;
create policy "Anyone can read app settings" on app_settings for select using (true);
