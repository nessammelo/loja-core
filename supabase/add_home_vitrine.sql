-- Home mais completa: texto em cima do banner e foto nos cards de coleção.
-- Pode rodar mais de uma vez.
alter table banners add column if not exists title text;
alter table banners add column if not exists subtitle text;
alter table collection_order add column if not exists image_url text;
