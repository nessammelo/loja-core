// Chaves secretas da loja (Mercado Pago, Melhor Envio...).
//
// A cliente cola as chaves no admin (Pagamento e frete). Elas vão pra function
// store-keys, que testa e guarda na tabela store_secrets do Supabase. Essa
// tabela não tem nenhuma policy: só o servidor (service_role) lê e escreve, o
// site nunca vê as chaves.
//
// Se a chave não estiver no banco, usa a variável da Netlify (jeito antigo).
import { createClient } from '@supabase/supabase-js'
import { MercadoPagoConfig } from 'mercadopago'

let admin
function db() {
  if (!admin) admin = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  return admin
}

export async function getSecret(key) {
  const { data, error } = await db().from('store_secrets').select('value').eq('key', key).maybeSingle()
  if (error) return null // tabela ainda não criada (SQL não rodado): cai na variável
  return data?.value || null
}

export async function setSecret(key, value) {
  const { error } = await db().from('store_secrets').upsert({ key, value, updated_at: new Date().toISOString() })
  if (error) throw error
}

export async function deleteSecret(key) {
  const { error } = await db().from('store_secrets').delete().eq('key', key)
  if (error) throw error
}

export async function mpAccessToken() {
  return (await getSecret('mp_access_token')) || process.env.MP_ACCESS_TOKEN || ''
}

// Cliente do Mercado Pago com a chave da loja. Lança erro se não houver chave.
export async function mpClient() {
  const accessToken = await mpAccessToken()
  if (!accessToken) throw new Error('Mercado Pago não configurado. Cole a chave em Admin > Pagamento e frete.')
  return new MercadoPagoConfig({ accessToken })
}

// Testa a chave no Mercado Pago. Devolve { ok, account } ou { ok: false, error }.
export async function testMpToken(accessToken) {
  try {
    const res = await fetch('https://api.mercadopago.com/users/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(8000),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: data?.message || `Mercado Pago respondeu ${res.status}` }
    return { ok: true, account: data.nickname || data.email || String(data.id || '') }
  } catch (err) {
    return { ok: false, error: `Não deu pra falar com o Mercado Pago: ${err.message}` }
  }
}
