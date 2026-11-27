-- ATUALIZAÇÃO EM MASSA DO CATÁLOGO
-- Define de uma vez, para vários produtos: modelos, preço de cada modelo, tamanhos,
-- cores, especificações e qual tabela de medidas cada modelo usa.
-- Depois você só entra no admin para colocar as fotos.
--
-- COMO USAR
--  1. Rode antes o SQL add_model_pricing_and_color_photos.sql (uma vez só).
--  2. Preencha as 3 listas abaixo (A, B e C) e rode este arquivo inteiro.
--  3. Teste primeiro: troque a última linha "commit;" por "rollback;". O resultado
--     aparece na tela mas nada é gravado. Quando estiver certo, volte para "commit;".
--
-- O QUE ELE FAZ
--  - Mantém as variantes que já existem (os carrinhos e pedidos antigos continuam válidos).
--  - Cria as combinações novas (modelo x tamanho x cor) e atualiza o preço das existentes.
--  - Remove só as combinações que NÃO estão na lista A (dos produtos que estão nela).
--  - Produtos que não aparecem na lista A não são tocados.
--  - Não mexe em fotos.
--
-- ATENÇÃO: o "slug" é o que aparece no link do produto (/produto/SLUG).
--          Escreva os textos entre aspas simples e separe tamanhos e cores por vírgula.
--          Aspas simples dentro de um texto precisam ser duplicadas: d''água.

begin;

-- =====================================================================
-- LISTA A — MODELOS: uma linha por modelo de cada produto
--   (slug, modelo, preço, tamanhos, cores)
-- =====================================================================
create temp table _modelos on commit drop as
select * from (values
  ('exemplo-slug-1', 'Padrão',    119.90, 'P,M,G,GG,XG,XXG', 'Branca,Preta,Off White,Marrom,Verde Oliva'),
  ('exemplo-slug-1', 'Baby Look', 119.90, 'P,M,G,GG',        'Branca,Preta,Off White'),
  ('exemplo-slug-1', 'Cropped',   129.90, 'P,M,G,GG',        'Branca,Preta,Off White'),
  ('exemplo-slug-1', 'Oversized', 149.90, 'P,M,G,GG,XG',     'Branca,Preta,Off White,Marrom,Verde Oliva'),
  ('exemplo-slug-2', 'Moletom',   229.90, 'P,M,G,GG,XG',     'Preta,Off White')
) as t(slug, model_label, price, sizes, colors);

-- =====================================================================
-- LISTA B — ESPECIFICAÇÕES (opcional): uma linha por produto
--   Uma especificação por linha, no formato  Título: valor
--   Produto que não está aqui mantém as especificações que já tem.
--   Para apagar tudo deixe vazio: ''
-- =====================================================================
create temp table _specs on commit drop as
select * from (values
  ('exemplo-slug-1', E'Tecido: 100% algodão\nGramatura: 220 g/m²\nEstampa: Silk\nCuidados: Lavar do avesso')
) as t(slug, specs_text);

-- =====================================================================
-- LISTA C — TABELA DE MEDIDAS DE CADA MODELO (opcional)
--   (slug, modelo, nome da tabela). O nome precisa ser igual ao de uma tabela
--   criada no admin em "Medidas e avisos". Modelo que não está aqui mantém a que tem.
-- =====================================================================
create temp table _tabelas on commit drop as
select * from (values
  ('exemplo-slug-1', 'Padrão',    'Camiseta Padrão'),
  ('exemplo-slug-1', 'Oversized', 'Camiseta Oversized'),
  ('exemplo-slug-1', 'Cropped',   'Cropped')
) as t(slug, model_label, chart_name);


-- ---------------------------------------------------------------------
-- A PARTIR DAQUI NÃO PRECISA MEXER
-- ---------------------------------------------------------------------

