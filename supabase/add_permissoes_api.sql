-- Permissões da API (Data API) nas tabelas da loja.
--
-- Projetos novos do Supabase não liberam mais as tabelas do schema public pra
-- API sozinhos: sem isto, o site dá "permission denied for table products".
-- Quem protege os dados continua sendo o RLS (toda tabela da loja tem RLS
-- ligado e só abre o que as políticas permitem). Pode rodar mais de uma vez.

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;
-- funções: o servidor (service_role) usa todas; anon/authenticated já têm
-- grant explícito só nas funções públicas (create_customer_order, validate_coupon...)
grant execute on all functions in schema public to service_role;

-- tabelas e sequências criadas depois (migrações futuras) já nascem liberadas
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges in schema public grant usage, select on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to service_role;

notify pgrst, 'reload schema';
