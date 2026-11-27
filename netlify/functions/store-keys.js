// Admin > Pagamento e frete: guarda e testa as chaves secretas da loja.
//
// GET  -> { mercadopago: { connected, account, source } }   (nunca devolve a chave)
// POST { provider: 'mercadopago', accessToken } -> testa no Mercado Pago e salva
// POST { provider: 'mercadopago', remove: true } -> apaga a chave do banco
// POST { provider: 'melhorenvio', token, cep, env } -> testa no Melhor Envio e salva
// POST { provider: 'melhorenvio', remove: true }
//
// Só quem está logado no admin pode chamar.
import { createClient } from '@supabase/supabase-js'
import { getSecret, setSecret, deleteSecret, testMpToken } from '../lib/secrets.js'
import { melhorEnvioConfig, testMelhorEnvio } from '../lib/melhorenvio.js'
import { brand } from '../../src/brand.js'

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

async function mpStatus() {
  const dbToken = await getSecret('mp_access_token')
  const token = dbToken || process.env.MP_ACCESS_TOKEN
  if (!token) return { connected: false }
  const test = await testMpToken(token)
  return {
    connected: test.ok,
    account: test.account || null,
    error: test.ok ? null : test.error,
    source: dbToken ? 'admin' : 'netlify',
  }
}

async function meStatus() {
  if (brand.features.shipping !== 'melhorenvio') return null
  const cfg = await melhorEnvioConfig()
  if (!cfg.token) return { connected: false }
  const test = await testMelhorEnvio(cfg.token, cfg.env)
  return { connected: test.ok, account: test.account || null, error: test.ok ? null : test.error, cep: cfg.cep, env: cfg.env }
}

async function status() {
  const [mercadopago, melhorenvio] = await Promise.all([mpStatus(), meStatus()])
  return { mercadopago, melhorenvio }
}

async function saveMelhorEnvio(body) {
  if (body.remove) {
    await Promise.all(['melhorenvio_token', 'melhorenvio_cep', 'melhorenvio_env'].map(deleteSecret))
    return null
  }
  const token = String(body.token || '').trim()
  const cep = String(body.cep || '').replace(/\D/g, '')
  const env = body.env === 'producao' ? 'producao' : 'sandbox'
  if (!token) return 'Cole o token do Melhor Envio.'
  if (cep.length !== 8) return 'CEP de origem inválido.'
  const test = await testMelhorEnvio(token, env)
  if (!test.ok) return `O token não funcionou: ${test.error}`
  await setSecret('melhorenvio_token', token)
  await setSecret('melhorenvio_cep', cep)
  await setSecret('melhorenvio_env', env)
  return null
}

export default async (req) => {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  const { data: auth } = token ? await supabase.auth.getUser(token) : { data: null }
  if (!auth?.user) return json({ error: 'Faça login no admin.' }, 401)

  try {
    if (req.method === 'GET') return json(await status())
    if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405)

    const body = await req.json().catch(() => ({}))
    if (body.provider === 'melhorenvio') {
      const err = await saveMelhorEnvio(body)
      return err ? json({ error: err }, 400) : json(await status())
    }
    if (body.provider !== 'mercadopago') return json({ error: 'Provedor desconhecido' }, 400)

    if (body.remove) {
      await deleteSecret('mp_access_token')
      return json(await status())
    }

    const accessToken = String(body.accessToken || '').trim()
    if (!/^(APP_USR|TEST)-/.test(accessToken)) {
      return json({ error: 'Essa não parece uma chave do Mercado Pago. Ela começa com APP_USR- (ou TEST- no modo de teste).' }, 400)
    }
    const test = await testMpToken(accessToken)
    if (!test.ok) return json({ error: `A chave não funcionou: ${test.error}` }, 400)

    await setSecret('mp_access_token', accessToken)
    return json(await status())
  } catch (err) {
    const missing = /store_secrets/.test(err.message || '')
    return json(
      { error: missing ? 'Falta rodar o SQL add_modos_pagamento_frete.sql no Supabase.' : err.message },
      500
    )
  }
}
