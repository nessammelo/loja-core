// Monta supabase/instalar.sql: tudo que um Supabase NOVO precisa, na ordem certa.
//
// As migrações de supabase/ são o histórico da loja (cada uma roda depois da
// anterior). Pra um cliente novo, em vez de rodar uma por uma, roda só o
// instalar.sql, gerado por este script.
//
// Migração nova: crie o arquivo em supabase/, acrescente o nome no fim de
// ORDER e rode: node scripts/build-install-sql.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase')

// Ordem testada num banco vazio. Ficam de fora: banners_and_multi_images.sql
// (substituído pela v2), bulk_catalog_update.sql e fix_size_xgg.sql (dados da Edge).
export const ORDER = [
  'schema',
  'storage_setup',
  'tighten_admin_policies',
  'create_order_function',
  'fix_variant_delete',
  'banners_and_multi_images_v2',
  'add_tracking_code',
  'add_shipping_fee',
  'add_coupons',
  'update_coupons_and_collections',
  'add_collection_hidden',
  'add_model_pricing_and_color_photos',
  'add_amigo_secreto_e_botao_banner',
  'add_gubo_shipping',
  'add_kit_coupon',
  'add_tiered_coupon_e_cpf',
  'add_custos_e_crew',
  'fix_seguranca_pedidos_e_cupons',
  'add_cancelamento_e_emails',
  'add_ref_crew',
  'add_amigo_ideias_presente',
  'add_amigo_leads_cupom_avisos',
  'add_modos_pagamento_frete',
  'add_melhor_envio',
]

const head = `-- =====================================================================
-- INSTALAÇÃO DA LOJA EM UM SUPABASE NOVO
-- Gerado por scripts/build-install-sql.mjs. Não editar à mão.
--
-- Como usar: no Supabase do cliente, SQL Editor > New query, colar este
-- arquivo inteiro e clicar em Run. Roda uma vez só, num projeto vazio.
-- Os módulos opcionais (amigo secreto, crew, Gubo) também criam suas tabelas,
-- mas ficam desligados até o cliente ligar em clients/<cliente>/brand.js.
-- =====================================================================

do $$
begin
  if to_regclass('public.orders') is not null then
    raise exception 'Este Supabase já tem a loja instalada. instalar.sql é só pra projeto novo; pra atualizar, rode só as migrações novas de supabase/.';
  end if;
end $$;
`

const tail = `
-- =====================================================================
-- LIMPEZA: tira os dados de exemplo que as migrações antigas criavam
-- (produto e banner de teste da Edge e o catálogo da Gubo).
-- =====================================================================
delete from product_variants;
delete from products;
delete from banners;
delete from shipping_models;
`

const body = ORDER.map((name) => {
  const sql = readFileSync(join(dir, `${name}.sql`), 'utf8').trim()
  return `\n-- ---------------------------------------------------------------------\n-- ${name}.sql\n-- ---------------------------------------------------------------------\n${sql}\n`
}).join('')

writeFileSync(join(dir, 'instalar.sql'), head + body + tail)
console.log(`supabase/instalar.sql gerado com ${ORDER.length} migrações.`)
