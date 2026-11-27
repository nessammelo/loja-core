import { MercadoPagoConfig, Payment } from 'mercadopago'
import { createClient } from '@supabase/supabase-js'
import { applyPayment } from '../lib/payments.js'
import { orderIdFromExternalReference } from '../../src/lib/crewRef.js'

const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN })
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

export default async (req) => {
  try {
    const url = new URL(req.url)
    const topic = url.searchParams.get('topic') || url.searchParams.get('type')
    const id = url.searchParams.get('id') || url.searchParams.get('data.id')

    if (topic !== 'payment' || !id) {
      // Mercado Pago também manda notificações de outros tipos (merchant_order etc.) — ignora
      return new Response('ok', { status: 200 })
    }

    // Reconsulta o pagamento no MP (não confia no corpo do aviso)
    const payment = new Payment(client)
    const paymentInfo = await payment.get({ id })

    // external_reference = id do pedido, ou "ref-pablo_<id>" quando veio por link da Crew
    const orderId = orderIdFromExternalReference(paymentInfo.external_reference)
    if (!orderId) return new Response('ok', { status: 200 })

    await applyPayment(supabase, orderId, paymentInfo.status)

    return new Response('ok', { status: 200 })
  } catch (err) {
    console.error(err)
    return new Response('erro', { status: 500 })
  }
}
