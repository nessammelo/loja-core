// Envio dos e-mails automáticos do pedido (Resend).
// Usado pelas functions mp-webhook, expire-orders e order-email.
//
// Variáveis na Netlify:
//   RESEND_API_KEY  chave do Resend (sem ela, nada é enviado e nada trava)
//   EMAIL_FROM      opcional, padrão "EDGE <pedidos@edgebjj.com.br>"
//   EMAIL_REPLY_TO  pra onde vão as respostas do cliente (o Gmail da loja)
import {
  EMAIL_TYPES,
  buildEmailHtml,
  emailSubject,
  emailValuesFromOrder,
} from '../../src/lib/orderEmail.js'

const ORDER_SELECT = '*, customers(name, email, phone), order_items(*)'

export function siteUrl() {
  return (process.env.URL || 'https://edgebjj.com.br').replace(/\/$/, '')
}

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY)
}

export async function loadOrder(supabase, orderId) {
  const { data, error } = await supabase.from('orders').select(ORDER_SELECT).eq('id', orderId).single()
  if (error) throw error
  return data
}

export async function resendSend({ to, subject, html }) {
  const body = {
    from: process.env.EMAIL_FROM || 'EDGE <pedidos@edgebjj.com.br>',
    to: [to],
    subject,
    html,
  }
  if (process.env.EMAIL_REPLY_TO) body.reply_to = process.env.EMAIL_REPLY_TO
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.message || `Resend respondeu ${res.status}`)
  return data.id || null
}

// Envia um e-mail do pedido.
//   auto = true: e-mail automático, sai uma vez só por pedido (se já saiu, pula).
//   auto = false: reenvio pelo admin, sai sempre.
//   values: campos editados no admin (sobrepõem os do pedido).
// Nunca lança erro: devolve { ok, skipped?, error? } pra não travar quem chamou.
export async function sendOrderEmail(supabase, { order, orderId, kind, auto = true, values = {} }) {
  try {
    if (!EMAIL_TYPES[kind]) return { ok: false, error: `Tipo de e-mail desconhecido: ${kind}` }
    if (!emailConfigured()) return { ok: false, skipped: 'not_configured', error: 'E-mails automáticos ainda não configurados (falta RESEND_API_KEY na Netlify).' }

    const o = order || (await loadOrder(supabase, orderId))
    const to = o.customers?.email
    if (!to) return { ok: false, error: 'Pedido sem e-mail do cliente.' }

    // reserva o envio (o índice único impede o mesmo automático duas vezes)
    const { data: row, error: insErr } = await supabase
      .from('order_emails')
      .insert({ order_id: o.id, kind, auto, to_email: to, status: 'sending' })
      .select('id')
      .single()
    if (insErr) {
      if (insErr.code === '23505') return { ok: true, skipped: 'already_sent' }
      return { ok: false, error: insErr.message }
    }

    const site = siteUrl()
    const v = { ...emailValuesFromOrder(o, site), ...values }
    const html = buildEmailHtml(kind, v, `${site}/assets/logo-edge.png`)
    const subject = emailSubject(kind, v)

    try {
      const providerId = await resendSend({ to, subject, html })
      await supabase.from('order_emails').update({ status: 'sent', provider_id: providerId }).eq('id', row.id)
      return { ok: true }
    } catch (err) {
      await supabase.from('order_emails').update({ status: 'failed', error: String(err.message).slice(0, 500) }).eq('id', row.id)
      return { ok: false, error: err.message }
    }
  } catch (err) {
    console.error('sendOrderEmail', err)
    return { ok: false, error: err.message }
  }
}
