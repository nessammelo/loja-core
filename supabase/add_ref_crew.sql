-- v18: rastreio de vendas da Edge Crew por link (?ref=pablo etc.)
-- Guarda no pedido o ref do link do atleta, pra aparecer no admin
-- (Pedidos e Relatório). Pode rodar mais de uma vez.

alter table public.orders add column if not exists ref text;

-- só aceita nome simples (minúsculo, sem espaço) ou vazio
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_ref_format') then
    alter table public.orders
      add constraint orders_ref_format check (ref is null or ref ~ '^[a-z0-9_-]{1,40}$');
  end if;
end $$;

create index if not exists orders_ref_idx on public.orders (ref) where ref is not null;
