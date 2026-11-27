-- =====================================================================
-- INSTALAÇÃO DA LOJA EM UM SUPABASE NOVO
-- Gerado por scripts/build-install-sql.mjs. Não editar à mão.
--
-- Como usar: no Supabase do cliente, SQL Editor > New query, colar este
-- arquivo inteiro e clicar em Run. Roda uma vez só, num projeto vazio.
-- Os módulos opcionais (amigo secreto, crew, Gubo) também criam suas tabelas,
-- mas ficam desligados até o cliente ligar em clients/<cliente>/brand.js.
-- =====================================================================

do $$
begin
  if to_regclass('public.orders') is not null then
    raise exception 'Este Supabase já tem a loja instalada. instalar.sql é só pra projeto novo; pra atualizar, rode só as migrações novas de supabase/.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- schema.sql
-- ---------------------------------------------------------------------
-- EDGE ecommerce — schema inicial
-- Rodar no SQL Editor do Supabase (Project > SQL Editor > New query)

-- PRODUCTS -------------------------------------------------
create table products (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  collection text,              -- ex: 'road-to-vegas', null = linha padrão
  description text,
  base_price numeric(10,2) not null,
  image_url text,
  active boolean default true,
  created_at timestamptz default now()
);

-- PRODUCT VARIANTS (modelo + tamanho + cor) -----------------
create table product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade,
  model_label text not null,     -- ex: 'Padrão', 'Tech Modal', 'Feminina', 'Cropped'
  size text not null,            -- ex: 'P', 'M', 'G', 'GG'
  color text not null,           -- ex: 'Preta'
  sku text unique,
  active boolean default true
);

-- CUSTOMERS (cadastro implícito no checkout) ----------------
create table customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  created_at timestamptz default now(),
  unique(email)
);

-- ORDERS -----------------------------------------------------
create table orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id),
  status text not null default 'novo',  -- aguardando pagamento | novo | repassado | enviado | entregue
  total numeric(10,2) not null,
  shipping_address jsonb not null,      -- {cep, endereco, numero, cidade}
  payment_method text,                  -- 'pix' | 'cartao'
  payment_status text default 'pendente',
  created_at timestamptz default now()
);

-- ORDER ITEMS --------------------------------------------------
create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  product_variant_id uuid references product_variants(id),
  product_name text not null,   -- snapshot, pra manter histórico se o produto mudar depois
  model_label text not null,
  size text not null,
  color text not null,
  unit_price numeric(10,2) not null,
  qty integer not null default 1
);

-- ROW LEVEL SECURITY -------------------------------------------
-- Leitura pública de produtos/variantes (loja) e escrita liberada
-- pra chave anon por enquanto (sem login de admin ainda).
-- Quando o admin tiver autenticação própria, apertar essas políticas.

alter table products enable row level security;
alter table product_variants enable row level security;
alter table customers enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;

create policy "produtos visiveis pra todos" on products
  for select using (true);
create policy "variantes visiveis pra todos" on product_variants
  for select using (true);

create policy "checkout pode criar cliente" on customers
  for insert with check (true);
create policy "checkout pode criar pedido" on orders
  for insert with check (true);
create policy "checkout pode criar itens" on order_items
  for insert with check (true);

-- Admin (temporário, sem auth ainda): permite leitura/gestão geral
create policy "admin le tudo - clientes" on customers for select using (true);
create policy "admin le tudo - pedidos" on orders for select using (true);
create policy "admin atualiza pedidos" on orders for update using (true);
create policy "admin le tudo - itens" on order_items for select using (true);
create policy "admin gerencia produtos" on products for all using (true);
create policy "admin gerencia variantes" on product_variants for all using (true);

-- SEED: produto Road to Vegas ------------------------------------
insert into products (slug, name, collection, description, base_price, image_url)
values (
  'road-to-vegas',
  'Road to Vegas',
  'road-to-vegas',
  'Nem toda jornada começa no aeroporto. Ela começa no primeiro treino. Na primeira queda. Na decisão de voltar ao tatame no dia seguinte. A Road to Vegas nasceu para homenagear todos os atletas que sonham em cruzar o deserto rumo ao Mundial Master, sabendo que a verdadeira viagem começou muito antes de Las Vegas aparecer no horizonte. A arte retrata a estrada que conduz ao skyline da cidade, simbolizando cada treino, cada desafio e cada conquista até o grande palco do jiu-jítsu mundial. Integrada à composição, a faixa representa a evolução construída ao longo do caminho. Porque o destino inspira. Mas é o caminho que transforma.',
  99.90,
  null
);

-- variantes do Road to Vegas (todos os modelos, todos os tamanhos, só preta)
insert into product_variants (product_id, model_label, size, color, sku)
select p.id, m.model_label, s.size, 'Preta',
       'RTV-' || upper(left(m.model_label,3)) || '-' || s.size
from products p,
     (values ('Padrão'), ('Tech Modal'), ('Feminina'), ('Cropped')) as m(model_label),
     (values ('P'), ('M'), ('G'), ('GG')) as s(size)
where p.slug = 'road-to-vegas';

-- ---------------------------------------------------------------------
-- storage_setup.sql
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- tighten_admin_policies.sql
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- create_order_function.sql
-- ---------------------------------------------------------------------
-- Função que cria cliente + pedido + itens numa tacada só, com privilégio
-- elevado (SECURITY DEFINER) — assim o checkout não precisa de permissão
-- de leitura direta nas tabelas customers/orders, que ficaram restritas
-- a admin autenticado. Rodar no SQL Editor.

create or replace function public.create_customer_order(
  p_name text,
  p_email text,
  p_phone text,
  p_address jsonb,
  p_items jsonb, -- array de {product_variant_id, product_name, model_label, size, color, unit_price, qty}
  p_total numeric,
  p_payment_method text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_order_id uuid;
begin
  insert into customers (name, email, phone)
  values (p_name, p_email, p_phone)
  on conflict (email) do update
    set name = excluded.name, phone = excluded.phone
  returning id into v_customer_id;

  insert into orders (customer_id, total, shipping_address, payment_method, status)
  values (v_customer_id, p_total, p_address, p_payment_method, 'aguardando pagamento')
  returning id into v_order_id;

  insert into order_items (
    order_id, product_variant_id, product_name, model_label, size, color, unit_price, qty
  )
  select
    v_order_id,
    (item->>'product_variant_id')::uuid,
    item->>'product_name',
    item->>'model_label',
    item->>'size',
    item->>'color',
    (item->>'unit_price')::numeric,
    (item->>'qty')::integer
  from jsonb_array_elements(p_items) as item;

  return v_order_id;
end;
$$;

grant execute on function public.create_customer_order to anon, authenticated;

-- ---------------------------------------------------------------------
-- fix_variant_delete.sql
-- ---------------------------------------------------------------------
-- Permite editar/apagar variantes de produto mesmo quando já usadas em
-- algum pedido — o pedido guarda uma cópia (nome, modelo, tamanho, cor)
-- então não perde histórico, só desvincula a referência.

alter table order_items
  drop constraint if exists order_items_product_variant_id_fkey;

alter table order_items
  add constraint order_items_product_variant_id_fkey
  foreign key (product_variant_id)
  references product_variants(id)
  on delete set null;

-- ---------------------------------------------------------------------
-- banners_and_multi_images_v2.sql
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- add_tracking_code.sql
-- ---------------------------------------------------------------------
alter table orders add column if not exists tracking_code text;
alter table orders add column if not exists carrier text;

-- ---------------------------------------------------------------------
-- add_shipping_fee.sql
-- ---------------------------------------------------------------------
-- MIGRAÇÃO: adiciona o frete fixo de R$ 25,00 ao fluxo de pedidos.
-- Rode isso no SQL Editor do seu projeto Supabase (Project > SQL Editor > New query).

-- 1) Nova coluna em orders pra guardar o valor do frete separado do total.
--    Pedidos antigos (antes do frete existir) ficam com shipping_fee = 0,
--    então o total deles não é alterado retroativamente.
alter table orders add column if not exists shipping_fee numeric(10,2) not null default 0;

-- 2) Troca a função create_customer_order pra receber o frete também.
--    Precisa dropar a versão antiga porque a lista de parâmetros mudou.
drop function if exists public.create_customer_order(text, text, text, jsonb, jsonb, numeric, text);

create or replace function public.create_customer_order(
  p_name text,
  p_email text,
  p_phone text,
  p_address jsonb,
  p_items jsonb, -- array de {product_variant_id, product_name, model_label, size, color, unit_price, qty}
  p_shipping_fee numeric,
  p_total numeric,
  p_payment_method text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_order_id uuid;
begin
  insert into customers (name, email, phone)
  values (p_name, p_email, p_phone)
  on conflict (email) do update
    set name = excluded.name, phone = excluded.phone
  returning id into v_customer_id;

  insert into orders (customer_id, total, shipping_fee, shipping_address, payment_method, status)
  values (v_customer_id, p_total, p_shipping_fee, p_address, p_payment_method, 'aguardando pagamento')
  returning id into v_order_id;

  insert into order_items (
    order_id, product_variant_id, product_name, model_label, size, color, unit_price, qty
  )
  select
    v_order_id,
    (item->>'product_variant_id')::uuid,
    item->>'product_name',
    item->>'model_label',
    item->>'size',
    item->>'color',
    (item->>'unit_price')::numeric,
    (item->>'qty')::integer
  from jsonb_array_elements(p_items) as item;

  return v_order_id;
end;
$$;

grant execute on function public.create_customer_order to anon, authenticated;

-- ---------------------------------------------------------------------
-- add_coupons.sql
-- ---------------------------------------------------------------------
-- MIGRAÇÃO: área de cupom de desconto.
-- Rode isso DEPOIS de já ter rodado add_shipping_fee.sql.

-- 1) Tabela de cupons.
create table if not exists coupons (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  type text not null check (type in ('percent', 'fixed', 'free_shipping')),
  value numeric(10,2), -- percentual (ex: 10) ou valor fixo em R$; null quando type = 'free_shipping'
  active boolean not null default true,
  max_uses integer, -- null = sem limite
  uses_count integer not null default 0,
  expires_at timestamptz, -- null = sem validade
  created_at timestamptz default now()
);

alter table coupons enable row level security;

-- Só o admin autenticado vê/gerencia a lista de cupons. A validação de um
-- código no checkout passa pela função validate_coupon abaixo (que roda
-- com privilégio elevado), não por leitura direta da tabela — assim a
-- loja não expõe a lista de cupons existentes pra qualquer visitante.
drop policy if exists "admin autenticado le cupons" on coupons;
create policy "admin autenticado le cupons" on coupons
  for select using (auth.role() = 'authenticated');

drop policy if exists "admin autenticado cria cupons" on coupons;
create policy "admin autenticado cria cupons" on coupons
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "admin autenticado edita cupons" on coupons;
create policy "admin autenticado edita cupons" on coupons
  for update using (auth.role() = 'authenticated');

drop policy if exists "admin autenticado apaga cupons" on coupons;
create policy "admin autenticado apaga cupons" on coupons
  for delete using (auth.role() = 'authenticated');

-- 2) Colunas novas em orders pra guardar o desconto aplicado.
alter table orders add column if not exists coupon_code text;
alter table orders add column if not exists discount_amount numeric(10,2) not null default 0;

-- 3) Função pública (anon) que só CONFERE se um código é válido pro
-- subtotal informado, sem aplicar nada ainda — usada no checkout pra
-- mostrar "cupom aplicado" antes de finalizar o pedido.
create or replace function public.validate_coupon(p_code text, p_subtotal numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coupon coupons;
  v_discount numeric(10,2) := 0;
begin
  select * into v_coupon from coupons
  where upper(code) = upper(p_code)
  limit 1;

  if v_coupon.id is null then
    return jsonb_build_object('valid', false, 'message', 'Cupom não encontrado.');
  end if;

  if not v_coupon.active then
    return jsonb_build_object('valid', false, 'message', 'Cupom inativo.');
  end if;

  if v_coupon.expires_at is not null and v_coupon.expires_at < now() then
    return jsonb_build_object('valid', false, 'message', 'Cupom expirado.');
  end if;

  if v_coupon.max_uses is not null and v_coupon.uses_count >= v_coupon.max_uses then
    return jsonb_build_object('valid', false, 'message', 'Cupom esgotado.');
  end if;

  if v_coupon.type = 'percent' then
    v_discount := round(p_subtotal * v_coupon.value / 100, 2);
  elsif v_coupon.type = 'fixed' then
    v_discount := least(v_coupon.value, p_subtotal);
  else
    v_discount := 0; -- free_shipping: desconto é no frete, não no subtotal
  end if;

  return jsonb_build_object(
    'valid', true,
    'type', v_coupon.type,
    'value', v_coupon.value,
    'discount_amount', v_discount,
    'free_shipping', v_coupon.type = 'free_shipping',
    'message', null
  );
end;
$$;

grant execute on function public.validate_coupon to anon, authenticated;

-- 4) create_customer_order agora recalcula e aplica o cupom no servidor
-- (não confia no desconto calculado no navegador) e incrementa o uso do
-- cupom atomicamente junto com a criação do pedido. Troca p_total por
-- p_coupon_code: o total final é sempre calculado aqui dentro.
drop function if exists public.create_customer_order(text, text, text, jsonb, jsonb, numeric, numeric, text);

create or replace function public.create_customer_order(
  p_name text,
  p_email text,
  p_phone text,
  p_address jsonb,
  p_items jsonb,
  p_shipping_fee numeric,
  p_coupon_code text,
  p_payment_method text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_order_id uuid;
  v_subtotal numeric(10,2) := 0;
  v_coupon coupons;
  v_discount numeric(10,2) := 0;
  v_shipping numeric(10,2) := coalesce(p_shipping_fee, 0);
  v_total numeric(10,2);
begin
  select coalesce(sum((item->>'unit_price')::numeric * (item->>'qty')::integer), 0)
  into v_subtotal
  from jsonb_array_elements(p_items) as item;

  if p_coupon_code is not null and length(trim(p_coupon_code)) > 0 then
    select * into v_coupon from coupons
    where upper(code) = upper(p_coupon_code)
      and active = true
      and (expires_at is null or expires_at > now())
      and (max_uses is null or uses_count < max_uses)
    limit 1;

    if v_coupon.id is not null then
      if v_coupon.type = 'percent' then
        v_discount := round(v_subtotal * v_coupon.value / 100, 2);
      elsif v_coupon.type = 'fixed' then
        v_discount := least(v_coupon.value, v_subtotal);
      elsif v_coupon.type = 'free_shipping' then
        v_shipping := 0;
      end if;

      update coupons set uses_count = uses_count + 1 where id = v_coupon.id;
    end if;
    -- cupom inválido/expirado/esgotado: ignora silenciosamente (o checkout
    -- já validou antes via validate_coupon; aqui é só a segunda checagem).
  end if;

  v_total := v_subtotal - v_discount + v_shipping;

  insert into customers (name, email, phone)
  values (p_name, p_email, p_phone)
  on conflict (email) do update
    set name = excluded.name, phone = excluded.phone
  returning id into v_customer_id;

  insert into orders (
    customer_id, total, shipping_fee, coupon_code, discount_amount,
    shipping_address, payment_method, status
  )
  values (
    v_customer_id, v_total, v_shipping,
    case when v_coupon.id is not null then upper(p_coupon_code) else null end,
    v_discount, p_address, p_payment_method, 'aguardando pagamento'
  )
  returning id into v_order_id;

  insert into order_items (
    order_id, product_variant_id, product_name, model_label, size, color, unit_price, qty
  )
  select
    v_order_id,
    (item->>'product_variant_id')::uuid,
    item->>'product_name',
    item->>'model_label',
    item->>'size',
    item->>'color',
    (item->>'unit_price')::numeric,
    (item->>'qty')::integer
  from jsonb_array_elements(p_items) as item;

  return v_order_id;
end;
$$;

grant execute on function public.create_customer_order to anon, authenticated;

-- ---------------------------------------------------------------------
-- update_coupons_and_collections.sql
-- ---------------------------------------------------------------------
-- MIGRAÇÃO: (1) cupom que vale só pra itens escolhidos, (2) ordem das coleções.
-- Rode DEPOIS de add_shipping_fee.sql e add_coupons.sql. Pode rodar mais de uma vez.

-- =====================================================================
-- 1) CUPOM POR ITEM
-- Sem nenhuma linha em coupon_products = o cupom vale pra todos os itens.
-- Com linhas = o desconto é calculado só em cima dos itens listados.
-- =====================================================================
create table if not exists coupon_products (
  coupon_id uuid not null references coupons(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  primary key (coupon_id, product_id)
);

alter table coupon_products enable row level security;

drop policy if exists "admin autenticado le itens do cupom" on coupon_products;
create policy "admin autenticado le itens do cupom" on coupon_products
  for select using (auth.role() = 'authenticated');

drop policy if exists "admin autenticado cria itens do cupom" on coupon_products;
create policy "admin autenticado cria itens do cupom" on coupon_products
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "admin autenticado apaga itens do cupom" on coupon_products;
create policy "admin autenticado apaga itens do cupom" on coupon_products
  for delete using (auth.role() = 'authenticated');

-- Soma (preço x qtd) só dos itens do carrinho em que o cupom vale.
create or replace function public.coupon_eligible_subtotal(p_coupon_id uuid, p_items jsonb)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum((item->>'unit_price')::numeric * (item->>'qty')::integer), 0)
  from jsonb_array_elements(p_items) as item
  where not exists (select 1 from coupon_products cp where cp.coupon_id = p_coupon_id)
     or exists (
       select 1
       from coupon_products cp
       join product_variants pv on pv.product_id = cp.product_id
       where cp.coupon_id = p_coupon_id
         and pv.id = nullif(item->>'product_variant_id', '')::uuid
     );
