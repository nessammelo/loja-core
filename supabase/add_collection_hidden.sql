-- MIGRAÇÃO: coleção oculta (não aparece na home, só por link).
-- Rode DEPOIS de update_coupons_and_collections.sql. Pode rodar mais de uma vez.
alter table collection_order add column if not exists hidden boolean not null default false;
