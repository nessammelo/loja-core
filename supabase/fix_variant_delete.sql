-- Permite editar/apagar variantes de produto mesmo quando já usadas em
-- algum pedido — o pedido guarda uma cópia (nome, modelo, tamanho, cor)
-- então não perde histórico, só desvincula a referência.

alter table order_items
  drop constraint if exists order_items_product_variant_id_fkey;

alter table order_items
  add constraint order_items_product_variant_id_fkey
  foreign key (product_variant_id)
  references product_variants(id)
  on delete set null;
