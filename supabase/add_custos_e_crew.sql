-- Custo por modelo, lucro e repasse da crew (Admin > Relatório)
-- Idempotente: pode rodar mais de uma vez no SQL Editor do Supabase.

-- 1) Custo de cada modelo de cada produto -----------------------------------
-- Fica numa tabela separada (e não em product_variants) porque as variantes
-- são públicas pra loja funcionar; o custo só o admin logado enxerga.
create table if not exists product_costs (
  product_id uuid not null references products(id) on delete cascade,
  model_label text not null,
  cost numeric(10,2) not null default 0,       -- custo da peça (P até GG)
  cost_big numeric(10,2),                      -- custo no XG/XGG (vazio = igual ao normal)
  updated_at timestamptz not null default now(),
  primary key (product_id, model_label)
);

alter table product_costs enable row level security;

drop policy if exists "admin autenticado le custos" on product_costs;
create policy "admin autenticado le custos" on product_costs
  for select using (auth.role() = 'authenticated');
drop policy if exists "admin autenticado cria custos" on product_costs;
create policy "admin autenticado cria custos" on product_costs
  for insert with check (auth.role() = 'authenticated');
drop policy if exists "admin autenticado edita custos" on product_costs;
create policy "admin autenticado edita custos" on product_costs
  for update using (auth.role() = 'authenticated');
drop policy if exists "admin autenticado apaga custos" on product_costs;
create policy "admin autenticado apaga custos" on product_costs
  for delete using (auth.role() = 'authenticated');

-- 2) Custo "congelado" em cada item vendido ----------------------------------
-- Guarda o custo do dia da venda; se a Gubo aumentar depois, o lucro das
-- vendas antigas não muda.
alter table order_items add column if not exists unit_cost numeric(10,2);

create or replace function set_order_item_cost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product_id uuid;
begin
  if new.unit_cost is not null or new.product_variant_id is null then
    return new;
  end if;

  select product_id into v_product_id from product_variants where id = new.product_variant_id;
  if v_product_id is null then
    return new;
  end if;

  select case
           when upper(new.size) in ('XG', 'XGG', 'XXG', 'EXG', 'G1', 'G2', 'G3', 'G4')
                and pc.cost_big is not null then pc.cost_big
           else pc.cost
         end
    into new.unit_cost
    from product_costs pc
   where pc.product_id = v_product_id
     and pc.model_label = new.model_label;

  return new;
end;
$$;

drop trigger if exists trg_order_item_cost on order_items;
create trigger trg_order_item_cost
  before insert on order_items
  for each row execute function set_order_item_cost();

-- 3) Cupom da crew: atleta e % de repasse ------------------------------------
alter table coupons add column if not exists athlete_name text;
alter table coupons add column if not exists commission_pct numeric(5,2) not null default 0;

-- Congela no pedido quem é o atleta e o % daquele dia (se o cupom for
-- editado ou apagado depois, o repasse do pedido antigo não muda).
alter table orders add column if not exists crew_athlete text;
alter table orders add column if not exists crew_commission_pct numeric(5,2);

create or replace function set_order_crew()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.coupon_code is not null and new.crew_athlete is null then
    select c.athlete_name, c.commission_pct
      into new.crew_athlete, new.crew_commission_pct
      from coupons c
     where upper(c.code) = upper(new.coupon_code)
       and coalesce(c.athlete_name, '') <> ''
     limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_order_crew on orders;
create trigger trg_order_crew
  before insert on orders
  for each row execute function set_order_crew();

-- 4) Configurações só do admin (taxas do Mercado Pago) -----------------------
-- store_settings é pública (avisos da loja); isto aqui não.
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

insert into admin_settings (key, value) values
  ('mp_fee_pix', '0.99'),
  ('mp_fee_card', '4.98')
on conflict (key) do nothing;
