-- Modos de pagamento e frete + chaves secretas guardadas no servidor.
-- Pode rodar mais de uma vez.
--
-- store_settings (já existe, pública) ganha duas chaves:
--   payment_mode   'whatsapp' | 'mercadopago'
--   shipping_mode  'whatsapp' | 'auto'
-- Sem elas, a loja usa o padrão do cliente (clients/<cliente>/brand.js).
--
-- store_secrets guarda as chaves (ex: token do Mercado Pago). RLS ligado e
-- NENHUMA policy: o site (anon) e o admin logado não leem nem escrevem.
-- Só as Netlify Functions, com a service_role, acessam.

create table if not exists store_secrets (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table store_secrets enable row level security;

-- garante que nenhuma policy antiga abra a tabela
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'store_secrets' loop
    execute format('drop policy %I on store_secrets', p.policyname);
  end loop;
end $$;

revoke all on store_secrets from anon, authenticated;
