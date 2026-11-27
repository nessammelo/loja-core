// Rotina automática do amigo secreto (de hora em hora, roda sozinha na Netlify):
// 1) faz os sorteios automáticos que chegaram na data (não depende mais de alguém abrir a página);
// 2) e-mail "o sorteio saiu" (sem dizer quem tirou, só o link pessoal);
// 3) e-mail pro responsável quando o sorteio não aconteceu (menos de 3 aprovados);
// 4) e-mail "mensagem nova" (no máximo 1 por dia por pessoa).
// Respeita o limite do Resend grátis (100/dia), deixando folga pros e-mails de pedido.
import { createClient } from '@supabase/supabase-js'
import { resendSend, emailConfigured, siteUrl } from '../lib/email.js'
import { amigoEmail } from '../../src/lib/amigoEmail.js'

export const config = { schedule: '@hourly' }

const AMIGO_DAILY_MAX = Number(process.env.AMIGO_EMAIL_DAILY_MAX || 70) // só amigo secreto
const TOTAL_DAILY_MAX = Number(process.env.EMAIL_DAILY_MAX || 90) // amigo + pedidos
const PER_RUN_MAX = 40

// meia-noite de hoje em Brasília (-03), em ISO
function startOfTodayBR(now = Date.now()) {
  const br = new Date(now - 3 * 3600 * 1000)
  return new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), br.getUTCDate(), 3)).toISOString()
}

async function countSince(supabase, table, since) {
  const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true }).gte('created_at', since)
  return error ? 0 : count || 0
}

export async function emailBudget(supabase, now = Date.now()) {
  const since = startOfTodayBR(now)
  const amigo = await countSince(supabase, 'ss_email_log', since)
  const orders = await countSince(supabase, 'order_emails', since)
  return Math.max(0, Math.min(PER_RUN_MAX, AMIGO_DAILY_MAX - amigo, TOTAL_DAILY_MAX - amigo - orders))
}

const KIND = { draw: 'sorteio', messages: 'mensagens', warn: 'aviso_responsavel' }

export async function run({ supabase, send = resendSend, configured = emailConfigured(), now = Date.now() }) {
  // sem Resend configurado ainda faz os sorteios, só não manda e-mail
  const limit = configured ? await emailBudget(supabase, now) : 0
  const { data, error } = await supabase.rpc('ss_cron_tick', { p_limit: limit })
  if (error) throw error
  if (!configured) return { sent: 0, failed: 0, skipped: 'not_configured' }

  const site = siteUrl()
  let sent = 0
  let failed = 0
  for (const key of ['draw', 'warn', 'messages']) {
    const done = []
    for (const r of data?.[key] || []) {
      const kind = KIND[key]
      const link = `${site}/amigo/eu/${r.token}`
      let status = 'sent'
      let errMsg = null
      try {
        const { subject, html } = amigoEmail(kind, r, link)
        await send({ to: r.email, subject, html })
        sent++
      } catch (err) {
        status = 'failed'
        errMsg = String(err.message).slice(0, 500)
        failed++
      }
      // marca mesmo se falhou (e-mail errado não pode virar tentativa toda hora)
      done.push(key === 'warn' ? r.group_id : r.id)
      await supabase.from('ss_email_log').insert({ participant_id: r.id, kind, to_email: r.email, status, error: errMsg })
    }
    if (done.length) {
      const { error: markErr } = await supabase.rpc('ss_cron_mark', { p_kind: key, p_ids: done })
      if (markErr) console.error('ss_cron_mark', key, markErr.message)
    }
  }
  return { sent, failed }
}

export default async () => {
  try {
    const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    const r = await run({ supabase })
    console.log('amigo-cron', JSON.stringify(r))
  } catch (err) {
    console.error('amigo-cron', err)
  }
  return new Response('ok')
}
