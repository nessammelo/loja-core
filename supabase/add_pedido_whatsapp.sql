-- Pedido pelo WhatsApp registrado no admin.
--
-- No modo "pagamento pelo WhatsApp", o checkout é o mesmo do Mercado Pago
-- (dados, endereço, cupom). No fim, em vez de ir pro Mercado Pago, o pedido é
-- gravado como "aguardando pagamento" com payment_method = 'whatsapp' e a
-- conversa abre com o número do pedido. A loja marca pago no admin.
-- Pode rodar mais de uma vez.

-- cliente sem e-mail (pedido lançado à mão, por exemplo) não trava
alter table customers alter column email drop not null;

-- versão anterior desta função (só nome e telefone), se tiver sido rodada
drop function if exists public.create_whatsapp_order(text, text, text, jsonb, text, uuid);

-- Usa a mesma create_customer_order do checkout (preços, cupom, CPF e frete
-- conferidos no servidor). Com p_combine_shipping, o frete fica "a combinar".
create or replace function public.create_whatsapp_order(
  p_name text,
  p_email text,
  p_phone text,
  p_cpf text,
  p_address jsonb,
  p_items jsonb,
  p_coupon_code text default null,
  p_shipping_quote_id uuid default null,
  p_combine_shipping boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
begin
  if length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) < 10 then
    raise exception 'Confira o telefone (com DDD).';
  end if;

  v_order_id := public.create_customer_order(
    p_name, p_email, p_phone, p_address, p_items, null, p_coupon_code, 'whatsapp',
    case when p_combine_shipping then null else p_shipping_quote_id end,
    p_cpf
  );

  if p_combine_shipping then
    update orders
    set total = total - shipping_fee,
        shipping_fee = 0,
        shipping_service = 'A combinar no WhatsApp',
        shipping_days = null,
        shipping_eta = null
    where id = v_order_id;
  end if;

  return v_order_id;
end;
$$;

revoke execute on function public.create_whatsapp_order(text, text, text, text, jsonb, jsonb, text, uuid, boolean) from public;
grant execute on function public.create_whatsapp_order(text, text, text, text, jsonb, jsonb, text, uuid, boolean) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
