-- Aperta as permissões: só usuário autenticado (login do admin) pode
-- ler pedidos/clientes e gerenciar produtos. Loja/checkout continuam
-- públicos (leitura de catálogo, criação de pedido).
-- Rodar no SQL Editor, depois de já ter rodado schema.sql e storage_setup.sql

drop policy if exists "admin le tudo - clientes" on customers;
drop policy if exists "admin le tudo - pedidos" on orders;
drop policy if exists "admin atualiza pedidos" on orders;
drop policy if exists "admin le tudo - itens" on order_items;
drop policy if exists "admin gerencia produtos" on products;
drop policy if exists "admin gerencia variantes" on product_variants;

create policy "admin autenticado le clientes" on customers
  for select using (auth.role() = 'authenticated');

create policy "admin autenticado le pedidos" on orders
  for select using (auth.role() = 'authenticated');
create policy "admin autenticado atualiza pedidos" on orders
  for update using (auth.role() = 'authenticated');

create policy "admin autenticado le itens" on order_items
  for select using (auth.role() = 'authenticated');

create policy "admin autenticado gerencia produtos" on products
  for insert with check (auth.role() = 'authenticated');
create policy "admin autenticado edita produtos" on products
  for update using (auth.role() = 'authenticated');
create policy "admin autenticado apaga produtos" on products
  for delete using (auth.role() = 'authenticated');

create policy "admin autenticado gerencia variantes" on product_variants
  for insert with check (auth.role() = 'authenticated');
create policy "admin autenticado edita variantes" on product_variants
  for update using (auth.role() = 'authenticated');
create policy "admin autenticado apaga variantes" on product_variants
  for delete using (auth.role() = 'authenticated');

-- Storage: upload/edição de fotos só autenticado; leitura pública já ficava
drop policy if exists "admin pode subir fotos de produto" on storage.objects;
drop policy if exists "admin pode atualizar fotos de produto" on storage.objects;
drop policy if exists "admin pode apagar fotos de produto" on storage.objects;

create policy "admin autenticado sobe fotos de produto"
on storage.objects for insert
with check (bucket_id = 'product-images' and auth.role() = 'authenticated');

create policy "admin autenticado atualiza fotos de produto"
on storage.objects for update
using (bucket_id = 'product-images' and auth.role() = 'authenticated');

create policy "admin autenticado apaga fotos de produto"
on storage.objects for delete
using (bucket_id = 'product-images' and auth.role() = 'authenticated');
