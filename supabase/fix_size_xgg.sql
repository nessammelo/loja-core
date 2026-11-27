-- Troca o tamanho "XXG" por "XGG" (igual à Gubo) nos produtos que já existem.
-- Pode rodar mais de uma vez. Pedidos antigos não mudam (guardam o texto da época).
-- Se o mesmo produto/modelo/cor já tiver XGG, a linha XXG fica como está
-- (aí é só apagar o XXG pelo admin).

update product_variants v
set size = 'XGG'
where v.size = 'XXG'
  and not exists (
    select 1 from product_variants o
    where o.product_id = v.product_id
      and o.model_label is not distinct from v.model_label
      and o.color is not distinct from v.color
      and o.size = 'XGG'
  );

-- confere: deve voltar 0
select count(*) as ainda_com_xxg from product_variants where size = 'XXG';