$$;

-- validate_coupon agora recebe os ITENS do carrinho (antes recebia só o subtotal).
drop function if exists public.validate_coupon(text, numeric);

create or replace function public.validate_coupon(p_code text, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coupon coupons;
  v_restricted boolean;
  v_eligible numeric(10,2);
  v_discount numeric(10,2) := 0;
begin
  select * into v_coupon from coupons
  where upper(code) = upper(trim(p_code))
  limit 1;

  if v_coupon.id is null then
    return jsonb_build_object('valid', false, 'message', 'Cupom não encontrado.');
  end if;
  if not v_coupon.active then
    return jsonb_build_object('valid', false, 'message', 'Cupom inativo.');
  end if;
  if v_coupon.expires_at is not null and v_coupon.expires_at < now() then
    return jsonb_build_object('valid', false, 'message', 'Cupom expirado.');
  end if;
  if v_coupon.max_uses is not null and v_coupon.uses_count >= v_coupon.max_uses then
    return jsonb_build_object('valid', false, 'message', 'Cupom esgotado.');
  end if;

  select exists (select 1 from coupon_products where coupon_id = v_coupon.id) into v_restricted;
  v_eligible := public.coupon_eligible_subtotal(v_coupon.id, p_items);

  if v_restricted and v_eligible <= 0 then
    return jsonb_build_object('valid', false, 'message', 'Esse cupom não vale para os itens do seu carrinho.');
  end if;

  if v_coupon.type = 'percent' then
    v_discount := round(v_eligible * v_coupon.value / 100, 2);
  elsif v_coupon.type = 'fixed' then
    v_discount := least(v_coupon.value, v_eligible);
  end if; -- free_shipping: sem desconto no subtotal

  return jsonb_build_object(
    'valid', true,
    'type', v_coupon.type,
    'value', v_coupon.value,
    'discount_amount', v_discount,
    'free_shipping', v_coupon.type = 'free_shipping',
    'restricted', v_restricted,
    'message', null
  );
end;
$$;

grant execute on function public.validate_coupon to anon, authenticated;

-- create_customer_order: mesma assinatura de antes; agora o desconto é
-- calculado só sobre os itens elegíveis do cupom.
create or replace function public.create_customer_order(
  p_name text,
  p_email text,
  p_phone text,
  p_address jsonb,
  p_items jsonb,
  p_shipping_fee numeric,
  p_coupon_code text,
  p_payment_method text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_order_id uuid;
  v_subtotal numeric(10,2) := 0;
  v_coupon coupons;
  v_coupon_ok boolean := false;
  v_eligible numeric(10,2) := 0;
  v_discount numeric(10,2) := 0;
  v_shipping numeric(10,2) := coalesce(p_shipping_fee, 0);
  v_total numeric(10,2);
begin
  select coalesce(sum((item->>'unit_price')::numeric * (item->>'qty')::integer), 0)
  into v_subtotal
  from jsonb_array_elements(p_items) as item;

  if p_coupon_code is not null and length(trim(p_coupon_code)) > 0 then
    select * into v_coupon from coupons
    where upper(code) = upper(trim(p_coupon_code))
      and active = true
      and (expires_at is null or expires_at > now())
      and (max_uses is null or uses_count < max_uses)
    limit 1;

    if v_coupon.id is not null then
      v_eligible := public.coupon_eligible_subtotal(v_coupon.id, p_items);
      -- cupom restrito a itens que não estão no carrinho: ignora
      v_coupon_ok := not (
        exists (select 1 from coupon_products where coupon_id = v_coupon.id)
        and v_eligible <= 0
      );
    end if;

    if v_coupon_ok then
      if v_coupon.type = 'percent' then
        v_discount := round(v_eligible * v_coupon.value / 100, 2);
      elsif v_coupon.type = 'fixed' then
        v_discount := least(v_coupon.value, v_eligible);
      elsif v_coupon.type = 'free_shipping' then
        v_shipping := 0;
      end if;

      update coupons set uses_count = uses_count + 1 where id = v_coupon.id;
    end if;
  end if;

  v_total := v_subtotal - v_discount + v_shipping;

  insert into customers (name, email, phone)
  values (p_name, p_email, p_phone)
  on conflict (email) do update
    set name = excluded.name, phone = excluded.phone
  returning id into v_customer_id;

  insert into orders (
    customer_id, total, shipping_fee, coupon_code, discount_amount,
    shipping_address, payment_method, status
  )
  values (
    v_customer_id, v_total, v_shipping,
    case when v_coupon_ok then upper(trim(p_coupon_code)) else null end,
    v_discount, p_address, p_payment_method, 'aguardando pagamento'
  )
  returning id into v_order_id;

  insert into order_items (
    order_id, product_variant_id, product_name, model_label, size, color, unit_price, qty
  )
  select
    v_order_id,
    (item->>'product_variant_id')::uuid,
    item->>'product_name',
    item->>'model_label',
    item->>'size',
    item->>'color',
    (item->>'unit_price')::numeric,
    (item->>'qty')::integer
  from jsonb_array_elements(p_items) as item;

  return v_order_id;
end;
$$;

grant execute on function public.create_customer_order to anon, authenticated;

-- =====================================================================
-- 2) ORDEM DAS COLEÇÕES
-- A loja lê essa tabela pra decidir qual coleção aparece primeiro.
-- Coleção que não está aqui (nova) aparece depois das ordenadas.
-- =====================================================================
create table if not exists collection_order (
  collection text primary key,   -- mesmo texto do campo "Coleção" do produto ('Loja' = produtos sem coleção)
  sort_order integer not null default 0
);

alter table collection_order enable row level security;

drop policy if exists "ordem das colecoes visivel pra todos" on collection_order;
create policy "ordem das colecoes visivel pra todos" on collection_order
  for select using (true);

drop policy if exists "admin autenticado cria ordem das colecoes" on collection_order;
create policy "admin autenticado cria ordem das colecoes" on collection_order
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "admin autenticado edita ordem das colecoes" on collection_order;
create policy "admin autenticado edita ordem das colecoes" on collection_order
  for update using (auth.role() = 'authenticated');

drop policy if exists "admin autenticado apaga ordem das colecoes" on collection_order;
create policy "admin autenticado apaga ordem das colecoes" on collection_order
  for delete using (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------
-- add_collection_hidden.sql
-- ---------------------------------------------------------------------
-- MIGRAÇÃO: coleção oculta (não aparece na home, só por link).
-- Rode DEPOIS de update_coupons_and_collections.sql. Pode rodar mais de uma vez.
alter table collection_order add column if not exists hidden boolean not null default false;

-- ---------------------------------------------------------------------
-- add_model_pricing_and_color_photos.sql
-- ---------------------------------------------------------------------
-- MIGRAÇÃO v7: preço por modelo, fotos por cor, paleta de cores
-- e preço calculado SEMPRE no servidor (o navegador não define mais o valor).
-- Rode DEPOIS das migrações anteriores. Pode rodar mais de uma vez.

-- =====================================================================
-- 1) PREÇO POR VARIANTE (= preço do modelo)
-- Produtos atuais: todas as variantes recebem o preço base de hoje.
-- =====================================================================
alter table product_variants add column if not exists price numeric(10,2);

update product_variants pv
set price = p.base_price
from products p
where pv.product_id = p.id and pv.price is null;

alter table product_variants alter column price set not null;

-- =====================================================================
-- 2) FOTOS POR COR  { "Preta": ["url1","url2"], "Off White": [...] }
-- As fotos que já existem (image_urls) continuam como "fotos gerais".
-- =====================================================================
alter table products add column if not exists color_images jsonb not null default '{}'::jsonb;

-- =====================================================================
-- 3) PALETA DE CORES (nome + cor da bolinha)
-- =====================================================================
create table if not exists product_colors (
  name text primary key,
  hex text not null
);

alter table product_colors enable row level security;

drop policy if exists "cores visiveis pra todos" on product_colors;
create policy "cores visiveis pra todos" on product_colors
  for select using (true);

drop policy if exists "admin autenticado cria cores" on product_colors;
create policy "admin autenticado cria cores" on product_colors
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "admin autenticado edita cores" on product_colors;
create policy "admin autenticado edita cores" on product_colors
  for update using (auth.role() = 'authenticated');

drop policy if exists "admin autenticado apaga cores" on product_colors;
create policy "admin autenticado apaga cores" on product_colors
  for delete using (auth.role() = 'authenticated');

insert into product_colors (name, hex) values
  ('Branca',      '#ffffff'),
  ('Preta',       '#111111'),
  ('Off White',   '#e9e4d6'),
  ('Marrom',      '#5b4636'),
  ('Verde Oliva', '#5a5a2e')
on conflict (name) do nothing;

-- =====================================================================
-- 4) PREÇO NO SERVIDOR
-- O carrinho só manda QUAL variante e QUANTAS unidades. O preço vem da
-- tabela product_variants, então ninguém consegue mudar o valor pelo
-- navegador.
-- =====================================================================
create or replace function public.coupon_eligible_subtotal(p_coupon_id uuid, p_items jsonb)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(pv.price * (item->>'qty')::integer), 0)
  from jsonb_array_elements(p_items) as item
  join product_variants pv on pv.id = nullif(item->>'product_variant_id', '')::uuid
  where not exists (select 1 from coupon_products cp where cp.coupon_id = p_coupon_id)
     or exists (
       select 1 from coupon_products cp
       where cp.coupon_id = p_coupon_id and cp.product_id = pv.product_id
     );
$$;

create or replace function public.create_customer_order(
  p_name text,
  p_email text,
  p_phone text,
  p_address jsonb,
  p_items jsonb,
  p_shipping_fee numeric,
  p_coupon_code text,
  p_payment_method text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_order_id uuid;
  v_subtotal numeric(10,2) := 0;
  v_items_count integer;
  v_valid_count integer;
  v_coupon coupons;
  v_coupon_ok boolean := false;
  v_eligible numeric(10,2) := 0;
  v_discount numeric(10,2) := 0;
  v_shipping numeric(10,2) := coalesce(p_shipping_fee, 0);
  v_total numeric(10,2);
begin
  select count(*) into v_items_count from jsonb_array_elements(p_items);

  select count(*), coalesce(sum(pv.price * (item->>'qty')::integer), 0)
  into v_valid_count, v_subtotal
  from jsonb_array_elements(p_items) as item
  join product_variants pv on pv.id = nullif(item->>'product_variant_id', '')::uuid
  where (item->>'qty')::integer > 0;

  if v_items_count = 0 or v_valid_count <> v_items_count then
    raise exception 'Um item do carrinho não está mais disponível. Remova e adicione de novo.';
  end if;

  if p_coupon_code is not null and length(trim(p_coupon_code)) > 0 then
    select * into v_coupon from coupons
    where upper(code) = upper(trim(p_coupon_code))
      and active = true
      and (expires_at is null or expires_at > now())
      and (max_uses is null or uses_count < max_uses)
    limit 1;

    if v_coupon.id is not null then
      v_eligible := public.coupon_eligible_subtotal(v_coupon.id, p_items);
      v_coupon_ok := not (
        exists (select 1 from coupon_products where coupon_id = v_coupon.id)
        and v_eligible <= 0
      );
    end if;

    if v_coupon_ok then
      if v_coupon.type = 'percent' then
        v_discount := round(v_eligible * v_coupon.value / 100, 2);
      elsif v_coupon.type = 'fixed' then
        v_discount := least(v_coupon.value, v_eligible);
      elsif v_coupon.type = 'free_shipping' then
        v_shipping := 0;
      end if;

      update coupons set uses_count = uses_count + 1 where id = v_coupon.id;
    end if;
  end if;

  v_total := v_subtotal - v_discount + v_shipping;

  insert into customers (name, email, phone)
  values (p_name, p_email, p_phone)
  on conflict (email) do update
    set name = excluded.name, phone = excluded.phone
  returning id into v_customer_id;

  insert into orders (
    customer_id, total, shipping_fee, coupon_code, discount_amount,
    shipping_address, payment_method, status
  )
  values (
    v_customer_id, v_total, v_shipping,
    case when v_coupon_ok then upper(trim(p_coupon_code)) else null end,
    v_discount, p_address, p_payment_method, 'aguardando pagamento'
  )
  returning id into v_order_id;

  -- nome, modelo, tamanho, cor e preço vêm do cadastro, não do navegador
  insert into order_items (
    order_id, product_variant_id, product_name, model_label, size, color, unit_price, qty
  )
  select
    v_order_id,
    pv.id,
    p.name,
    pv.model_label,
    pv.size,
    pv.color,
    pv.price,
    (item->>'qty')::integer
  from jsonb_array_elements(p_items) as item
  join product_variants pv on pv.id = nullif(item->>'product_variant_id', '')::uuid
  join products p on p.id = pv.product_id;

  return v_order_id;
end;
$$;

grant execute on function public.create_customer_order to anon, authenticated;

-- =====================================================================
-- 5) ESPECIFICAÇÕES, TABELAS DE MEDIDAS E AVISOS DA LOJA
-- =====================================================================
-- especificações do produto: [{ "label": "Tecido", "value": "100% algodão" }]
alter table products add column if not exists specs jsonb not null default '[]'::jsonb;

-- qual tabela de medidas cada modelo do produto usa: { "Oversized": "Camiseta Oversized" }
alter table products add column if not exists model_charts jsonb not null default '{}'::jsonb;

-- tabelas de medidas (grid = [[cabeçalho...], [linha...], ...])
create table if not exists size_charts (
  name text primary key,
  grid jsonb not null default '[]'::jsonb
);

alter table size_charts enable row level security;

drop policy if exists "medidas visiveis pra todos" on size_charts;
create policy "medidas visiveis pra todos" on size_charts
  for select using (true);

drop policy if exists "admin autenticado cria medidas" on size_charts;
create policy "admin autenticado cria medidas" on size_charts
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "admin autenticado edita medidas" on size_charts;
create policy "admin autenticado edita medidas" on size_charts
  for update using (auth.role() = 'authenticated');

drop policy if exists "admin autenticado apaga medidas" on size_charts;
create policy "admin autenticado apaga medidas" on size_charts
  for delete using (auth.role() = 'authenticated');

