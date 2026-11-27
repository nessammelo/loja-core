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
