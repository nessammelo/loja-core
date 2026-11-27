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
