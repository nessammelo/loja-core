// Rotina automática (de hora em hora, roda sozinha na Netlify):
// 1) Pedido "aguardando pagamento" há mais de 24h: pergunta ao Mercado Pago
//    se tem pagamento. Aprovado -> vira "novo". Em análise -> espera mais um
//    pouco. Nada -> "expirado".
// 2) Pedido expirado há ~2h: manda 1 e-mail de resgate com o link do carrinho.
import { Payment } from 'mercadopago'
import { createClient } from '@supabase/supabase-js'
import { applyPayment } from '../lib/payments.js'
import { mpClient } from '../lib/secrets.js'
import { sendOrderEmail, siteUrl, loadOrder } from '../lib/email.js'
import { rescueCartUrl } from '../../src/lib/orderEmail.js'
import { CREW_REFS, buildExternalReference } from '../../src/lib/crewRef.js'

export const config = { schedule: '@hourly' }

const HOUR = 3600 * 1000
const EXPIRE_AFTER = 24 * HOUR
const MAX_WAIT_IN_REVIEW = 72 * HOUR // cartão "em análise" no MP pode demorar
const RESCUE_AFTER = 2 * HOUR
const RESCUE_WINDOW = 72 * HOUR // não resgata expirado muito antigo
const RESCUE_COOLDOWN = 7 * 24 * HOUR // no máximo 1 resgate por cliente por semana

const iso = (ms) => new Date(ms).toISOString()

// Busca no MP os pagamentos do pedido. O external_reference é o id do pedido
// ou "ref-pablo_<id>" (link da Crew), então procura em cada variante.
async function mpPaymentsOf(orderId, extRefs = [orderId]) {
  const client = await mpClient()
  const all = []
  for (const extRef of extRefs) {
    const res = await new Payment(client).search({ options: { external_reference: extRef } })
    all.push(...(res?.results || []))
  }
  return all
}

// Variantes de external_reference de um pedido. Sem a coluna orders.ref
// (SQL não rodado) não dá pra saber o ref, então testa todos da Crew.
function extRefsOf(o, refKnown) {
  if (o.ref) return [o.id, buildExternalReference(o.id, o.ref)]
  if (refKnown) return [o.id]
  return [o.id, ...CREW_REFS.map((r) => buildExternalReference(o.id, r))]
}

async function expirePending(supabase, paymentsOf, now) {
  const pending = (cols) =>
    supabase
      .from('orders')
      .select(cols)
      .eq('status', 'aguardando pagamento')
      .lt('created_at', iso(now - EXPIRE_AFTER))
      .order('created_at')
      .limit(40)
  let refKnown = true
  let { data: orders, error } = await pending('id, created_at, ref')
  if (error) {
    // coluna ref ainda não existe: segue sem ela
    refKnown = false
    ;({ data: orders, error } = await pending('id, created_at'))
  }
  if (error) throw error

  let expired = 0
  for (const o of orders || []) {
    let payments
    try {
      payments = await paymentsOf(o.id, extRefsOf(o, refKnown))
    } catch (err) {
      // sem resposta do MP: tenta de novo na próxima hora (nunca expira no escuro)
      console.error('MP search falhou', o.id, err.message)
      continue
    }

    if (payments.some((p) => p.status === 'approved')) {
      await applyPayment(supabase, o.id, 'approved')
      continue
    }

    const inReview = payments.some((p) => ['in_process', 'pending', 'authorized'].includes(p.status))
    if (inReview && now - new Date(o.created_at).getTime() < MAX_WAIT_IN_REVIEW) continue

    const { error: upErr } = await supabase
      .from('orders')
      .update({
        status: 'expirado',
        cancelled_at: iso(now),
        cancel_reason: 'Pagamento não confirmado em 24h',
      })
      .eq('id', o.id)
      .eq('status', 'aguardando pagamento')
    if (!upErr) expired++
  }
  return expired
}

async function rescueCoupon(supabase) {
  const { data } = await supabase.from('admin_settings').select('value').eq('key', 'rescue_coupon').maybeSingle()
  const code = (data?.value || '').trim()
  if (!code) return ''
  const { data: c } = await supabase
    .from('coupons')
    .select('code, active, expires_at, max_uses, uses_count')
    .ilike('code', code)
    .maybeSingle()
  const ok =
    c &&
    c.active &&
    (!c.expires_at || new Date(c.expires_at) > new Date()) &&
    (c.max_uses == null || c.uses_count < c.max_uses)
  return ok ? c.code : ''
}

async function sendRescues(supabase, now) {
  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, customer_id, created_at, cancelled_at')
    .eq('status', 'expirado')
    .eq('late_payment', false)
    .lt('cancelled_at', iso(now - RESCUE_AFTER))
    .gt('cancelled_at', iso(now - RESCUE_WINDOW))
    .limit(30)
  if (error) throw error

  const site = siteUrl()
  let coupon = null
  let sent = 0
  for (const o of orders || []) {
    // Só pedido que expirou na hora certa. Os que estavam parados antes desta
    // versão (expirados todos de uma vez no primeiro dia) não recebem resgate.
    if (new Date(o.cancelled_at) - new Date(o.created_at) > EXPIRE_AFTER + 6 * HOUR) continue

    // já recebeu o resgate deste pedido?
    const { data: done } = await supabase
      .from('order_emails')
      .select('id')
      .eq('order_id', o.id)
      .eq('kind', 'resgate')
      .limit(1)
    if (done?.length) continue

    // o cliente já comprou depois, ou tem outro pedido em aberto? então não manda
    const { data: others } = await supabase
      .from('orders')
      .select('id, status, created_at')
      .eq('customer_id', o.customer_id)
      .neq('id', o.id)
      .gt('created_at', o.created_at)
      .in('status', ['aguardando pagamento', 'novo', 'repassado', 'enviado', 'entregue'])
      .limit(1)
    if (others?.length) continue

    // no máximo 1 resgate por cliente por semana
    const { data: customerOrders } = await supabase.from('orders').select('id').eq('customer_id', o.customer_id)
    const ids = (customerOrders || []).map((x) => x.id)
    if (ids.length) {
      const { data: recent } = await supabase
        .from('order_emails')
        .select('id')
        .eq('kind', 'resgate')
        .in('order_id', ids)
        .gt('created_at', iso(now - RESCUE_COOLDOWN))
        .limit(1)
      if (recent?.length) continue
    }

    // carrinho ainda tem alguma peça à venda?
    const { data: cart } = await supabase.rpc('get_rescue_cart', { p_order_id: o.id })
    if (!cart?.items?.some((i) => i.available)) continue

    if (coupon === null) coupon = await rescueCoupon(supabase)
    const order = await loadOrder(supabase, o.id)
    const r = await sendOrderEmail(supabase, {
      order,
      kind: 'resgate',
      values: { link: rescueCartUrl(site, o.id), cupom: coupon },
    })
    if (r.skipped === 'not_configured') break
    if (r.ok && !r.skipped) sent++
  }
  return sent
}

export async function run({ supabase, paymentsOf = mpPaymentsOf, now = Date.now() }) {
  const expired = await expirePending(supabase, paymentsOf, now)
  const rescued = await sendRescues(supabase, now)
  return { expired, rescued }
}

export default async () => {
  try {
    const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    const { expired, rescued } = await run({ supabase })
    console.log(`expire-orders: ${expired} expirados, ${rescued} resgates enviados`)
  } catch (err) {
    console.error('expire-orders', err)
  }
  return new Response('ok')
}