-- avisos da loja (prazo de entrega, trocas) mostrados na página do produto
create table if not exists store_settings (
  key text primary key,
  value text not null default ''
);

alter table store_settings enable row level security;

drop policy if exists "avisos visiveis pra todos" on store_settings;
create policy "avisos visiveis pra todos" on store_settings
  for select using (true);

drop policy if exists "admin autenticado cria avisos" on store_settings;
create policy "admin autenticado cria avisos" on store_settings
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "admin autenticado edita avisos" on store_settings;
create policy "admin autenticado edita avisos" on store_settings
  for update using (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------
-- add_amigo_secreto_e_botao_banner.sql
-- ---------------------------------------------------------------------
-- LOTE OUTUBRO/2026: amigo secreto + botão do banner configurável.
-- (O liga/desliga de produto não precisa de SQL: usa a coluna products.active que já existe.)
-- Rode DEPOIS de add_model_pricing_and_color_photos.sql. Pode rodar mais de uma vez.

-- =========================================================
-- 1) BOTÃO DO BANNER: texto e link por banner (sem link = sem botão)
-- =========================================================
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'banners' and column_name = 'cta_link'
  ) then
    alter table banners add column cta_text text;
    alter table banners add column cta_link text;
    -- só na primeira vez: os banners que já existem continuam com o botão de hoje
    update banners set cta_text = 'Ver coleção', cta_link = '#colecao';
  end if;
end $$;

-- =========================================================
-- 2) AMIGO SECRETO
-- Nada aqui é lido direto pelo navegador: tudo passa pelas funções ss_*
-- abaixo, que conferem o link secreto de cada pessoa.
-- =========================================================

-- liga/desliga do módulo (Admin > Amigo secreto). Começa desligado.
insert into store_settings (key, value) values ('secret_santa_enabled', 'false')
on conflict (key) do nothing;

create table if not exists ss_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  join_code text unique not null,
  draw_mode text not null default 'manual' check (draw_mode in ('auto', 'manual')),
  draw_date date,
  exchange_date date,
  min_value numeric(10,2),
  max_value numeric(10,2),
  require_approval boolean not null default true,
  reveal_after_exchange boolean not null default true,
  drawn_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists ss_participants (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references ss_groups(id) on delete cascade,
  name text not null,
  tee_size text,
  hoodie_size text,
  token text unique not null,
  is_organizer boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'approved')),
  assigned_to uuid references ss_participants(id) on delete set null,
  created_at timestamptz default now()
);
create index if not exists ss_participants_group_idx on ss_participants(group_id);
-- recuperação do link sem o responsável conseguir espiar:
-- PIN de 4 números (guardado embaralhado), link de recuperação que só abre com o PIN,
-- e registro de quando o responsável trocou o link à força.
alter table ss_participants add column if not exists pin_hash text;
alter table ss_participants add column if not exists recovery_token text unique;
alter table ss_participants add column if not exists recovery_attempts integer not null default 0;
alter table ss_participants add column if not exists recovery_links integer not null default 0;
alter table ss_participants add column if not exists link_reset_at timestamptz;

create table if not exists ss_wishlist (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references ss_participants(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  model_label text not null,
  color text not null,
  size text not null,
  created_at timestamptz default now()
);
create index if not exists ss_wishlist_participant_idx on ss_wishlist(participant_id);

-- conversa entre quem tirou (giver) e quem foi tirado; from_giver diz o sentido
create table if not exists ss_messages (
  id uuid primary key default gen_random_uuid(),
  giver_id uuid not null references ss_participants(id) on delete cascade,
  from_giver boolean not null,
  body text not null check (char_length(body) between 1 and 280),
  reported boolean not null default false,
  hidden boolean not null default false,
  created_at timestamptz default now()
);
create index if not exists ss_messages_giver_idx on ss_messages(giver_id);

alter table ss_groups enable row level security;
alter table ss_participants enable row level security;
alter table ss_wishlist enable row level security;
alter table ss_messages enable row level security;
-- sem políticas para o público: só as funções abaixo mexem nessas tabelas.
-- o admin logado só consegue ler (números na tela do admin).
drop policy if exists "admin autenticado le grupos" on ss_groups;
create policy "admin autenticado le grupos" on ss_groups
  for select using (auth.role() = 'authenticated');
drop policy if exists "admin autenticado le participantes" on ss_participants;
create policy "admin autenticado le participantes" on ss_participants
  for select using (auth.role() = 'authenticated');

-- ---------- funções internas ----------

create or replace function public.ss_today() returns date
language sql stable as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

create or replace function public.ss_enabled() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select value = 'true' from store_settings where key = 'secret_santa_enabled'), false)
$$;

create or replace function public.ss_new_token() returns text
language sql volatile as $$
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
$$;

create or replace function public.ss_clean_size(p text) returns text
language sql immutable as $$
  select nullif(left(trim(coalesce(p, '')), 6), '')
$$;

create or replace function public.ss_me(p_token text) returns ss_participants
language plpgsql stable security definer set search_path = public as $$
declare v ss_participants;
begin
  select * into v from ss_participants where token = p_token;
  if v.id is null then
    raise exception 'Link inválido, ou você não faz mais parte desse grupo. Fale com quem organizou.';
  end if;
  return v;
end $$;

-- sorteio em roda: embaralha e cada um tira o próximo (ninguém tira a si mesmo)
create or replace function public.ss_run_draw(p_group_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ids uuid[];
  v_n integer;
  i integer;
begin
  perform 1 from ss_groups where id = p_group_id and drawn_at is null for update;
  if not found then return; end if;

  select array_agg(id order by random()) into v_ids
  from ss_participants where group_id = p_group_id and status = 'approved';
  v_n := coalesce(array_length(v_ids, 1), 0);
  if v_n < 3 then
    raise exception 'O sorteio precisa de pelo menos 3 pessoas aprovadas.';
  end if;

  for i in 1..v_n loop
    update ss_participants set assigned_to = v_ids[(i % v_n) + 1] where id = v_ids[i];
  end loop;
  -- quem ainda estava esperando aprovação fica de fora
  delete from ss_participants where group_id = p_group_id and status = 'pending';
  update ss_groups set drawn_at = now() where id = p_group_id;
end $$;

-- sorteio automático: acontece quando alguém abre o grupo na data (ou depois)
create or replace function public.ss_maybe_auto_draw(p_group_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare g ss_groups;
begin
  select * into g from ss_groups where id = p_group_id;
  if g.drawn_at is null and g.draw_mode = 'auto' and g.draw_date is not null
     and g.draw_date <= ss_today()
     and (select count(*) from ss_participants where group_id = g.id and status = 'approved') >= 3 then
    perform ss_run_draw(g.id);
  end if;
end $$;

-- ---------- funções chamadas pela loja ----------

create or replace function public.ss_create_group(
  p_name text,
  p_organizer_name text,
  p_tee_size text,
  p_hoodie_size text,
  p_draw_mode text,
  p_draw_date date,
  p_exchange_date date,
  p_min_value numeric,
  p_max_value numeric,
  p_require_approval boolean,
  p_reveal_after_exchange boolean
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_group_id uuid;
  v_code text;
  v_token text := ss_new_token();
begin
  if not ss_enabled() then raise exception 'O amigo secreto não está disponível no momento.'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 60 then
    raise exception 'Dê um nome para o grupo (até 60 letras).';
  end if;
  if char_length(trim(coalesce(p_organizer_name, ''))) not between 1 and 40 then
    raise exception 'Coloque seu nome (até 40 letras).';
  end if;
  if p_draw_mode not in ('auto', 'manual') then raise exception 'Escolha como vai ser o sorteio.'; end if;
  if p_draw_mode = 'auto' and (p_draw_date is null or p_draw_date < ss_today()) then
    raise exception 'Escolha uma data de sorteio a partir de hoje.';
  end if;
  if p_exchange_date is not null and p_exchange_date < ss_today() then
    raise exception 'A data da troca já passou.';
  end if;
  if p_draw_mode = 'auto' and p_exchange_date is not null and p_draw_date > p_exchange_date then
    raise exception 'O sorteio precisa ser antes da troca.';
  end if;
  if p_min_value is not null and p_min_value < 0 or p_max_value is not null and p_max_value < 0 then
    raise exception 'Valores não podem ser negativos.';
  end if;
  if p_min_value is not null and p_max_value is not null and p_min_value > p_max_value then
    raise exception 'O valor mínimo está maior que o máximo.';
  end if;

  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from ss_groups where join_code = v_code);
  end loop;

  insert into ss_groups (name, join_code, draw_mode, draw_date, exchange_date, min_value, max_value,
                         require_approval, reveal_after_exchange)
  values (trim(p_name), v_code, p_draw_mode, case when p_draw_mode = 'auto' then p_draw_date end,
          p_exchange_date, p_min_value, p_max_value, coalesce(p_require_approval, true),
          coalesce(p_reveal_after_exchange, true))
  returning id into v_group_id;

  insert into ss_participants (group_id, name, tee_size, hoodie_size, token, is_organizer, status)
  values (v_group_id, trim(p_organizer_name), ss_clean_size(p_tee_size), ss_clean_size(p_hoodie_size),
          v_token, true, 'approved');

  return v_token;
end $$;

-- o que aparece para quem abre o link do grupo
create or replace function public.ss_group_preview(p_join_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare g ss_groups;
begin
  select * into g from ss_groups where join_code = upper(trim(p_join_code));
  if g.id is null then return null; end if;
  perform ss_maybe_auto_draw(g.id);
  select * into g from ss_groups where id = g.id;
  return jsonb_build_object(
    'name', g.name,
    'organizer', (select name from ss_participants where group_id = g.id and is_organizer limit 1),
    'count', (select count(*) from ss_participants where group_id = g.id and status = 'approved'),
    'draw_mode', g.draw_mode,
    'draw_date', g.draw_date,
    'exchange_date', g.exchange_date,
    'min_value', g.min_value,
    'max_value', g.max_value,
    'require_approval', g.require_approval,
    'drawn', g.drawn_at is not null,
    'open', g.drawn_at is null and ss_enabled()
  );
end $$;

create or replace function public.ss_pin_hash(p_participant_id uuid, p_pin text) returns text
language sql immutable as $$
  select encode(sha256(convert_to(p_participant_id::text || ':' || p_pin, 'UTF8')), 'hex')
$$;

drop function if exists public.ss_join(text, text, text, text);
create or replace function public.ss_join(
  p_join_code text, p_name text, p_tee_size text, p_hoodie_size text, p_pin text
) returns text
language plpgsql security definer set search_path = public as $$
declare
  g ss_groups;
  v_token text := ss_new_token();
  v_id uuid;
begin
  if not ss_enabled() then raise exception 'O amigo secreto não está disponível no momento.'; end if;
  select * into g from ss_groups where join_code = upper(trim(p_join_code)) for update;
  if g.id is null then raise exception 'Grupo não encontrado.'; end if;
  if g.drawn_at is not null then raise exception 'Esse grupo já fez o sorteio e não aceita mais gente.'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 40 then
    raise exception 'Coloque seu nome (até 40 letras).';
  end if;
  if coalesce(p_pin, '') !~ '^[0-9]{4}$' then
    raise exception 'Escolha um PIN de 4 números.';
  end if;
  if (select count(*) from ss_participants where group_id = g.id) >= 100 then
    raise exception 'Esse grupo chegou ao limite de 100 pessoas.';
  end if;

  insert into ss_participants (group_id, name, tee_size, hoodie_size, token, status)
  values (g.id, trim(p_name), ss_clean_size(p_tee_size), ss_clean_size(p_hoodie_size), v_token,
          case when g.require_approval then 'pending' else 'approved' end)
  returning id into v_id;
  update ss_participants set pin_hash = ss_pin_hash(v_id, p_pin) where id = v_id;
  return v_token;
end $$;

-- lista de desejos de uma pessoa, já com o preço do modelo
create or replace function public.ss_wishlist_json(p_participant_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', w.id,
    'product_slug', p.slug,
    'product_name', p.name,
    'model_label', w.model_label,
    'color', w.color,
    'size', w.size,
    'price', (select pv.price from product_variants pv
              where pv.product_id = p.id and pv.model_label = w.model_label
              order by (pv.size = w.size and pv.color = w.color) desc limit 1),
    'image_urls', p.image_urls,
    'image_url', p.image_url,
    'color_images', p.color_images
  ) order by w.created_at), '[]'::jsonb)
  from ss_wishlist w join products p on p.id = w.product_id
  where w.participant_id = p_participant_id
$$;

-- tudo o que a página secreta da pessoa mostra
create or replace function public.ss_my_page(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me ss_participants;
  g ss_groups;
  v_target ss_participants;
  v_giver_id uuid;
  v_reveal boolean;
  v_result jsonb;
begin
  me := ss_me(p_token);
  perform ss_maybe_auto_draw(me.group_id);
  select * into me from ss_participants where id = me.id;
  select * into g from ss_groups where id = me.group_id;
  v_reveal := g.drawn_at is not null and g.reveal_after_exchange
              and g.exchange_date is not null and ss_today() > g.exchange_date;

  v_result := jsonb_build_object(
    'me', jsonb_build_object('name', me.name, 'tee_size', me.tee_size, 'hoodie_size', me.hoodie_size,
                             'status', me.status, 'is_organizer', me.is_organizer,
                             'link_reset_at', me.link_reset_at),
    'group', jsonb_build_object('name', g.name, 'join_code', g.join_code, 'draw_mode', g.draw_mode,
                                'draw_date', g.draw_date, 'exchange_date', g.exchange_date,
                                'min_value', g.min_value, 'max_value', g.max_value,
                                'require_approval', g.require_approval,
                                'reveal_after_exchange', g.reveal_after_exchange,
                                'drawn', g.drawn_at is not null),
    'my_wishlist', ss_wishlist_json(me.id)
  );

  if g.drawn_at is not null and me.assigned_to is not null then
    select * into v_target from ss_participants where id = me.assigned_to;
    v_result := v_result || jsonb_build_object(
      'target', jsonb_build_object('name', v_target.name, 'tee_size', v_target.tee_size,
                                   'hoodie_size', v_target.hoodie_size,
                                   'wishlist', ss_wishlist_json(v_target.id)),
      -- conversa com quem eu tirei
      'chat_target', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', m.id, 'mine', m.from_giver, 'body', m.body, 'created_at', m.created_at
        ) order by m.created_at), '[]'::jsonb)
        from ss_messages m where m.giver_id = me.id and not m.hidden)
    );
  end if;

  if g.drawn_at is not null then
    select id into v_giver_id from ss_participants where assigned_to = me.id limit 1;
    v_result := v_result || jsonb_build_object(
      -- conversa com quem me tirou (sem dizer quem é)
      'chat_giver', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', m.id, 'mine', not m.from_giver, 'body', m.body, 'reported', m.reported,
          'created_at', m.created_at
        ) order by m.created_at), '[]'::jsonb)
        from ss_messages m where m.giver_id = v_giver_id and not m.hidden)
    );
  end if;

  if v_reveal then
    v_result := v_result || jsonb_build_object('reveal', (
      select coalesce(jsonb_agg(jsonb_build_object('giver', a.name, 'receiver', b.name) order by a.name), '[]'::jsonb)
      from ss_participants a join ss_participants b on b.id = a.assigned_to
      where a.group_id = g.id));
  end if;

  if me.is_organizer then
    v_result := v_result || jsonb_build_object(
      'participants', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', p.id, 'name', p.name, 'status', p.status, 'is_organizer', p.is_organizer,
          'tee_size', p.tee_size, 'hoodie_size', p.hoodie_size,
          'has_wishlist', exists (select 1 from ss_wishlist w where w.participant_id = p.id)
        ) order by p.created_at), '[]'::jsonb)
        from ss_participants p where p.group_id = g.id),
      'reported', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'body', m.body)
          order by m.created_at), '[]'::jsonb)
        from ss_messages m join ss_participants p on p.id = m.giver_id
        where p.group_id = g.id and m.reported and not m.hidden)
    );
  end if;

  return v_result;
