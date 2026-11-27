-- Bucket de storage pra fotos de produto
-- Rodar no SQL Editor, depois de já ter rodado o schema.sql

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

create policy "fotos de produto visiveis pra todos"
on storage.objects for select
using (bucket_id = 'product-images');

create policy "admin pode subir fotos de produto"
on storage.objects for insert
with check (bucket_id = 'product-images');

create policy "admin pode atualizar fotos de produto"
on storage.objects for update
using (bucket_id = 'product-images');

create policy "admin pode apagar fotos de produto"
on storage.objects for delete
using (bucket_id = 'product-images');
