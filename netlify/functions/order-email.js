// E-mail do pedido disparado pelo admin (após mudar o status, ou "Enviar pelo site").
// Só funciona com o login do admin.
import { createClient } from '@supabase/supabase-js'
import { sendOrderEmail } from '../lib/email.js'

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

// campos que o admin pode editar antes de enviar
const EDITABLE = ['nome', 'prazo', 'previsao', 'valor', 'endereco', 'transportadora', 'codigo', 'link', 'itens', 'extra', 'motivo', 'estorno', 'cupom']

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'Faça login no admin.' }, 401)
  const { data: auth, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !auth?.user) return json({ error: 'Login do admin expirou. Entre de novo.' }, 401)

  try {
    const { orderId, kind, auto = false, values } = await req.json()
    if (!orderId || !kind) return json({ error: 'orderId e kind são obrigatórios' }, 400)

    const clean = {}
    for (const k of EDITABLE) {
      if (values && typeof values[k] === 'string') clean[k] = values[k].slice(0, 2000)
    }

    const result = await sendOrderEmail(supabase, { orderId, kind, auto: Boolean(auto), values: clean })
    return json(result, 200)
  } catch (err) {
    return json({ ok: false, error: err.message }, 500)
  }
}
