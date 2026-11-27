-- Adiciona: banners gerenciáveis pelo admin, e múltiplas fotos por produto.
-- Rodar no SQL Editor, depois de tudo que já foi rodado antes.

-- Múltiplas fotos por produto (até 4, controlado no admin) -----
alter table products add column if not exists image_urls text[] default '{}'::text[];

-- BANNERS (carrossel da home) -----------------------------------
create table if not exists banners (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  alt_text text,
  position integer default 0,
  created_at timestamptz default now()
);

alter table banners enable row level security;

create policy "banners visiveis pra todos" on banners
  for select using (true);

create policy "admin autenticado cria banners" on banners
  for insert with check (auth.role() = 'authenticated');
create policy "admin autenticado apaga banners" on banners
  for delete using (auth.role() = 'authenticated');
create policy "admin autenticado edita banners" on banners
  for update using (auth.role() = 'authenticated');

-- Bucket de storage pra banners -----------------------------------
insert into storage.buckets (id, name, public)
values ('site-banners', 'site-banners', true)
on conflict (id) do nothing;

create policy "banners visiveis pra todos - storage"
on storage.objects for select
using (bucket_id = 'site-banners');

create policy "admin autenticado sobe banners"
on storage.objects for insert
with check (bucket_id = 'site-banners' and auth.role() = 'authenticated');

create policy "admin autenticado apaga banners - storage"
on storage.objects for delete
using (bucket_id = 'site-banners' and auth.role() = 'authenticated');

-- Migra o banner institucional que já estava fixo no código, pra virar
-- um registro editável (você pode apagar/reordenar depois pelo admin)
insert into banners (image_url, alt_text, position)
values ('/assets/banner-institucional.png', 'No limite entre o controle e o caos, nasce a atitude.', 0);