end $$;

create or replace function public.ss_update_me(p_token text, p_name text, p_tee_size text, p_hoodie_size text)
returns void
language plpgsql security definer set search_path = public as $$
declare me ss_participants := ss_me(p_token);
begin
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 40 then
    raise exception 'Coloque seu nome (até 40 letras).';
  end if;
  update ss_participants
  set name = trim(p_name), tee_size = ss_clean_size(p_tee_size), hoodie_size = ss_clean_size(p_hoodie_size)
  where id = me.id;
end $$;

-- ---------- responsável ----------

create or replace function public.ss_organizer(p_token text) returns ss_participants
language plpgsql stable security definer set search_path = public as $$
declare me ss_participants := ss_me(p_token);
begin
  if not me.is_organizer then raise exception 'Só quem organizou o grupo pode fazer isso.'; end if;
  return me;
end $$;

-- p_action: 'approve' ou 'remove'
create or replace function public.ss_manage_participant(p_token text, p_participant_id uuid, p_action text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  me ss_participants := ss_organizer(p_token);
  v ss_participants;
begin
  select * into v from ss_participants where id = p_participant_id and group_id = me.group_id;
  if v.id is null then raise exception 'Pessoa não encontrada no grupo.'; end if;
  if exists (select 1 from ss_groups where id = me.group_id and drawn_at is not null) then
    raise exception 'Depois do sorteio não dá mais para mexer na lista.';
  end if;
  if p_action = 'approve' then
    update ss_participants set status = 'approved' where id = v.id;
  elsif p_action = 'remove' then
    if v.is_organizer then raise exception 'Quem organiza não pode sair do grupo.'; end if;
    delete from ss_participants where id = v.id;
  else
    raise exception 'Ação inválida.';
  end if;
end $$;

-- versão antiga (mostrava o link pessoal ao responsável): removida
drop function if exists public.ss_participant_link(text, uuid);

-- link de recuperação para quem perdeu o próprio link: só abre com o PIN da pessoa.
-- até 3 links de recuperação por pessoa, com 5 tentativas cada (evita chutar o PIN).
create or replace function public.ss_recovery_link(p_token text, p_participant_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  me ss_participants := ss_organizer(p_token);
  v ss_participants;
  v_code text := ss_new_token();
begin
  select * into v from ss_participants where id = p_participant_id and group_id = me.group_id;
  if v.id is null or v.is_organizer then raise exception 'Pessoa não encontrada no grupo.'; end if;
  if v.pin_hash is null then raise exception 'Essa pessoa não tem PIN. Use "Trocar link".'; end if;
  if v.recovery_links >= 3 then
    raise exception 'Limite de links de recuperação atingido. Use "Trocar link".';
  end if;
  update ss_participants
  set recovery_token = v_code, recovery_attempts = 0, recovery_links = recovery_links + 1
  where id = v.id;
  return v_code;
end $$;

-- a pessoa abre o link de recuperação e digita o PIN: recebe o link pessoal.
-- devolve {token} ou {error} (sem exception, para a contagem de tentativas ficar salva)
drop function if exists public.ss_recover(text, text);
create or replace function public.ss_recover(p_recovery_token text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v ss_participants;
begin
  select * into v from ss_participants where recovery_token = p_recovery_token for update;
  if v.id is null then
    return jsonb_build_object('error', 'Esse link de recuperação não vale mais. Peça outro para quem organizou.');
  end if;
  if v.pin_hash = ss_pin_hash(v.id, coalesce(p_pin, '')) then
    update ss_participants set recovery_token = null, recovery_attempts = 0 where id = v.id;
    return jsonb_build_object('token', v.token);
  end if;
  if v.recovery_attempts + 1 >= 5 then
    update ss_participants set recovery_token = null, recovery_attempts = 0 where id = v.id;
    return jsonb_build_object('error', 'PIN errado 5 vezes. Esse link parou de funcionar: peça outro para quem organizou.');
  end if;
  update ss_participants set recovery_attempts = recovery_attempts + 1 where id = v.id;
  return jsonb_build_object('error', case when v.recovery_attempts + 1 = 4 then 'PIN errado. Resta 1 tentativa.'
    else format('PIN errado. Restam %s tentativas.', 5 - (v.recovery_attempts + 1)) end);
end $$;

-- quando a pessoa esqueceu o PIN: o responsável troca o link à força.
-- o link antigo para de funcionar e a página da pessoa avisa que foi trocado.
create or replace function public.ss_reset_link(p_token text, p_participant_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  me ss_participants := ss_organizer(p_token);
  v_new text := ss_new_token();
begin
  update ss_participants
  set token = v_new, recovery_token = null, recovery_attempts = 0, link_reset_at = now()
  where id = p_participant_id and group_id = me.group_id and not is_organizer;
  if not found then raise exception 'Pessoa não encontrada no grupo.'; end if;
  return v_new;
end $$;

create or replace function public.ss_draw_now(p_token text) returns void
language plpgsql security definer set search_path = public as $$
declare me ss_participants := ss_organizer(p_token);
begin
  if exists (select 1 from ss_groups where id = me.group_id and drawn_at is not null) then
    raise exception 'O sorteio já foi feito.';
  end if;
  perform ss_run_draw(me.group_id);
end $$;

create or replace function public.ss_hide_message(p_token text, p_message_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me ss_participants := ss_organizer(p_token);
begin
  update ss_messages m set hidden = true
  from ss_participants p
  where m.id = p_message_id and p.id = m.giver_id and p.group_id = me.group_id;
end $$;

-- ---------- lista de desejos ----------

create or replace function public.ss_wishlist_add(
  p_token text, p_product_slug text, p_model_label text, p_color text, p_size text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  me ss_participants := ss_me(p_token);
  v_product_id uuid;
begin
  select pv.product_id into v_product_id
  from product_variants pv join products p on p.id = pv.product_id
  where p.slug = p_product_slug and pv.model_label = p_model_label
    and pv.color = p_color and pv.size = p_size
  limit 1;
  if v_product_id is null then raise exception 'Essa combinação do produto não existe mais.'; end if;
  if (select count(*) from ss_wishlist where participant_id = me.id) >= 20 then
    raise exception 'Sua lista já tem 20 itens. Tire algum para pôr outro.';
  end if;
  if exists (select 1 from ss_wishlist where participant_id = me.id and product_id = v_product_id
             and model_label = p_model_label and color = p_color and size = p_size) then
    return;
  end if;
  insert into ss_wishlist (participant_id, product_id, model_label, color, size)
  values (me.id, v_product_id, p_model_label, p_color, p_size);
end $$;

create or replace function public.ss_wishlist_remove(p_token text, p_item_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me ss_participants := ss_me(p_token);
begin
  delete from ss_wishlist where id = p_item_id and participant_id = me.id;
end $$;

-- ---------- mensagens secretas ----------

-- p_to: 'target' (quem eu tirei) ou 'giver' (quem me tirou)
create or replace function public.ss_send_message(p_token text, p_to text, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare
  me ss_participants := ss_me(p_token);
  v_giver_id uuid;
  v_body text := trim(coalesce(p_body, ''));
begin
  if char_length(v_body) not between 1 and 280 then
    raise exception 'A mensagem precisa ter de 1 a 280 letras.';
  end if;
  if v_body ~* '(https?://|www\.|\.com|\.br\b|\.net\b)' then
    raise exception 'Mensagens não podem ter links.';
  end if;
  if not exists (select 1 from ss_groups where id = me.group_id and drawn_at is not null) then
    raise exception 'As mensagens abrem depois do sorteio.';
  end if;

  if p_to = 'target' then
    if me.assigned_to is null then raise exception 'Você ainda não tirou ninguém.'; end if;
    v_giver_id := me.id;
  elsif p_to = 'giver' then
    select id into v_giver_id from ss_participants where assigned_to = me.id limit 1;
    if v_giver_id is null then raise exception 'Ninguém te tirou ainda.'; end if;
  else
    raise exception 'Destino inválido.';
  end if;

  -- trava contra enxurrada: 30 mensagens por pessoa por dia
  if (select count(*) from ss_messages m
      where m.created_at > now() - interval '1 day'
        and ((m.giver_id = me.id and m.from_giver)
          or (not m.from_giver and m.giver_id = (select id from ss_participants where assigned_to = me.id limit 1)))
     ) >= 30 then
    raise exception 'Você mandou muitas mensagens hoje. Tente amanhã.';
  end if;

  insert into ss_messages (giver_id, from_giver, body) values (v_giver_id, p_to = 'target', v_body);
end $$;

-- quem recebeu a mensagem pode denunciar; o responsável vê e pode ocultar
create or replace function public.ss_report_message(p_token text, p_message_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me ss_participants := ss_me(p_token);
begin
  update ss_messages m set reported = true
  where m.id = p_message_id
    and ((m.giver_id = me.id and not m.from_giver)                         -- resposta de quem eu tirei
      or (m.from_giver and m.giver_id = (select id from ss_participants where assigned_to = me.id limit 1)));
end $$;

-- ---------- permissões ----------
-- as funções internas não ficam expostas para o público
revoke execute on function public.ss_run_draw(uuid) from public, anon, authenticated;
revoke execute on function public.ss_maybe_auto_draw(uuid) from public, anon, authenticated;
revoke execute on function public.ss_me(text) from public, anon, authenticated;
revoke execute on function public.ss_organizer(text) from public, anon, authenticated;
revoke execute on function public.ss_wishlist_json(uuid) from public, anon, authenticated;
revoke execute on function public.ss_new_token() from public, anon, authenticated;
revoke execute on function public.ss_pin_hash(uuid, text) from public, anon, authenticated;

grant execute on function public.ss_enabled() to anon, authenticated;
grant execute on function public.ss_create_group(text, text, text, text, text, date, date, numeric, numeric, boolean, boolean) to anon, authenticated;
grant execute on function public.ss_group_preview(text) to anon, authenticated;
grant execute on function public.ss_join(text, text, text, text, text) to anon, authenticated;
grant execute on function public.ss_my_page(text) to anon, authenticated;
grant execute on function public.ss_update_me(text, text, text, text) to anon, authenticated;
grant execute on function public.ss_manage_participant(text, uuid, text) to anon, authenticated;
grant execute on function public.ss_recovery_link(text, uuid) to anon, authenticated;
grant execute on function public.ss_recover(text, text) to anon, authenticated;
grant execute on function public.ss_reset_link(text, uuid) to anon, authenticated;
grant execute on function public.ss_draw_now(text) to anon, authenticated;
grant execute on function public.ss_hide_message(text, uuid) to anon, authenticated;
grant execute on function public.ss_wishlist_add(text, text, text, text, text) to anon, authenticated;
grant execute on function public.ss_wishlist_remove(text, uuid) to anon, authenticated;
grant execute on function public.ss_send_message(text, text, text) to anon, authenticated;
grant execute on function public.ss_report_message(text, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- add_gubo_shipping.sql
-- ---------------------------------------------------------------------
-- FRETE CALCULADO PELA GUBO
-- Troca o frete fixo de R$ 25 pelo frete real da Gubo, calculado pelo CEP.
-- Se a Gubo não responder, a loja continua cobrando R$ 25.
--
-- Pode rodar mais de uma vez sem problema.
-- Rode ANTES ou junto com o deploy do v11. O site antigo continua funcionando
-- com este SQL (cobra R$ 25 como hoje).

-- =====================================================================
-- 1) MODELO DA LOJA -> PEÇA DA GUBO
--   O frete só depende do tipo de peça (peso). Cada modelo da loja aponta
--   para um SKU de exemplo da Gubo com o mesmo tipo de peça.
-- =====================================================================
create table if not exists shipping_models (
  model_label text primary key,          -- como está na loja (ex: Padrão, Baby Look)
  gubo_sku text not null,                -- ex: P261010362-PRET-M
  gubo_model_name text,                  -- só pra mostrar no admin (ex: Camiseta Padrão)
  updated_at timestamptz not null default now()
);

alter table shipping_models enable row level security;

drop policy if exists "admin le modelos de frete" on shipping_models;
drop policy if exists "admin grava modelos de frete" on shipping_models;
create policy "admin le modelos de frete" on shipping_models
  for select using (auth.role() = 'authenticated');
create policy "admin grava modelos de frete" on shipping_models
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Ligações iniciais (do catálogo "Meus produtos" lido em 27/10/2026).
-- Não sobrescreve o que já foi mudado no admin.
insert into shipping_models (model_label, gubo_sku, gubo_model_name) values
  ('Padrão',            'P261010362-PRET-M', 'Camiseta Padrão'),
  ('Baby Look',         'P260910905-PRET-M', 'Babylook'),
  ('Feminina',          'P260910905-PRET-M', 'Babylook'),
  ('Croped',            'P261010142-PRET-M', 'Cropped'),
  ('Cropped',           'P261010142-PRET-M', 'Cropped'),
  ('Oversized',         'P261010512-PRET-M', 'Camiseta Oversized'),
  ('Tech Modal',        'P261010481-PRET-M', 'Camiseta Tech Modal'),
  ('Moletom com Capuz', 'P261010373-PRET-M', 'Moletom com Capuz 2 Cabos'),
  ('Moletom sem capuz', 'P261010371-PRET-M', 'Moletom sem Capuz')
on conflict (model_label) do nothing;

-- =====================================================================
-- 2) COTAÇÕES GUARDADAS NO SERVIDOR
--   Quem grava é só a função da Netlify (chave de serviço). O pedido usa o
--   valor daqui, nunca o que o navegador mandar.
-- =====================================================================
create table if not exists shipping_quotes (
  id uuid primary key default gen_random_uuid(),
  cep text not null,                     -- só números
  items jsonb not null,                  -- [{v: variante, q: quantidade}] em ordem
  price numeric(10,2) not null,
  source text not null,                  -- 'gubo' | 'fixo'
  service_code text,
  service_name text,
  days integer,                          -- prazo total em dias úteis (produção + transporte)
  eta date,
  gubo_quote_id text,
  note text,                             -- motivo quando caiu no fixo
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '2 hours'
);

alter table shipping_quotes enable row level security;
-- sem políticas: ninguém lê nem grava pelo navegador

create index if not exists shipping_quotes_created_at_idx on shipping_quotes (created_at);

-- carrinho em formato único pra comparar cotação e pedido
create or replace function public.shipping_items_key(p_items jsonb)
returns jsonb
language sql
immutable
as $$
  select coalesce(jsonb_agg(jsonb_build_object('v', v, 'q', q) order by v), '[]'::jsonb)
  from (
    select item->>'product_variant_id' as v, sum((item->>'qty')::integer) as q
    from jsonb_array_elements(p_items) as item
    group by 1
  ) x;
$$;

create or replace function public.save_shipping_quote(
  p_cep text,
  p_items jsonb,
  p_price numeric,
  p_source text,
  p_service_code text,
  p_service_name text,
  p_days integer,
  p_eta date,
  p_gubo_quote_id text,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  delete from shipping_quotes where created_at < now() - interval '7 days';

  insert into shipping_quotes (
    cep, items, price, source, service_code, service_name, days, eta, gubo_quote_id, note
  ) values (
    regexp_replace(p_cep, '\D', '', 'g'), public.shipping_items_key(p_items), p_price, p_source,
    p_service_code, p_service_name, p_days, p_eta, p_gubo_quote_id, p_note
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.save_shipping_quote from public, anon, authenticated;
grant execute on function public.save_shipping_quote to service_role;

-- =====================================================================
-- 3) PEDIDO GUARDA O FRETE ESCOLHIDO
-- =====================================================================
alter table orders add column if not exists shipping_quote_id uuid;
alter table orders add column if not exists shipping_service text;
alter table orders add column if not exists shipping_days integer;
alter table orders add column if not exists shipping_eta date;

-- =====================================================================
-- 4) CRIAÇÃO DO PEDIDO USA A COTAÇÃO GUARDADA
--   p_shipping_fee continua na lista só pra o site antigo não quebrar,
--   mas é ignorado. Sem cotação, o frete é R$ 25 (como hoje).
-- =====================================================================
drop function if exists public.create_customer_order(text, text, text, jsonb, jsonb, numeric, text, text);

create or replace function public.create_customer_order(
  p_name text,
  p_email text,
  p_phone text,
  p_address jsonb,
  p_items jsonb,
  p_shipping_fee numeric,
  p_coupon_code text,
  p_payment_method text,
  p_shipping_quote_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_order_id uuid;
  v_subtotal numeric(10,2) := 0;
  v_items_count integer;
  v_valid_count integer;
  v_coupon coupons;
  v_coupon_ok boolean := false;
  v_eligible numeric(10,2) := 0;
  v_discount numeric(10,2) := 0;
  v_quote shipping_quotes;
  v_shipping numeric(10,2) := 25.00;  -- frete fixo de reserva
  v_total numeric(10,2);
begin
  select count(*) into v_items_count from jsonb_array_elements(p_items);

  select count(*), coalesce(sum(pv.price * (item->>'qty')::integer), 0)
  into v_valid_count, v_subtotal
  from jsonb_array_elements(p_items) as item
  join product_variants pv on pv.id = nullif(item->>'product_variant_id', '')::uuid
  where (item->>'qty')::integer > 0;

  if v_items_count = 0 or v_valid_count <> v_items_count then
    raise exception 'Um item do carrinho não está mais disponível. Remova e adicione de novo.';
  end if;

  if p_shipping_quote_id is not null then
    select * into v_quote from shipping_quotes where id = p_shipping_quote_id;

    if v_quote.id is null or v_quote.expires_at < now() then
      raise exception 'O cálculo do frete expirou. Confira o CEP e tente de novo.';
    end if;

    if v_quote.cep <> regexp_replace(coalesce(p_address->>'cep', ''), '\D', '', 'g')
       or v_quote.items <> public.shipping_items_key(p_items) then
      raise exception 'O frete não confere com o carrinho. Confira o CEP e tente de novo.';
    end if;

    v_shipping := v_quote.price;
  end if;

  if p_coupon_code is not null and length(trim(p_coupon_code)) > 0 then
    select * into v_coupon from coupons
    where upper(code) = upper(trim(p_coupon_code))
      and active = true
      and (expires_at is null or expires_at > now())
      and (max_uses is null or uses_count < max_uses)
    limit 1;

    if v_coupon.id is not null then
      v_eligible := public.coupon_eligible_subtotal(v_coupon.id, p_items);
      v_coupon_ok := not (
        exists (select 1 from coupon_products where coupon_id = v_coupon.id)
        and v_eligible <= 0
      );
    end if;

    if v_coupon_ok then
      if v_coupon.type = 'percent' then
        v_discount := round(v_eligible * v_coupon.value / 100, 2);
      elsif v_coupon.type = 'fixed' then
        v_discount := least(v_coupon.value, v_eligible);
      elsif v_coupon.type = 'free_shipping' then
        v_shipping := 0;
      end if;

      update coupons set uses_count = uses_count + 1 where id = v_coupon.id;
    end if;
  end if;

  v_total := v_subtotal - v_discount + v_shipping;

  insert into customers (name, email, phone)
  values (p_name, p_email, p_phone)
  on conflict (email) do update
    set name = excluded.name, phone = excluded.phone
  returning id into v_customer_id;

  insert into orders (
    customer_id, total, shipping_fee, coupon_code, discount_amount,
    shipping_address, payment_method, status,
    shipping_quote_id, shipping_service, shipping_days, shipping_eta
  )
  values (
    v_customer_id, v_total, v_shipping,
    case when v_coupon_ok then upper(trim(p_coupon_code)) else null end,
    v_discount, p_address, p_payment_method, 'aguardando pagamento',
    v_quote.id,
    case when v_quote.source = 'gubo' then v_quote.service_name else 'Frete fixo' end,
    v_quote.days, v_quote.eta
  )
  returning id into v_order_id;

  -- nome, modelo, tamanho, cor e preço vêm do cadastro, não do navegador
  insert into order_items (
    order_id, product_variant_id, product_name, model_label, size, color, unit_price, qty
  )
  select
    v_order_id,
    pv.id,
    p.name,
    pv.model_label,
    pv.size,
    pv.color,
    pv.price,
    (item->>'qty')::integer
  from jsonb_array_elements(p_items) as item
  join product_variants pv on pv.id = nullif(item->>'product_variant_id', '')::uuid
  join products p on p.id = pv.product_id;

  return v_order_id;
end;
$$;

grant execute on function public.create_customer_order to anon, authenticated;

-- PostgREST recarrega a lista de funções
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- add_kit_coupon.sql
-- ---------------------------------------------------------------------
-- MIGRAÇÃO: cupom do tipo KIT ("leve N por R$ X"), ex: DUPLA = 2 camisetas por R$ 149.
-- Rode DEPOIS de add_gubo_shipping.sql. Pode rodar mais de uma vez.
--
-- Como o desconto é calculado:
--   1. pega só os itens elegíveis do cupom (os produtos marcados; nenhum marcado = todos)
--   2. "abre" cada unidade com o preço do cadastro (não o do navegador)
--   3. ordena do mais caro pro mais barato e agrupa de N em N
--   4. cada grupo completo paga o preço do kit; desconto = soma do grupo - preço do kit
--      (se o grupo já custa menos que o kit, ex: 2 cropped, o desconto daquele grupo é 0)
--   Unidade que sobra fora de um grupo completo paga preço cheio.

-- 1) Tipo novo + quantidade do kit
alter table coupons drop constraint if exists coupons_type_check;
alter table coupons add constraint coupons_type_check
  check (type in ('percent', 'fixed', 'free_shipping', 'bundle'));

alter table coupons add column if not exists bundle_qty integer;

-- 2) Desconto do kit para um carrinho
create or replace function public.coupon_bundle_discount(p_coupon_id uuid, p_items jsonb)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  with c as (
    select value as kit_price, coalesce(bundle_qty, 2) as kit_qty
    from coupons where id = p_coupon_id
  ),
  units as (
    select pv.price
    from jsonb_array_elements(p_items) as item
    join product_variants pv on pv.id = nullif(item->>'product_variant_id', '')::uuid
    cross join lateral generate_series(1, greatest((item->>'qty')::integer, 0))
    where not exists (select 1 from coupon_products cp where cp.coupon_id = p_coupon_id)
       or exists (
         select 1 from coupon_products cp
         where cp.coupon_id = p_coupon_id and cp.product_id = pv.product_id
       )
  ),
  ranked as (
    select price, (row_number() over (order by price desc) - 1) / (select kit_qty from c) as grp
    from units
  ),
  groups as (
    select grp, sum(price) as grp_sum, count(*) as n
    from ranked group by grp
  )
  select coalesce(sum(greatest(grp_sum - (select kit_price from c), 0)), 0)::numeric(10,2)
  from groups
  where n = (select kit_qty from c);
$$;

-- 3) validate_coupon com o tipo kit
create or replace function public.validate_coupon(p_code text, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coupon coupons;
  v_restricted boolean;
  v_eligible numeric(10,2);
  v_discount numeric(10,2) := 0;
begin
  select * into v_coupon from coupons
  where upper(code) = upper(trim(p_code))
  limit 1;

  if v_coupon.id is null then
    return jsonb_build_object('valid', false, 'message', 'Cupom não encontrado.');
  end if;
  if not v_coupon.active then
    return jsonb_build_object('valid', false, 'message', 'Cupom inativo.');
  end if;
  if v_coupon.expires_at is not null and v_coupon.expires_at < now() then
    return jsonb_build_object('valid', false, 'message', 'Cupom expirado.');
  end if;
  if v_coupon.max_uses is not null and v_coupon.uses_count >= v_coupon.max_uses then
    return jsonb_build_object('valid', false, 'message', 'Cupom esgotado.');
  end if;

  select exists (select 1 from coupon_products where coupon_id = v_coupon.id) into v_restricted;
  v_eligible := public.coupon_eligible_subtotal(v_coupon.id, p_items);

  if v_restricted and v_eligible <= 0 then
    return jsonb_build_object('valid', false, 'message', 'Esse cupom não vale para os itens do seu carrinho.');
  end if;

  if v_coupon.type = 'percent' then
    v_discount := round(v_eligible * v_coupon.value / 100, 2);
  elsif v_coupon.type = 'fixed' then
    v_discount := least(v_coupon.value, v_eligible);
  elsif v_coupon.type = 'bundle' then
    v_discount := public.coupon_bundle_discount(v_coupon.id, p_items);
    if v_discount <= 0 then
      return jsonb_build_object(
        'valid', false,
        'message', format('Esse cupom vale para %s peças no carrinho.', coalesce(v_coupon.bundle_qty, 2))
      );
    end if;
  end if; -- free_shipping: sem desconto no subtotal

  return jsonb_build_object(
    'valid', true,
    'type', v_coupon.type,
    'value', v_coupon.value,
    'discount_amount', v_discount,
    'free_shipping', v_coupon.type = 'free_shipping',
    'restricted', v_restricted,
    'message', null
  );
end;
$$;

grant execute on function public.validate_coupon to anon, authenticated;

-- 4) create_customer_order: igual ao de add_gubo_shipping.sql + tipo kit
create or replace function public.create_customer_order(
  p_name text,
  p_email text,
  p_phone text,
  p_address jsonb,
  p_items jsonb,
  p_shipping_fee numeric,
  p_coupon_code text,
  p_payment_method text,
  p_shipping_quote_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_order_id uuid;
  v_subtotal numeric(10,2) := 0;
  v_items_count integer;
  v_valid_count integer;
  v_coupon coupons;
  v_coupon_ok boolean := false;
  v_eligible numeric(10,2) := 0;
  v_discount numeric(10,2) := 0;
  v_quote shipping_quotes;
  v_shipping numeric(10,2) := 25.00;  -- frete fixo de reserva
  v_total numeric(10,2);
begin
  select count(*) into v_items_count from jsonb_array_elements(p_items);

  select count(*), coalesce(sum(pv.price * (item->>'qty')::integer), 0)
  into v_valid_count, v_subtotal
  from jsonb_array_elements(p_items) as item
  join product_variants pv on pv.id = nullif(item->>'product_variant_id', '')::uuid
  where (item->>'qty')::integer > 0;

  if v_items_count = 0 or v_valid_count <> v_items_count then
    raise exception 'Um item do carrinho não está mais disponível. Remova e adicione de novo.';
  end if;

  if p_shipping_quote_id is not null then
    select * into v_quote from shipping_quotes where id = p_shipping_quote_id;

    if v_quote.id is null or v_quote.expires_at < now() then
      raise exception 'O cálculo do frete expirou. Confira o CEP e tente de novo.';
    end if;

    if v_quote.cep <> regexp_replace(coalesce(p_address->>'cep', ''), '\D', '', 'g')
       or v_quote.items <> public.shipping_items_key(p_items) then
      raise exception 'O frete não confere com o carrinho. Confira o CEP e tente de novo.';
    end if;

    v_shipping := v_quote.price;
  end if;

  if p_coupon_code is not null and length(trim(p_coupon_code)) > 0 then
    select * into v_coupon from coupons
    where upper(code) = upper(trim(p_coupon_code))
      and active = true
      and (expires_at is null or expires_at > now())
      and (max_uses is null or uses_count < max_uses)
    limit 1;

    if v_coupon.id is not null then
      v_eligible := public.coupon_eligible_subtotal(v_coupon.id, p_items);
      v_coupon_ok := not (
        exists (select 1 from coupon_products where coupon_id = v_coupon.id)
        and v_eligible <= 0
      );
    end if;

    if v_coupon_ok then
      if v_coupon.type = 'percent' then
        v_discount := round(v_eligible * v_coupon.value / 100, 2);
      elsif v_coupon.type = 'fixed' then
        v_discount := least(v_coupon.value, v_eligible);
      elsif v_coupon.type = 'free_shipping' then
        v_shipping := 0;
      elsif v_coupon.type = 'bundle' then
        v_discount := public.coupon_bundle_discount(v_coupon.id, p_items);
        -- kit sem grupo completo no carrinho: não conta como uso
        v_coupon_ok := v_discount > 0;
      end if;

      if v_coupon_ok then
        update coupons set uses_count = uses_count + 1 where id = v_coupon.id;
      end if;
    end if;
  end if;

  v_total := v_subtotal - v_discount + v_shipping;

  insert into customers (name, email, phone)
  values (p_name, p_email, p_phone)
  on conflict (email) do update
    set name = excluded.name, phone = excluded.phone
  returning id into v_customer_id;

  insert into orders (
    customer_id, total, shipping_fee, coupon_code, discount_amount,
    shipping_address, payment_method, status,
    shipping_quote_id, shipping_service, shipping_days, shipping_eta
  )
  values (
    v_customer_id, v_total, v_shipping,
    case when v_coupon_ok then upper(trim(p_coupon_code)) else null end,
    v_discount, p_address, p_payment_method, 'aguardando pagamento',
    v_quote.id,
    case when v_quote.source = 'gubo' then v_quote.service_name else 'Frete fixo' end,
    v_quote.days, v_quote.eta
  )
  returning id into v_order_id;

  insert into order_items (
    order_id, product_variant_id, product_name, model_label, size, color, unit_price, qty
  )
  select
    v_order_id,
    pv.id,
    p.name,
    pv.model_label,
    pv.size,
    pv.color,
    pv.price,
    (item->>'qty')::integer
  from jsonb_array_elements(p_items) as item
  join product_variants pv on pv.id = nullif(item->>'product_variant_id', '')::uuid
  join products p on p.id = pv.product_id;

  return v_order_id;
end;
$$;

grant execute on function public.create_customer_order to anon, authenticated;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- add_tiered_coupon_e_cpf.sql
-- ---------------------------------------------------------------------
-- MIGRAÇÃO v13: cupom PROGRESSIVO + CPF no pedido + conserto da validade dos cupons.
-- Rode DEPOIS de add_kit_coupon.sql. Pode rodar mais de uma vez.
-- Rode ANTES de publicar o site v13 (o checkout novo manda o CPF pra cá).
--
-- Cupom progressivo (type = 'tiered'):
--   tiers = [{"min_qty":1,"percent":10},{"min_qty":2,"percent":15},{"min_qty":3,"percent":20}]
--   1. conta as UNIDADES elegíveis do carrinho (mesma regra de coupon_products:
--      nenhum produto marcado = todos)
--   2. pega a maior faixa em que essa quantidade se encaixa
--   3. aplica o % dessa faixa sobre o subtotal elegível (preço do cadastro)
--   Menos peças que a menor faixa = cupom não vale.

-- 1) Tipo novo + coluna das faixas
alter table coupons drop constraint if exists coupons_type_check;
alter table coupons add constraint coupons_type_check
  check (type in ('percent', 'fixed', 'free_shipping', 'bundle', 'tiered'));

alter table coupons add column if not exists tiers jsonb;

alter table coupons drop constraint if exists coupons_tiers_check;
alter table coupons add constraint coupons_tiers_check
  check (
    type <> 'tiered'
    or (tiers is not null and jsonb_typeof(tiers) = 'array' and jsonb_array_length(tiers) > 0)
  );

-- 2) Validade: cupons gravados com a data pura (meia-noite UTC = 21h do dia anterior
--    em Porto Alegre) passam a valer até 23h59 do dia escolhido.
--    Só mexe em quem está exatamente à meia-noite UTC, então rodar de novo não muda nada.
update coupons
set expires_at = ((expires_at at time zone 'UTC')::date + time '23:59:59') at time zone 'America/Sao_Paulo'
where expires_at is not null
  and (expires_at at time zone 'UTC')::time = time '00:00:00';

-- 3) Faixa do cupom progressivo para um carrinho
--    Devolve {qty, percent, next_min_qty, next_percent}; percent = null se não chegou na 1ª faixa.
create or replace function public.coupon_tier_info(p_coupon_id uuid, p_items jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with c as (
    select tiers from coupons where id = p_coupon_id
  ),
  q as (
    select coalesce(sum(greatest((item->>'qty')::integer, 0)), 0)::integer as qty
    from jsonb_array_elements(p_items) as item
    join product_variants pv on pv.id = nullif(item->>'product_variant_id', '')::uuid
    where not exists (select 1 from coupon_products cp where cp.coupon_id = p_coupon_id)
       or exists (
         select 1 from coupon_products cp
         where cp.coupon_id = p_coupon_id and cp.product_id = pv.product_id
       )
  ),
  t as (
    select (e->>'min_qty')::integer as min_qty, (e->>'percent')::numeric as percent
    from c, jsonb_array_elements(coalesce(c.tiers, '[]'::jsonb)) as e
  )
  select jsonb_build_object(
    'qty', q.qty,
    'percent', (select percent from t where min_qty <= q.qty order by min_qty desc limit 1),
    'next_min_qty', (select min_qty from t where min_qty > q.qty order by min_qty asc limit 1),
    'next_percent', (select percent from t where min_qty > q.qty order by min_qty asc limit 1)
  )
  from q;
$$;

-- 4) CPF: validação dos dígitos verificadores
create or replace function public.is_valid_cpf(p_cpf text)
returns boolean
language plpgsql
immutable
as $$
declare
  d text := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
  s integer;
  r integer;
  i integer;
begin
  if length(d) <> 11 or d ~ '^(\d)\1{10}$' then
    return false;
  end if;

  s := 0;
  for i in 1..9 loop
    s := s + substr(d, i, 1)::integer * (11 - i);
  end loop;
  r := (s * 10) % 11;
  if r = 10 then r := 0; end if;
  if r <> substr(d, 10, 1)::integer then
    return false;
  end if;

  s := 0;
  for i in 1..10 loop
    s := s + substr(d, i, 1)::integer * (12 - i);
  end loop;
  r := (s * 10) % 11;
  if r = 10 then r := 0; end if;
  return r = substr(d, 11, 1)::integer;
end;
$$;

alter table orders add column if not exists customer_cpf text;

-- 5) validate_coupon com o tipo progressivo
create or replace function public.validate_coupon(p_code text, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coupon coupons;
  v_restricted boolean;
  v_eligible numeric(10,2);
  v_discount numeric(10,2) := 0;
  v_tier jsonb := null;
begin
  select * into v_coupon from coupons
  where upper(code) = upper(trim(p_code))
  limit 1;

  if v_coupon.id is null then
    return jsonb_build_object('valid', false, 'message', 'Cupom não encontrado.');
  end if;
  if not v_coupon.active then
    return jsonb_build_object('valid', false, 'message', 'Cupom inativo.');
  end if;
  if v_coupon.expires_at is not null and v_coupon.expires_at < now() then
    return jsonb_build_object('valid', false, 'message', 'Cupom expirado.');
  end if;
  if v_coupon.max_uses is not null and v_coupon.uses_count >= v_coupon.max_uses then
    return jsonb_build_object('valid', false, 'message', 'Cupom esgotado.');
  end if;

  select exists (select 1 from coupon_products where coupon_id = v_coupon.id) into v_restricted;
  v_eligible := public.coupon_eligible_subtotal(v_coupon.id, p_items);

  if v_restricted and v_eligible <= 0 then
    return jsonb_build_object('valid', false, 'message', 'Esse cupom não vale para os itens do seu carrinho.');
  end if;

  if v_coupon.type = 'percent' then
    v_discount := round(v_eligible * v_coupon.value / 100, 2);
  elsif v_coupon.type = 'fixed' then
    v_discount := least(v_coupon.value, v_eligible);
  elsif v_coupon.type = 'bundle' then
    v_discount := public.coupon_bundle_discount(v_coupon.id, p_items);
    if v_discount <= 0 then
      return jsonb_build_object(
        'valid', false,
        'message', format('Esse cupom vale para %s peças no carrinho.', coalesce(v_coupon.bundle_qty, 2))
      );
    end if;
  elsif v_coupon.type = 'tiered' then
    v_tier := public.coupon_tier_info(v_coupon.id, p_items);
    if v_tier->>'percent' is null then
      return jsonb_build_object(
        'valid', false,
        'message', format('Esse cupom vale a partir de %s peças no carrinho.', v_tier->>'next_min_qty')
      );
    end if;
    v_discount := round(v_eligible * (v_tier->>'percent')::numeric / 100, 2);
  end if; -- free_shipping: sem desconto no subtotal

  return jsonb_build_object(
    'valid', true,
    'type', v_coupon.type,
    'value', v_coupon.value,
    'discount_amount', v_discount,
    'free_shipping', v_coupon.type = 'free_shipping',
    'restricted', v_restricted,
    'tier', v_tier,
    'message', null
  );
end;
$$;

grant execute on function public.validate_coupon to anon, authenticated;

-- 6) create_customer_order: igual ao de add_kit_coupon.sql + progressivo + CPF.
--    Remove a versão antiga (sem p_cpf) pra não ficarem duas funções com o mesmo nome.
drop function if exists public.create_customer_order(text, text, text, jsonb, jsonb, numeric, text, text, uuid);

create or replace function public.create_customer_order(
  p_name text,
  p_email text,
  p_phone text,
  p_address jsonb,
  p_items jsonb,
  p_shipping_fee numeric,
  p_coupon_code text,
  p_payment_method text,
  p_shipping_quote_id uuid default null,
  p_cpf text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_order_id uuid;
  v_subtotal numeric(10,2) := 0;
  v_items_count integer;
  v_valid_count integer;
  v_coupon coupons;
  v_coupon_ok boolean := false;
  v_eligible numeric(10,2) := 0;
  v_discount numeric(10,2) := 0;
  v_tier jsonb;
  v_quote shipping_quotes;
  v_shipping numeric(10,2) := 25.00;  -- frete fixo de reserva
  v_total numeric(10,2);
  v_cpf text := nullif(regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g'), '');
begin
  -- CPF: o checkout novo sempre manda. Se vier, precisa ser válido.
  if v_cpf is not null and not public.is_valid_cpf(v_cpf) then
    raise exception 'CPF inválido. Confira os números e tente de novo.';
  end if;

  select count(*) into v_items_count from jsonb_array_elements(p_items);

  select count(*), coalesce(sum(pv.price * (item->>'qty')::integer), 0)
  into v_valid_count, v_subtotal
  from jsonb_array_elements(p_items) as item
  join product_variants pv on pv.id = nullif(item->>'product_variant_id', '')::uuid
  where (item->>'qty')::integer > 0;

  if v_items_count = 0 or v_valid_count <> v_items_count then
    raise exception 'Um item do carrinho não está mais disponível. Remova e adicione de novo.';
  end if;

  if p_shipping_quote_id is not null then
    select * into v_quote from shipping_quotes where id = p_shipping_quote_id;

    if v_quote.id is null or v_quote.expires_at < now() then
      raise exception 'O cálculo do frete expirou. Confira o CEP e tente de novo.';
    end if;

    if v_quote.cep <> regexp_replace(coalesce(p_address->>'cep', ''), '\D', '', 'g')
       or v_quote.items <> public.shipping_items_key(p_items) then
      raise exception 'O frete não confere com o carrinho. Confira o CEP e tente de novo.';
    end if;

    v_shipping := v_quote.price;
  end if;

  if p_coupon_code is not null and length(trim(p_coupon_code)) > 0 then
    select * into v_coupon from coupons
    where upper(code) = upper(trim(p_coupon_code))
      and active = true
      and (expires_at is null or expires_at > now())
      and (max_uses is null or uses_count < max_uses)
    limit 1;

    if v_coupon.id is not null then
      v_eligible := public.coupon_eligible_subtotal(v_coupon.id, p_items);
      v_coupon_ok := not (
        exists (select 1 from coupon_products where coupon_id = v_coupon.id)
        and v_eligible <= 0
      );
    end if;

    if v_coupon_ok then
      if v_coupon.type = 'percent' then
        v_discount := round(v_eligible * v_coupon.value / 100, 2);
      elsif v_coupon.type = 'fixed' then
        v_discount := least(v_coupon.value, v_eligible);
      elsif v_coupon.type = 'free_shipping' then
        v_shipping := 0;
      elsif v_coupon.type = 'bundle' then
        v_discount := public.coupon_bundle_discount(v_coupon.id, p_items);
        -- kit sem grupo completo no carrinho: não conta como uso
        v_coupon_ok := v_discount > 0;
      elsif v_coupon.type = 'tiered' then
        v_tier := public.coupon_tier_info(v_coupon.id, p_items);
        if v_tier->>'percent' is null then
          -- não chegou na primeira faixa: não conta como uso
          v_coupon_ok := false;
        else
          v_discount := round(v_eligible * (v_tier->>'percent')::numeric / 100, 2);
        end if;
      end if;

      if v_coupon_ok then
        update coupons set uses_count = uses_count + 1 where id = v_coupon.id;
      end if;
    end if;
  end if;

  v_total := v_subtotal - v_discount + v_shipping;

  insert into customers (name, email, phone)
  values (p_name, p_email, p_phone)
  on conflict (email) do update
    set name = excluded.name, phone = excluded.phone
  returning id into v_customer_id;

  insert into orders (
    customer_id, total, shipping_fee, coupon_code, discount_amount,
    shipping_address, payment_method, status,
    shipping_quote_id, shipping_service, shipping_days, shipping_eta,
    customer_cpf
  )
  values (
    v_customer_id, v_total, v_shipping,
    case when v_coupon_ok then upper(trim(p_coupon_code)) else null end,
    v_discount, p_address, p_payment_method, 'aguardando pagamento',
    v_quote.id,
    case when v_quote.source = 'gubo' then v_quote.service_name else 'Frete fixo' end,
    v_quote.days, v_quote.eta,
    v_cpf
  )
  returning id into v_order_id;

  insert into order_items (
    order_id, product_variant_id, product_name, model_label, size, color, unit_price, qty
  )
  select
    v_order_id,
    pv.id,
    p.name,
    pv.model_label,
    pv.size,
    pv.color,
    pv.price,
    (item->>'qty')::integer
  from jsonb_array_elements(p_items) as item
  join product_variants pv on pv.id = nullif(item->>'product_variant_id', '')::uuid
  join products p on p.id = pv.product_id;

  return v_order_id;
end;
$$;

grant execute on function public.create_customer_order to anon, authenticated;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- add_custos_e_crew.sql
-- ---------------------------------------------------------------------
-- Custo por modelo, lucro e repasse da crew (Admin > Relatório)
-- Idempotente: pode rodar mais de uma vez no SQL Editor do Supabase.

-- 1) Custo de cada modelo de cada produto -----------------------------------
-- Fica numa tabela separada (e não em product_variants) porque as variantes
-- são públicas pra loja funcionar; o custo só o admin logado enxerga.
create table if not exists product_costs (
  product_id uuid not null references products(id) on delete cascade,
  model_label text not null,
  cost numeric(10,2) not null default 0,       -- custo da peça (P até GG)
  cost_big numeric(10,2),                      -- custo no XG/XGG (vazio = igual ao normal)
  updated_at timestamptz not null default now(),
  primary key (product_id, model_label)
);

alter table product_costs enable row level security;

drop policy if exists "admin autenticado le custos" on product_costs;
create policy "admin autenticado le custos" on product_costs
  for select using (auth.role() = 'authenticated');
drop policy if exists "admin autenticado cria custos" on product_costs;
create policy "admin autenticado cria custos" on product_costs
  for insert with check (auth.role() = 'authenticated');
drop policy if exists "admin autenticado edita custos" on product_costs;
create policy "admin autenticado edita custos" on product_costs
  for update using (auth.role() = 'authenticated');
drop policy if exists "admin autenticado apaga custos" on product_costs;
create policy "admin autenticado apaga custos" on product_costs
  for delete using (auth.role() = 'authenticated');

-- 2) Custo "congelado" em cada item vendido ----------------------------------
-- Guarda o custo do dia da venda; se a Gubo aumentar depois, o lucro das
-- vendas antigas não muda.
alter table order_items add column if not exists unit_cost numeric(10,2);

create or replace function set_order_item_cost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product_id uuid;
begin
  if new.unit_cost is not null or new.product_variant_id is null then
    return new;
  end if;

  select product_id into v_product_id from product_variants where id = new.product_variant_id;
  if v_product_id is null then
    return new;
  end if;

  select case
           when upper(new.size) in ('XG', 'XGG', 'XXG', 'EXG', 'G1', 'G2', 'G3', 'G4')
                and pc.cost_big is not null then pc.cost_big
           else pc.cost
         end
    into new.unit_cost
    from product_costs pc
   where pc.product_id = v_product_id
     and pc.model_label = new.model_label;

  return new;
end;
$$;

drop trigger if exists trg_order_item_cost on order_items;
create trigger trg_order_item_cost
  before insert on order_items
  for each row execute function set_order_item_cost();

-- 3) Cupom da crew: atleta e % de repasse ------------------------------------
alter table coupons add column if not exists athlete_name text;
alter table coupons add column if not exists commission_pct numeric(5,2) not null default 0;

-- Congela no pedido quem é o atleta e o % daquele dia (se o cupom for
-- editado ou apagado depois, o repasse do pedido antigo não muda).
alter table orders add column if not exists crew_athlete text;
alter table orders add column if not exists crew_commission_pct numeric(5,2);

create or replace function set_order_crew()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.coupon_code is not null and new.crew_athlete is null then
    select c.athlete_name, c.commission_pct
      into new.crew_athlete, new.crew_commission_pct
      from coupons c
     where upper(c.code) = upper(new.coupon_code)
       and coalesce(c.athlete_name, '') <> ''
     limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_order_crew on orders;
create trigger trg_order_crew
  before insert on orders
  for each row execute function set_order_crew();

-- 4) Configurações só do admin (taxas do Mercado Pago) -----------------------
-- store_settings é pública (avisos da loja); isto aqui não.
create table if not exists admin_settings (
  key text primary key,
  value text not null default ''
);

alter table admin_settings enable row level security;

drop policy if exists "admin autenticado le config" on admin_settings;
create policy "admin autenticado le config" on admin_settings
  for select using (auth.role() = 'authenticated');
drop policy if exists "admin autenticado cria config" on admin_settings;
create policy "admin autenticado cria config" on admin_settings
  for insert with check (auth.role() = 'authenticated');
drop policy if exists "admin autenticado edita config" on admin_settings;
create policy "admin autenticado edita config" on admin_settings
  for update using (auth.role() = 'authenticated');

insert into admin_settings (key, value) values
  ('mp_fee_pix', '0.99'),
  ('mp_fee_card', '4.98')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- fix_seguranca_pedidos_e_cupons.sql
-- ---------------------------------------------------------------------
-- Segurança (19/11/2026) — pode rodar mais de uma vez.
-- Colar inteiro no SQL Editor do Supabase e clicar Run.
--
-- 1) Fecha a porta de "pedido falso": ninguém mais grava pedido/cliente/item
--    direto nas tabelas. O checkout continua igual (usa create_customer_order).
-- 2) Cupom com limite de usos passa a contar só quando o pagamento é aprovado
--    (antes, pedido aberto e não pago já gastava um uso).
-- 3) Funções auxiliares do banco deixam de ficar abertas para visitantes.

