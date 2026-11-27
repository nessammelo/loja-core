-- Pedido pelo WhatsApp registrado no admin.
--
-- No modo "pagamento pelo WhatsApp", o carrinho pede nome e WhatsApp (e-mail
-- opcional) e, ao clicar em "Finalizar pelo WhatsApp", grava o pedido como
-- "aguardando pagamento" com payment_method = 'whatsapp'. A loja marca pago
-- no admin depois de combinar na conversa. Pode rodar mais de uma vez.

-- cliente do WhatsApp pode não ter e-mail
alter table customers alter column email drop not null;

create or replace function public.create_whatsapp_order(
  p_name text,
  p_phone text,
  p_email text,
  p_items jsonb,
  p_cep text default null,
  p_shipping_quote_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := left(trim(coalesce(p_name, '')), 120);
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_email text := nullif(lower(left(trim(coalesce(p_email, '')), 200)), '');
  v_cep text := nullif(regexp_replace(coalesce(p_cep, ''), '\D', '', 'g'), '');
  v_customer_id uuid;
  v_order_id uuid;
  v_subtotal numeric(10,2) := 0;
  v_items_count integer;
  v_valid_count integer;
  v_quote shipping_quotes;
  v_shipping numeric(10,2) := 0;
  v_service text := 'A combinar no WhatsApp';
begin
  if length(v_name) < 2 then
    raise exception 'Informe seu nome.';
  end if;
  if length(v_phone) < 10 or length(v_phone) > 13 then
    raise exception 'Confira o número do WhatsApp (com DDD).';
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Confira o e-mail.';
  end if;

  select count(*) into v_items_count from jsonb_array_elements(p_items);

  select count(*), coalesce(sum(pv.price * (item->>'qty')::integer), 0)
  into v_valid_count, v_subtotal
  from jsonb_array_elements(p_items) as item
  join product_variants pv on pv.id = nullif(item->>'product_variant_id', '')::uuid
  where (item->>'qty')::integer between 1 and 50;

  if v_items_count = 0 or v_items_count > 50 or v_valid_count <> v_items_count then
    raise exception 'Um item do carrinho não está mais disponível. Remova e adicione de novo.';
  end if;

  -- frete calculado no site (modo automático): usa a cotação guardada no servidor
  if p_shipping_quote_id is not null then
    select * into v_quote from shipping_quotes where id = p_shipping_quote_id;
    if v_quote.id is not null and v_quote.expires_at >= now()
       and v_quote.cep = coalesce(v_cep, '')
       and v_quote.items = public.shipping_items_key(p_items) then
      v_shipping := v_quote.price;
      v_service := case when v_quote.source <> 'fixo' then coalesce(v_quote.service_name, 'Frete') else 'Frete fixo' end;
    else
      v_quote := null;
    end if;
  end if;

  if v_email is not null then
    insert into customers (name, email, phone)
    values (v_name, v_email, v_phone)
    on conflict (email) do update set name = excluded.name, phone = excluded.phone
    returning id into v_customer_id;
  else
    insert into customers (name, email, phone)
    values (v_name, null, v_phone)
    returning id into v_customer_id;
  end if;

  insert into orders (
    customer_id, total, shipping_fee, discount_amount,
    shipping_address, payment_method, status,
    shipping_quote_id, shipping_service, shipping_days, shipping_eta
  )
  values (
    v_customer_id, v_subtotal + v_shipping, v_shipping, 0,
    case when v_cep is null then '{}'::jsonb else jsonb_build_object('cep', v_cep) end,
    'whatsapp', 'aguardando pagamento',
    v_quote.id, v_service, v_quote.days, v_quote.eta
  )
  returning id into v_order_id;

  insert into order_items (
    order_id, product_variant_id, product_name, model_label, size, color, unit_price, qty
  )
  select v_order_id, pv.id, p.name, pv.model_label, pv.size, pv.color, pv.price, (item->>'qty')::integer
  from jsonb_array_elements(p_items) as item
  join product_variants pv on pv.id = nullif(item->>'product_variant_id', '')::uuid
  join products p on p.id = pv.product_id;

  return v_order_id;
end;
$$;

revoke execute on function public.create_whatsapp_order(text, text, text, jsonb, text, uuid) from public;
grant execute on function public.create_whatsapp_order(text, text, text, jsonb, text, uuid) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
