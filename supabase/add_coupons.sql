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