-- 1) Remove as permissões abertas de INSERT do schema inicial -----------------
drop policy if exists "checkout pode criar cliente" on customers;
drop policy if exists "checkout pode criar pedido" on orders;
drop policy if exists "checkout pode criar itens" on order_items;

-- 2a) create_customer_order: igual à versão atual, só sem somar uso do cupom --
create or replace function public.create_customer_order(
  p_name text,
  p_email text,
  p_phone text,
  p_address jsonb,
  p_items jsonb,
  p_shipping_fee numeric,
  p_coupon_code text,
  p_payment_method text,
  p_shipping_quote_id uuid default null,
  p_cpf text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_order_id uuid;
  v_subtotal numeric(10,2) := 0;
  v_items_count integer;
  v_valid_count integer;
  v_coupon coupons;
  v_coupon_ok boolean := false;
  v_eligible numeric(10,2) := 0;
  v_discount numeric(10,2) := 0;
  v_tier jsonb;
  v_quote shipping_quotes;
  v_shipping numeric(10,2) := 25.00;  -- frete fixo de reserva
  v_total numeric(10,2);
  v_cpf text := nullif(regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g'), '');
begin
  -- CPF: o checkout novo sempre manda. Se vier, precisa ser válido.
  if v_cpf is not null and not public.is_valid_cpf(v_cpf) then
    raise exception 'CPF inválido. Confira os números e tente de novo.';
  end if;

  select count(*) into v_items_count from jsonb_array_elements(p_items);

  select count(*), coalesce(sum(pv.price * (item->>'qty')::integer), 0)
  into v_valid_count, v_subtotal
  from jsonb_array_elements(p_items) as item
  join product_variants pv on pv.id = nullif(item->>'product_variant_id', '')::uuid
  where (item->>'qty')::integer > 0;

  if v_items_count = 0 or v_valid_count <> v_items_count then
    raise exception 'Um item do carrinho não está mais disponível. Remova e adicione de novo.';
  end if;

  if p_shipping_quote_id is not null then
    select * into v_quote from shipping_quotes where id = p_shipping_quote_id;

    if v_quote.id is null or v_quote.expires_at < now() then
      raise exception 'O cálculo do frete expirou. Confira o CEP e tente de novo.';
    end if;

    if v_quote.cep <> regexp_replace(coalesce(p_address->>'cep', ''), '\D', '', 'g')
       or v_quote.items <> public.shipping_items_key(p_items) then
      raise exception 'O frete não confere com o carrinho. Confira o CEP e tente de novo.';
    end if;

    v_shipping := v_quote.price;
  end if;

  if p_coupon_code is not null and length(trim(p_coupon_code)) > 0 then
    select * into v_coupon from coupons
    where upper(code) = upper(trim(p_coupon_code))
      and active = true
      and (expires_at is null or expires_at > now())
      and (max_uses is null or uses_count < max_uses)
    limit 1;

    if v_coupon.id is not null then
      v_eligible := public.coupon_eligible_subtotal(v_coupon.id, p_items);
      v_coupon_ok := not (
        exists (select 1 from coupon_products where coupon_id = v_coupon.id)
        and v_eligible <= 0
      );
    end if;

    if v_coupon_ok then
      if v_coupon.type = 'percent' then
        v_discount := round(v_eligible * v_coupon.value / 100, 2);
      elsif v_coupon.type = 'fixed' then
        v_discount := least(v_coupon.value, v_eligible);
      elsif v_coupon.type = 'free_shipping' then
        v_shipping := 0;
      elsif v_coupon.type = 'bundle' then
        v_discount := public.coupon_bundle_discount(v_coupon.id, p_items);
        -- kit sem grupo completo no carrinho: não conta como uso
        v_coupon_ok := v_discount > 0;
      elsif v_coupon.type = 'tiered' then
        v_tier := public.coupon_tier_info(v_coupon.id, p_items);
        if v_tier->>'percent' is null then
          -- não chegou na primeira faixa: não conta como uso
          v_coupon_ok := false;
        else
          v_discount := round(v_eligible * (v_tier->>'percent')::numeric / 100, 2);
        end if;
      end if;

    end if;
  end if;

  v_total := v_subtotal - v_discount + v_shipping;

  insert into customers (name, email, phone)
  values (p_name, p_email, p_phone)
  on conflict (email) do update
    set name = excluded.name, phone = excluded.phone
  returning id into v_customer_id;

  insert into orders (
    customer_id, total, shipping_fee, coupon_code, discount_amount,
    shipping_address, payment_method, status,
    shipping_quote_id, shipping_service, shipping_days, shipping_eta,
    customer_cpf
  )
  values (
    v_customer_id, v_total, v_shipping,
    case when v_coupon_ok then upper(trim(p_coupon_code)) else null end,
    v_discount, p_address, p_payment_method, 'aguardando pagamento',
    v_quote.id,
    case when v_quote.source = 'gubo' then v_quote.service_name else 'Frete fixo' end,
    v_quote.days, v_quote.eta,
    v_cpf
  )
  returning id into v_order_id;

  insert into order_items (
    order_id, product_variant_id, product_name, model_label, size, color, unit_price, qty
  )
  select
    v_order_id,
    pv.id,
    p.name,
    pv.model_label,
    pv.size,
    pv.color,
    pv.price,
    (item->>'qty')::integer
  from jsonb_array_elements(p_items) as item
  join product_variants pv on pv.id = nullif(item->>'product_variant_id', '')::uuid
  join products p on p.id = pv.product_id;

  return v_order_id;
end;
$$;

grant execute on function public.create_customer_order to anon, authenticated;

-- 2b) Soma o uso do cupom quando o Mercado Pago aprova o pagamento ------------
create or replace function public.count_coupon_use_on_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.coupon_code is not null
     and new.payment_status = 'approved'
     and old.payment_status is distinct from 'approved' then
    update coupons set uses_count = uses_count + 1
    where upper(code) = upper(new.coupon_code);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_coupon_use_on_payment on orders;
create trigger trg_coupon_use_on_payment
  after update of payment_status on orders
  for each row execute function public.count_coupon_use_on_payment();

-- 3) Funções internas: só o próprio banco usa (não ficam abertas na API) -----
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as fn
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'coupon_eligible_subtotal', 'coupon_bundle_discount', 'coupon_tier_info',
        'shipping_items_key', 'is_valid_cpf', 'ss_today', 'ss_clean_size',
        'set_order_item_cost', 'set_order_crew', 'count_coupon_use_on_payment'
      )
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.fn);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- add_cancelamento_e_emails.sql
-- ---------------------------------------------------------------------
-- Cancelar / expirar pedido, resgate do carrinho e e-mails automáticos (21/11/2026)
-- Pode rodar mais de uma vez. Colar inteiro no SQL Editor do Supabase e clicar Run.
--
-- 1) Pedido ganha data e motivo do cancelamento e o aviso "pago depois de
--    expirar/cancelar". Status novos: 'cancelado' e 'expirado'.
-- 2) Cupom: o uso conta quando o pagamento é aprovado (como já era) e é
--    devolvido quando um pedido pago é cancelado.
-- 3) get_rescue_cart: o link do e-mail de resgate remonta o carrinho de um
--    pedido expirado (só peças, nada de dado pessoal; preço sempre o atual).
-- 4) order_emails: histórico dos e-mails automáticos de cada pedido.
-- 5) admin_settings (se ainda não existir) com o cupom opcional do resgate.

