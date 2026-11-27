-- EDGE ecommerce — schema inicial
-- Rodar no SQL Editor do Supabase (Project > SQL Editor > New query)

-- PRODUCTS -------------------------------------------------
create table products (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  collection text,              -- ex: 'road-to-vegas', null = linha padrão
  description text,
  base_price numeric(10,2) not null,
  image_url text,
  active boolean default true,
  created_at timestamptz default now()
);

-- PRODUCT VARIANTS (modelo + tamanho + cor) -----------------
create table product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade,
  model_label text not null,     -- ex: 'Padrão', 'Tech Modal', 'Feminina', 'Cropped'
  size text not null,            -- ex: 'P', 'M', 'G', 'GG'
  color text not null,           -- ex: 'Preta'
  sku text unique,
  active boolean default true
);

-- CUSTOMERS (cadastro implícito no checkout) ----------------
create table customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  created_at timestamptz default now(),
  unique(email)
);

-- ORDERS -----------------------------------------------------
create table orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id),
  status text not null default 'novo',  -- aguardando pagamento | novo | repassado | enviado | entregue
  total numeric(10,2) not null,
  shipping_address jsonb not null,      -- {cep, endereco, numero, cidade}
  payment_method text,                  -- 'pix' | 'cartao'
  payment_status text default 'pendente',
  created_at timestamptz default now()
);

-- ORDER ITEMS --------------------------------------------------
create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  product_variant_id uuid references product_variants(id),
  product_name text not null,   -- snapshot, pra manter histórico se o produto mudar depois
  model_label text not null,
  size text not null,
  color text not null,
  unit_price numeric(10,2) not null,
  qty integer not null default 1
);

-- ROW LEVEL SECURITY -------------------------------------------
-- Leitura pública de produtos/variantes (loja) e escrita liberada
-- pra chave anon por enquanto (sem login de admin ainda).
-- Quando o admin tiver autenticação própria, apertar essas políticas.

alter table products enable row level security;
alter table product_variants enable row level security;
alter table customers enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;

create policy "produtos visiveis pra todos" on products
  for select using (true);
create policy "variantes visiveis pra todos" on product_variants
  for select using (true);

create policy "checkout pode criar cliente" on customers
  for insert with check (true);
create policy "checkout pode criar pedido" on orders
  for insert with check (true);
create policy "checkout pode criar itens" on order_items
  for insert with check (true);

-- Admin (temporário, sem auth ainda): permite leitura/gestão geral
create policy "admin le tudo - clientes" on customers for select using (true);
create policy "admin le tudo - pedidos" on orders for select using (true);
create policy "admin atualiza pedidos" on orders for update using (true);
create policy "admin le tudo - itens" on order_items for select using (true);
create policy "admin gerencia produtos" on products for all using (true);
create policy "admin gerencia variantes" on product_variants for all using (true);

-- SEED: produto Road to Vegas ------------------------------------
insert into products (slug, name, collection, description, base_price, image_url)
values (
  'road-to-vegas',
  'Road to Vegas',
  'road-to-vegas',
  'Nem toda jornada começa no aeroporto. Ela começa no primeiro treino. Na primeira queda. Na decisão de voltar ao tatame no dia seguinte. A Road to Vegas nasceu para homenagear todos os atletas que sonham em cruzar o deserto rumo ao Mundial Master, sabendo que a verdadeira viagem começou muito antes de Las Vegas aparecer no horizonte. A arte retrata a estrada que conduz ao skyline da cidade, simbolizando cada treino, cada desafio e cada conquista até o grande palco do jiu-jítsu mundial. Integrada à composição, a faixa representa a evolução construída ao longo do caminho. Porque o destino inspira. Mas é o caminho que transforma.',
  99.90,
  null
);

-- variantes do Road to Vegas (todos os modelos, todos os tamanhos, só preta)
insert into product_variants (product_id, model_label, size, color, sku)
select p.id, m.model_label, s.size, 'Preta',
       'RTV-' || upper(left(m.model_label,3)) || '-' || s.size
from products p,
     (values ('Padrão'), ('Tech Modal'), ('Feminina'), ('Cropped')) as m(model_label),
     (values ('P'), ('M'), ('G'), ('GG')) as s(size)
where p.slug = 'road-to-vegas';
