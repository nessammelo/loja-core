-- Versão segura pra rodar de novo, mesmo se já tiver rodado parcialmente antes.

alter table products add column if not exists image_urls text[] default '{}'::text[];

create table if not exists banners (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  alt_text text,
  position integer default 0,
  created_at timestamptz default now()
);

alter table banners enable row level security;

drop policy if exists "banners visiveis pra todos" on banners;
create policy "banners visiveis pra todos" on banners
  for select using (true);

drop policy if exists "admin autenticado cria banners" on banners;
create policy "admin autenticado cria banners" on banners
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "admin autenticado apaga banners" on banners;
create policy "admin autenticado apaga banners" on banners
  for delete using (auth.role() = 'authenticated');

drop policy if exists "admin autenticado edita banners" on banners;
create policy "admin autenticado edita banners" on banners
  for update using (auth.role() = 'authenticated');

insert into storage.buckets (id, name, public)
values ('site-banners', 'site-banners', true)
on conflict (id) do nothing;

drop policy if exists "banners visiveis pra todos - storage" on storage.objects;
create policy "banners visiveis pra todos - storage"
on storage.objects for select
using (bucket_id = 'site-banners');

drop policy if exists "admin autenticado sobe banners" on storage.objects;
create policy "admin autenticado sobe banners"
on storage.objects for insert
with check (bucket_id = 'site-banners' and auth.role() = 'authenticated');

drop policy if exists "admin autenticado apaga banners - storage" on storage.objects;
create policy "admin autenticado apaga banners - storage"
on storage.objects for delete
using (bucket_id = 'site-banners' and auth.role() = 'authenticated');

-- só insere o banner inicial se ainda não existir nenhum
insert into banners (image_url, alt_text, position)
select '/assets/banner-institucional.png', 'No limite entre o controle e o caos, nasce a atitude.', 0
where not exists (select 1 from banners);