-- 1) Colunas novas no pedido --------------------------------------------------
alter table orders add column if not exists cancelled_at timestamptz;
alter table orders add column if not exists cancel_reason text;
alter table orders add column if not exists late_payment boolean not null default false;
alter table orders add column if not exists coupon_counted boolean not null default false;

-- 2) Cupom: soma ao aprovar, devolve ao cancelar -------------------------------
-- Troca o gatilho antigo (só somava) por um que sabe se o uso já foi contado.
drop trigger if exists trg_coupon_use_on_payment on orders;
drop trigger if exists trg_coupon_use_sync on orders;

-- Pedidos pagos de antes desta versão: o uso do cupom já foi contado.
-- (roda antes de criar o gatilho novo, pra não somar de novo)
update orders set coupon_counted = true
where coupon_code is not null
  and payment_status = 'approved'
  and status not in ('cancelado', 'expirado')
  and coupon_counted = false;

create or replace function public.coupon_use_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.coupon_code is null then
    return new;
  end if;

  -- pagamento aprovado e pedido valendo: conta 1 uso
  if new.payment_status = 'approved'
     and not new.coupon_counted
     and new.status not in ('cancelado', 'expirado') then
    update coupons set uses_count = uses_count + 1
    where upper(code) = upper(new.coupon_code);
    new.coupon_counted := true;
  end if;

  -- pedido cancelado/expirado que tinha contado uso: devolve
  if new.status in ('cancelado', 'expirado') and new.coupon_counted then
    update coupons set uses_count = greatest(uses_count - 1, 0)
    where upper(code) = upper(new.coupon_code);
    new.coupon_counted := false;
  end if;

  return new;
