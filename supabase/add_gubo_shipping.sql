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
