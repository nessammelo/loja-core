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