end;
$$;

create trigger trg_coupon_use_sync
  before update of payment_status, status on orders
  for each row execute function public.coupon_use_sync();

-- 3) Carrinho de resgate -------------------------------------------------------
create or replace function public.get_rescue_cart(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'variant_id', pv.id,
      'product_slug', p.slug,
      'product_name', coalesce(p.name, oi.product_name),
      'model_label', oi.model_label,
      'color', oi.color,
      'size', oi.size,
      'qty', oi.qty,
      'old_price', oi.unit_price,
      'price', pv.price,
      'available', coalesce(pv.active, false) and coalesce(p.active, false)
    ) order by oi.id), '[]'::jsonb)
  )
  from orders o
  join order_items oi on oi.order_id = o.id
  left join product_variants pv on pv.id = oi.product_variant_id
  left join products p on p.id = pv.product_id
  where o.id = p_order_id
    and o.status = 'expirado'
  group by o.id;
$$;

revoke execute on function public.get_rescue_cart(uuid) from public;
grant execute on function public.get_rescue_cart(uuid) to anon, authenticated;

-- 4) Histórico de e-mails ------------------------------------------------------
create table if not exists order_emails (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  kind text not null,              -- recebido | producao | enviado | entregue | cancelado | resgate
  auto boolean not null default true,
  to_email text,
  status text not null default 'sending',  -- sending | sent | failed
  error text,
  provider_id text,
  created_at timestamptz not null default now()
);

create index if not exists order_emails_order_idx on order_emails (order_id);

-- cada e-mail automático sai uma vez só por pedido (o "reenviar" do admin é auto = false)
create unique index if not exists order_emails_auto_once
  on order_emails (order_id, kind) where auto;

alter table order_emails enable row level security;

-- o admin só lê; quem grava são as funções da Netlify (chave de serviço)
drop policy if exists "admin autenticado le emails" on order_emails;
create policy "admin autenticado le emails" on order_emails
  for select using (auth.role() = 'authenticated');

-- 5) Configurações do admin (cupom do e-mail de resgate) -----------------------
create table if not exists admin_settings (
  key text primary key,
  value text not null default ''
);

alter table admin_settings enable row level security;

drop policy if exists "admin autenticado le config" on admin_settings;
create policy "admin autenticado le config" on admin_settings
  for select using (auth.role() = 'authenticated');
drop policy if exists "admin autenticado cria config" on admin_settings;
create policy "admin autenticado cria config" on admin_settings
  for insert with check (auth.role() = 'authenticated');
drop policy if exists "admin autenticado edita config" on admin_settings;
create policy "admin autenticado edita config" on admin_settings
  for update using (auth.role() = 'authenticated');

insert into admin_settings (key, value) values ('rescue_coupon', '')
on conflict (key) do nothing;

-- Funções internas: só o próprio banco usa ------------------------------------
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as fn
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('coupon_use_sync', 'count_coupon_use_on_payment')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.fn);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- add_ref_crew.sql
-- ---------------------------------------------------------------------
-- v18: rastreio de vendas da Edge Crew por link (?ref=pablo etc.)
-- Guarda no pedido o ref do link do atleta, pra aparecer no admin
-- (Pedidos e Relatório). Pode rodar mais de uma vez.

alter table public.orders add column if not exists ref text;

-- só aceita nome simples (minúsculo, sem espaço) ou vazio
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_ref_format') then
    alter table public.orders
      add constraint orders_ref_format check (ref is null or ref ~ '^[a-z0-9_-]{1,40}$');
  end if;
end $$;

create index if not exists orders_ref_idx on public.orders (ref) where ref is not null;

-- ---------------------------------------------------------------------
-- add_amigo_ideias_presente.sql
-- ---------------------------------------------------------------------
-- Amigo secreto: campo livre "Outras ideias de presente" (v19)
-- Pode rodar mais de uma vez. Cole tudo no SQL Editor do Supabase e clique em Run.
-- Só quem tirar a pessoa vê o texto (o responsável vê só se a pessoa preencheu).

alter table ss_participants add column if not exists gift_ideas text;

-- salva as ideias da própria pessoa (até 500 letras; vazio apaga)
create or replace function public.ss_set_gift_ideas(p_token text, p_text text) returns void
language plpgsql security definer set search_path = public as $$
declare me ss_participants := ss_me(p_token);
begin
  if char_length(trim(coalesce(p_text, ''))) > 500 then
    raise exception 'As ideias de presente podem ter até 500 letras.';
  end if;
  update ss_participants
  set gift_ideas = nullif(trim(coalesce(p_text, '')), '')
  where id = me.id;
end $$;

-- página secreta: igual à anterior, agora com gift_ideas (minha, de quem eu tirei)
-- e has_ideas na lista do responsável
create or replace function public.ss_my_page(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me ss_participants;
  g ss_groups;
  v_target ss_participants;
  v_giver_id uuid;
  v_reveal boolean;
  v_result jsonb;
begin
  me := ss_me(p_token);
  perform ss_maybe_auto_draw(me.group_id);
  select * into me from ss_participants where id = me.id;
  select * into g from ss_groups where id = me.group_id;
  v_reveal := g.drawn_at is not null and g.reveal_after_exchange
              and g.exchange_date is not null and ss_today() > g.exchange_date;

  v_result := jsonb_build_object(
    'me', jsonb_build_object('name', me.name, 'tee_size', me.tee_size, 'hoodie_size', me.hoodie_size,
                             'status', me.status, 'is_organizer', me.is_organizer,
                             'link_reset_at', me.link_reset_at, 'gift_ideas', me.gift_ideas),
    'group', jsonb_build_object('name', g.name, 'join_code', g.join_code, 'draw_mode', g.draw_mode,
                                'draw_date', g.draw_date, 'exchange_date', g.exchange_date,
                                'min_value', g.min_value, 'max_value', g.max_value,
                                'require_approval', g.require_approval,
                                'reveal_after_exchange', g.reveal_after_exchange,
                                'drawn', g.drawn_at is not null),
    'my_wishlist', ss_wishlist_json(me.id)
  );

  if g.drawn_at is not null and me.assigned_to is not null then
    select * into v_target from ss_participants where id = me.assigned_to;
    v_result := v_result || jsonb_build_object(
      'target', jsonb_build_object('name', v_target.name, 'tee_size', v_target.tee_size,
                                   'hoodie_size', v_target.hoodie_size,
                                   'gift_ideas', v_target.gift_ideas,
                                   'wishlist', ss_wishlist_json(v_target.id)),
      -- conversa com quem eu tirei
      'chat_target', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', m.id, 'mine', m.from_giver, 'body', m.body, 'created_at', m.created_at
        ) order by m.created_at), '[]'::jsonb)
        from ss_messages m where m.giver_id = me.id and not m.hidden)
    );
  end if;

  if g.drawn_at is not null then
    select id into v_giver_id from ss_participants where assigned_to = me.id limit 1;
    v_result := v_result || jsonb_build_object(
      -- conversa com quem me tirou (sem dizer quem é)
      'chat_giver', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', m.id, 'mine', not m.from_giver, 'body', m.body, 'reported', m.reported,
          'created_at', m.created_at
        ) order by m.created_at), '[]'::jsonb)
        from ss_messages m where m.giver_id = v_giver_id and not m.hidden)
    );
  end if;

  if v_reveal then
    v_result := v_result || jsonb_build_object('reveal', (
      select coalesce(jsonb_agg(jsonb_build_object('giver', a.name, 'receiver', b.name) order by a.name), '[]'::jsonb)
      from ss_participants a join ss_participants b on b.id = a.assigned_to
      where a.group_id = g.id));
  end if;

  if me.is_organizer then
    v_result := v_result || jsonb_build_object(
      'participants', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', p.id, 'name', p.name, 'status', p.status, 'is_organizer', p.is_organizer,
          'tee_size', p.tee_size, 'hoodie_size', p.hoodie_size,
          'has_wishlist', exists (select 1 from ss_wishlist w where w.participant_id = p.id),
          'has_ideas', nullif(trim(coalesce(p.gift_ideas, '')), '') is not null
        ) order by p.created_at), '[]'::jsonb)
        from ss_participants p where p.group_id = g.id),
      'reported', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'body', m.body)
          order by m.created_at), '[]'::jsonb)
        from ss_messages m join ss_participants p on p.id = m.giver_id
        where p.group_id = g.id and m.reported and not m.hidden)
    );
  end if;

  return v_result;
