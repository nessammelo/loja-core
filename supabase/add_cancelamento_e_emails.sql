-- Cancelar / expirar pedido, resgate do carrinho e e-mails automáticos (21/11/2026)
-- Pode rodar mais de uma vez. Colar inteiro no SQL Editor do Supabase e clicar Run.
--
-- 1) Pedido ganha data e motivo do cancelamento e o aviso "pago depois de
--    expirar/cancelar". Status novos: 'cancelado' e 'expirado'.
-- 2) Cupom: o uso conta quando o pagamento é aprovado (como já era) e é
--    devolvido quando um pedido pago é cancelado.
-- 3) get_rescue_cart: o link do e-mail de resgate remonta o carrinho de um
--    pedido expirado (só peças, nada de dado pessoal; preço sempre o atual).
-- 4) order_emails: histórico dos e-mails automáticos de cada pedido.
-- 5) admin_settings (se ainda não existir) com o cupom opcional do resgate.

-- 1) Colunas novas no pedido --------------------------------------------------
alter table orders add column if not exists cancelled_at timestamptz;
alter table orders add column if not exists cancel_reason text;
alter table orders add column if not exists late_payment boolean not null default false;
alter table orders add column if not exists coupon_counted boolean not null default false;

-- 2) Cupom: soma ao aprovar, devolve ao cancelar -------------------------------
-- Troca o gatilho antigo (só somava) por um que sabe se o uso já foi contado.
drop trigger if exists trg_coupon_use_on_payment on orders;
drop trigger if exists trg_coupon_use_sync on orders;

-- Pedidos pagos de antes desta versão: o uso do cupom já foi contado.
-- (roda antes de criar o gatilho novo, pra não somar de novo)
update orders set coupon_counted = true
where coupon_code is not null
  and payment_status = 'approved'
  and status not in ('cancelado', 'expirado')
  and coupon_counted = false;

create or replace function public.coupon_use_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.coupon_code is null then
    return new;
  end if;

  -- pagamento aprovado e pedido valendo: conta 1 uso
  if new.payment_status = 'approved'
     and not new.coupon_counted
     and new.status not in ('cancelado', 'expirado') then
    update coupons set uses_count = uses_count + 1
    where upper(code) = upper(new.coupon_code);
    new.coupon_counted := true;
  end if;

  -- pedido cancelado/expirado que tinha contado uso: devolve
  if new.status in ('cancelado', 'expirado') and new.coupon_counted then
    update coupons set uses_count = greatest(uses_count - 1, 0)
    where upper(code) = upper(new.coupon_code);
    new.coupon_counted := false;
  end if;

  return new;
end;
$$;

create trigger trg_coupon_use_sync
  before update of payment_status, status on orders
  for each row execute function public.coupon_use_sync();

-- 3) Carrinho de resgate -------------------------------------------------------
create or replace function public.get_rescue_cart(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'variant_id', pv.id,
      'product_slug', p.slug,
      'product_name', coalesce(p.name, oi.product_name),
      'model_label', oi.model_label,
      'color', oi.color,
      'size', oi.size,
      'qty', oi.qty,
      'old_price', oi.unit_price,
      'price', pv.price,
      'available', coalesce(pv.active, false) and coalesce(p.active, false)
    ) order by oi.id), '[]'::jsonb)
  )
  from orders o
  join order_items oi on oi.order_id = o.id
  left join product_variants pv on pv.id = oi.product_variant_id
  left join products p on p.id = pv.product_id
  where o.id = p_order_id
    and o.status = 'expirado'
  group by o.id;
$$;

revoke execute on function public.get_rescue_cart(uuid) from public;
grant execute on function public.get_rescue_cart(uuid) to anon, authenticated;

-- 4) Histórico de e-mails ------------------------------------------------------
create table if not exists order_emails (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  kind text not null,              -- recebido | producao | enviado | entregue | cancelado | resgate
  auto boolean not null default true,
  to_email text,
  status text not null default 'sending',  -- sending | sent | failed
  error text,
  provider_id text,
  created_at timestamptz not null default now()
);

create index if not exists order_emails_order_idx on order_emails (order_id);

-- cada e-mail automático sai uma vez só por pedido (o "reenviar" do admin é auto = false)
create unique index if not exists order_emails_auto_once
  on order_emails (order_id, kind) where auto;

alter table order_emails enable row level security;

-- o admin só lê; quem grava são as funções da Netlify (chave de serviço)
drop policy if exists "admin autenticado le emails" on order_emails;
create policy "admin autenticado le emails" on order_emails
  for select using (auth.role() = 'authenticated');

-- 5) Configurações do admin (cupom do e-mail de resgate) -----------------------
create table if not exists admin_settings (
  key text primary key,
  value text not null default ''
);

alter table admin_settings enable row level security;

drop policy if exists "admin autenticado le config" on admin_settings;
create policy "admin autenticado le config" on admin_settings
  for select using (auth.role() = 'authenticated');
drop policy if exists "admin autenticado cria config" on admin_settings;
create policy "admin autenticado cria config" on admin_settings
  for insert with check (auth.role() = 'authenticated');
drop policy if exists "admin autenticado edita config" on admin_settings;
create policy "admin autenticado edita config" on admin_settings
  for update using (auth.role() = 'authenticated');

insert into admin_settings (key, value) values ('rescue_coupon', '')
on conflict (key) do nothing;

-- Funções internas: só o próprio banco usa ------------------------------------
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as fn
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('coupon_use_sync', 'count_coupon_use_on_payment')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.fn);
  end loop;
end $$;

notify pgrst, 'reload schema';
