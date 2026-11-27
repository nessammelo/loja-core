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