end $$;

grant execute on function public.ss_set_gift_ideas(text, text) to anon, authenticated;
grant execute on function public.ss_my_page(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- add_amigo_leads_cupom_avisos.sql
-- ---------------------------------------------------------------------
-- Amigo secreto: e-mail + aceite de novidades, WhatsApp do responsável,
-- cupom de 5% por grupo e rotina automática (sorteio + avisos por e-mail). v20, 24/11/2026
-- Pode rodar mais de uma vez. Cole tudo no SQL Editor do Supabase e clique em Run.
-- Precisa do add_amigo_ideias_presente.sql (v19) já rodado.

-- 1) Colunas novas ------------------------------------------------------------
alter table ss_participants add column if not exists email text;
alter table ss_participants add column if not exists marketing_optin boolean not null default false;
alter table ss_participants add column if not exists optin_at timestamptz;
alter table ss_participants add column if not exists last_seen_at timestamptz;
alter table ss_participants add column if not exists draw_email_at timestamptz;
alter table ss_participants add column if not exists msg_email_at timestamptz;

alter table ss_groups add column if not exists organizer_phone text;
alter table ss_groups add column if not exists warn_email_at timestamptz;

-- cupom que pertence a um grupo do amigo secreto (some junto se o grupo for apagado)
alter table coupons add column if not exists ss_group_id uuid references ss_groups(id) on delete cascade;
create index if not exists coupons_ss_group_idx on coupons(ss_group_id);

-- histórico dos e-mails do amigo secreto (pra respeitar o limite diário do Resend)
create table if not exists ss_email_log (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid references ss_participants(id) on delete set null,
  kind text not null,             -- sorteio | mensagens | aviso_responsavel
  to_email text,
  status text not null default 'sent',
  error text,
  created_at timestamptz not null default now()
);
create index if not exists ss_email_log_created_idx on ss_email_log(created_at);
alter table ss_email_log enable row level security;
drop policy if exists "admin autenticado le emails amigo" on ss_email_log;
create policy "admin autenticado le emails amigo" on ss_email_log
  for select using (auth.role() = 'authenticated');

-- 2) Contato da própria pessoa ---------------------------------------------------
-- p_phone: só vale pra quem organiza (null = não mexe no WhatsApp).
create or replace function public.ss_set_contact(p_token text, p_email text, p_optin boolean, p_phone text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  me ss_participants := ss_me(p_token);
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '');
begin
  if v_email is not null and (char_length(v_email) > 120 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'Confira o e-mail.';
  end if;
  if p_phone is not null and me.is_organizer then
    if v_phone ~ '^55[0-9]{10,11}$' then v_phone := substr(v_phone, 3); end if; -- tira o +55
    if v_phone is null or char_length(v_phone) not between 10 and 11 then
      raise exception 'Confira o WhatsApp (com DDD).';
    end if;
    update ss_groups set organizer_phone = v_phone where id = me.group_id;
  end if;
  update ss_participants
  set email = v_email,
      marketing_optin = coalesce(p_optin, false) and v_email is not null,
      optin_at = case
        when coalesce(p_optin, false) and v_email is not null then coalesce(optin_at, now())
        else null end
  where id = me.id;
end $$;

-- 3) Cupom do grupo: 5%, uso ilimitado ------------------------------------------
-- Vale até 23h59 do dia da troca. Sem data de troca: 30 dias depois do sorteio;
-- se nunca sortear, 60 dias depois da criação do grupo.
create or replace function public.ss_coupon_expiry(p_group_id uuid) returns timestamptz
language sql stable security definer set search_path = public as $$
  select (coalesce(g.exchange_date,
                   (g.drawn_at at time zone 'America/Sao_Paulo')::date + 30,
                   (coalesce(g.created_at, now()) at time zone 'America/Sao_Paulo')::date + 60)
          + time '23:59:59') at time zone 'America/Sao_Paulo'
  from ss_groups g where g.id = p_group_id
$$;

create or replace function public.ss_sync_group_coupon(p_group_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  select 'AMIGO' || join_code into v_code from ss_groups where id = p_group_id;
  if v_code is null then return; end if;
  insert into coupons (code, type, value, active, max_uses, expires_at, ss_group_id)
  values (v_code, 'percent', 5, true, null, ss_coupon_expiry(p_group_id), p_group_id)
  on conflict (code) do update set expires_at = excluded.expires_at
    where coupons.ss_group_id = excluded.ss_group_id;
end $$;

create or replace function public.ss_groups_coupon_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform ss_sync_group_coupon(new.id);
  return new;
end $$;

drop trigger if exists trg_ss_group_coupon on ss_groups;
create trigger trg_ss_group_coupon
  after insert or update of exchange_date, drawn_at on ss_groups
  for each row execute function public.ss_groups_coupon_trigger();

-- grupos que já existem ganham o cupom
do $$
declare r record;
begin
  for r in select id from ss_groups loop
    perform ss_sync_group_coupon(r.id);
  end loop;
end $$;

-- 4) Página secreta: + e-mail/aceite, WhatsApp (responsável), cupom do grupo ------
create or replace function public.ss_my_page(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me ss_participants;
  g ss_groups;
  v_target ss_participants;
  v_giver_id uuid;
  v_reveal boolean;
  v_result jsonb;
begin
  me := ss_me(p_token);
  perform ss_maybe_auto_draw(me.group_id);
  -- marca a visita (e-mail de "mensagens novas" só avisa o que chegou depois disso)
  update ss_participants set last_seen_at = now() where id = me.id returning * into me;
  select * into g from ss_groups where id = me.group_id;
  v_reveal := g.drawn_at is not null and g.reveal_after_exchange
              and g.exchange_date is not null and ss_today() > g.exchange_date;

  v_result := jsonb_build_object(
    'me', jsonb_build_object('name', me.name, 'tee_size', me.tee_size, 'hoodie_size', me.hoodie_size,
                             'status', me.status, 'is_organizer', me.is_organizer,
                             'link_reset_at', me.link_reset_at, 'gift_ideas', me.gift_ideas,
                             'email', me.email, 'marketing_optin', me.marketing_optin,
                             'phone', case when me.is_organizer then g.organizer_phone end),
    'group', jsonb_build_object('name', g.name, 'join_code', g.join_code, 'draw_mode', g.draw_mode,
                                'draw_date', g.draw_date, 'exchange_date', g.exchange_date,
                                'min_value', g.min_value, 'max_value', g.max_value,
                                'require_approval', g.require_approval,
                                'reveal_after_exchange', g.reveal_after_exchange,
                                'drawn', g.drawn_at is not null,
                                'coupon_code', (select c.code from coupons c
                                                where c.ss_group_id = g.id and c.active
                                                  and (c.expires_at is null or c.expires_at > now()) limit 1),
                                'coupon_expires_at', (select c.expires_at from coupons c
                                                      where c.ss_group_id = g.id limit 1)),
    'my_wishlist', ss_wishlist_json(me.id)
  );

  if g.drawn_at is not null and me.assigned_to is not null then
    select * into v_target from ss_participants where id = me.assigned_to;
    v_result := v_result || jsonb_build_object(
      'target', jsonb_build_object('name', v_target.name, 'tee_size', v_target.tee_size,
                                   'hoodie_size', v_target.hoodie_size,
                                   'gift_ideas', v_target.gift_ideas,
                                   'wishlist', ss_wishlist_json(v_target.id)),
      -- conversa com quem eu tirei
      'chat_target', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', m.id, 'mine', m.from_giver, 'body', m.body, 'created_at', m.created_at
        ) order by m.created_at), '[]'::jsonb)
        from ss_messages m where m.giver_id = me.id and not m.hidden)
    );
  end if;

  if g.drawn_at is not null then
    select id into v_giver_id from ss_participants where assigned_to = me.id limit 1;
    v_result := v_result || jsonb_build_object(
      -- conversa com quem me tirou (sem dizer quem é)
      'chat_giver', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', m.id, 'mine', not m.from_giver, 'body', m.body, 'reported', m.reported,
          'created_at', m.created_at
        ) order by m.created_at), '[]'::jsonb)
        from ss_messages m where m.giver_id = v_giver_id and not m.hidden)
    );
  end if;

  if v_reveal then
    v_result := v_result || jsonb_build_object('reveal', (
      select coalesce(jsonb_agg(jsonb_build_object('giver', a.name, 'receiver', b.name) order by a.name), '[]'::jsonb)
      from ss_participants a join ss_participants b on b.id = a.assigned_to
      where a.group_id = g.id));
  end if;

  if me.is_organizer then
    v_result := v_result || jsonb_build_object(
      'participants', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', p.id, 'name', p.name, 'status', p.status, 'is_organizer', p.is_organizer,
          'tee_size', p.tee_size, 'hoodie_size', p.hoodie_size,
          'has_wishlist', exists (select 1 from ss_wishlist w where w.participant_id = p.id),
          'has_ideas', nullif(trim(coalesce(p.gift_ideas, '')), '') is not null,
          'has_email', p.email is not null
        ) order by p.created_at), '[]'::jsonb)
        from ss_participants p where p.group_id = g.id),
      'reported', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'body', m.body)
          order by m.created_at), '[]'::jsonb)
        from ss_messages m join ss_participants p on p.id = m.giver_id
        where p.group_id = g.id and m.reported and not m.hidden)
    );
  end if;

  return v_result;
end $$;

-- 5) Rotina automática (Netlify, de hora em hora) --------------------------------
-- Faz os sorteios automáticos do dia e devolve quem precisa receber e-mail.
-- p_limit: quantos e-mails ainda cabem hoje.
create or replace function public.ss_cron_tick(p_limit integer default 40) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  g record;
  v_draw jsonb;
  v_msgs jsonb;
  v_warn jsonb;
  v_left integer := greatest(coalesce(p_limit, 0), 0);
begin
  -- sorteios automáticos vencidos (com pelo menos 3 aprovados)
  for g in
    select id from ss_groups
    where drawn_at is null and draw_mode = 'auto' and draw_date is not null and draw_date <= ss_today()
  loop
    begin
      perform ss_maybe_auto_draw(g.id);
    exception when others then
      null; -- um grupo com problema não trava os outros
    end;
  end loop;

  -- "O sorteio saiu" (sem dizer quem tirou)
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_draw from (
    select p.id, p.email, p.name, p.token, gr.name as group_name, gr.exchange_date,
           (select c.code from coupons c where c.ss_group_id = gr.id and c.active
              and (c.expires_at is null or c.expires_at > now()) limit 1) as coupon_code
    from ss_participants p join ss_groups gr on gr.id = p.group_id
    where gr.drawn_at is not null and gr.drawn_at > now() - interval '30 days'
      and p.status = 'approved' and p.email is not null and p.draw_email_at is null
      and p.assigned_to is not null
    order by gr.drawn_at
    limit v_left
  ) x;
  v_left := v_left - jsonb_array_length(v_draw);

  -- responsável: chegou o dia do sorteio e não tem 3 aprovados
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_warn from (
    select o.id, o.email, o.name, o.token, gr.id as group_id, gr.name as group_name,
           (select count(*) from ss_participants a where a.group_id = gr.id and a.status = 'approved') as approved,
           (select count(*) from ss_participants a where a.group_id = gr.id and a.status = 'pending') as pending
    from ss_groups gr join ss_participants o on o.group_id = gr.id and o.is_organizer
    where gr.drawn_at is null and gr.draw_mode = 'auto' and gr.draw_date <= ss_today()
      and gr.warn_email_at is null and o.email is not null
    limit v_left
  ) x;
  v_left := v_left - jsonb_array_length(v_warn);

  -- mensagens novas: no máximo 1 e-mail por dia por pessoa,
  -- só do que chegou depois da última visita e do último aviso
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_msgs from (
    select p.id, p.email, p.name, p.token, gr.name as group_name
    from ss_participants p join ss_groups gr on gr.id = p.group_id
    where gr.drawn_at is not null and p.email is not null
      and (p.msg_email_at is null or p.msg_email_at < now() - interval '24 hours')
      and exists (
        select 1 from ss_messages m
        where not m.hidden
          and m.created_at > coalesce(p.last_seen_at, '-infinity'::timestamptz)
          and m.created_at > coalesce(p.msg_email_at, '-infinity'::timestamptz)
          and m.created_at < now() - interval '10 minutes'  -- dá tempo de responder sem virar e-mail
          and ((not m.from_giver and m.giver_id = p.id)
               or (m.from_giver and m.giver_id in (select q.id from ss_participants q where q.assigned_to = p.id)))
      )
    limit v_left
  ) x;

  return jsonb_build_object('draw', v_draw, 'warn', v_warn, 'messages', v_msgs);
end $$;

-- marca o que foi enviado (ou que não precisa mais enviar)
create or replace function public.ss_cron_mark(p_kind text, p_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_kind = 'draw' then
    update ss_participants set draw_email_at = now() where id = any(p_ids);
  elsif p_kind = 'messages' then
    update ss_participants set msg_email_at = now() where id = any(p_ids);
  elsif p_kind = 'warn' then
    update ss_groups set warn_email_at = now() where id = any(p_ids);
  end if;
end $$;

-- 6) Permissões --------------------------------------------------------------------
revoke execute on function public.ss_coupon_expiry(uuid) from public, anon, authenticated;
revoke execute on function public.ss_sync_group_coupon(uuid) from public, anon, authenticated;
revoke execute on function public.ss_groups_coupon_trigger() from public, anon, authenticated;
revoke execute on function public.ss_cron_tick(integer) from public, anon, authenticated;
revoke execute on function public.ss_cron_mark(text, uuid[]) from public, anon, authenticated;
grant execute on function public.ss_cron_tick(integer) to service_role;
grant execute on function public.ss_cron_mark(text, uuid[]) to service_role;

grant execute on function public.ss_set_contact(text, text, boolean, text) to anon, authenticated;
grant execute on function public.ss_my_page(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- add_modos_pagamento_frete.sql
-- ---------------------------------------------------------------------
-- Modos de pagamento e frete + chaves secretas guardadas no servidor.
-- Pode rodar mais de uma vez.
--
-- store_settings (já existe, pública) ganha duas chaves:
--   payment_mode   'whatsapp' | 'mercadopago'
--   shipping_mode  'whatsapp' | 'auto'
-- Sem elas, a loja usa o padrão do cliente (clients/<cliente>/brand.js).
--
-- store_secrets guarda as chaves (ex: token do Mercado Pago). RLS ligado e
-- NENHUMA policy: o site (anon) e o admin logado não leem nem escrevem.
-- Só as Netlify Functions, com a service_role, acessam.

create table if not exists store_secrets (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table store_secrets enable row level security;

-- garante que nenhuma policy antiga abra a tabela
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'store_secrets' loop
    execute format('drop policy %I on store_secrets', p.policyname);
  end loop;
end $$;

revoke all on store_secrets from anon, authenticated;

-- =====================================================================
-- LIMPEZA: tira os dados de exemplo que as migrações antigas criavam
-- (produto e banner de teste da Edge e o catálogo da Gubo).
-- =====================================================================
delete from product_variants;
delete from products;
delete from banners;
delete from shipping_models;
