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