-- 0) confere se todos os slugs existem
do $$
declare faltando text;
begin
  select string_agg(distinct x.slug, ', ') into faltando
  from (
    select slug from _modelos
    union select slug from _specs
    union select slug from _tabelas
  ) x
  where not exists (select 1 from products p where p.slug = x.slug);

  if faltando is not null then
    raise exception 'Produto(s) não encontrado(s) no banco: %. Confira o slug (o texto do link do produto).', faltando;
  end if;
end $$;

-- 1) todas as combinações desejadas (modelo x tamanho x cor)
create temp table _desejado on commit drop as
select
  p.id as product_id,
  p.slug,
  m.model_label,
  m.price::numeric(10,2) as price,
  btrim(s) as size,
  btrim(c) as color
from _modelos m
join products p on p.slug = m.slug
cross join lateral unnest(string_to_array(m.sizes, ',')) as s
cross join lateral unnest(string_to_array(m.colors, ',')) as c
where btrim(s) <> '' and btrim(c) <> '';

-- 2) tira o que não está mais na lista (só dos produtos da lista A)
delete from product_variants v
where v.product_id in (select distinct product_id from _desejado)
  and not exists (
    select 1 from _desejado d
    where d.product_id = v.product_id
      and d.model_label = v.model_label
      and d.size = v.size
      and d.color = v.color
  );

-- 3) atualiza o preço das que já existem
update product_variants v
set price = d.price
from _desejado d
where v.product_id = d.product_id
  and v.model_label = d.model_label
  and v.size = d.size
  and v.color = d.color
  and v.price is distinct from d.price;

-- 4) cria as que faltam
insert into product_variants (product_id, model_label, size, color, price, sku)
select
  d.product_id, d.model_label, d.size, d.color, d.price,
  upper(
    d.slug || '-' ||
    trim(both '-' from regexp_replace(translate(lower(d.model_label), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'), '[^a-z0-9]+', '-', 'g'))
    || '-' || d.size || '-' ||
    trim(both '-' from regexp_replace(translate(lower(d.color), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'), '[^a-z0-9]+', '-', 'g'))
  )
from _desejado d
where not exists (
  select 1 from product_variants v
  where v.product_id = d.product_id
    and v.model_label = d.model_label
    and v.size = d.size
    and v.color = d.color
);

-- 5) preço "a partir de" do produto = o menor preço entre os modelos
update products p
set base_price = x.menor
from (select product_id, min(price) as menor from _desejado group by product_id) x
where p.id = x.product_id;

-- 6) especificações
update products p
set specs = coalesce((
  select jsonb_agg(
    jsonb_build_object(
      'label', case when position(':' in l.line) = 0 then btrim(l.line) else btrim(split_part(l.line, ':', 1)) end,
      'value', case when position(':' in l.line) = 0 then '' else btrim(substr(l.line, position(':' in l.line) + 1)) end
    )
    order by l.n
  )
  from regexp_split_to_table(s.specs_text, E'\n') with ordinality as l(line, n)
  where btrim(l.line) <> ''
), '[]'::jsonb)
from _specs s
where p.slug = s.slug;

-- 7) tabela de medidas de cada modelo (junta com o que o produto já tinha)
update products p
set model_charts = coalesce(p.model_charts, '{}'::jsonb) || x.novo
from (
  select slug, jsonb_object_agg(model_label, chart_name) as novo
  from _tabelas
  group by slug
) x
where p.slug = x.slug;

-- 8) conferência: o que ficou no banco para os produtos da lista
select
  p.slug,
  v.model_label as modelo,
  min(v.price) as preco,
  string_agg(distinct v.size, ',') as tamanhos,
  string_agg(distinct v.color, ',') as cores,
  count(*) as variantes,
  p.model_charts ->> v.model_label as tabela_medidas
from products p
join product_variants v on v.product_id = p.id
where p.slug in (select distinct slug from _modelos)
group by p.slug, v.model_label, p.model_charts
order by p.slug, min(v.price), v.model_label;

commit; -- para só testar, troque por: rollback;
