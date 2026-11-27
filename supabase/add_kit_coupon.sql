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
