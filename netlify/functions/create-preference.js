import { Preference } from 'mercadopago'
import { createClient } from '@supabase/supabase-js'
import { normalizeRef, buildExternalReference } from '../../src/lib/crewRef.js'
import { mpClient } from '../lib/secrets.js'

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const { orderId, ref: bodyRef } = await req.json()
    if (!orderId) {
      return new Response(JSON.stringify({ error: 'orderId é obrigatório' }), { status: 400 })
    }

    const { data: order, error } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', orderId)
      .single()

    if (error || !order) {
      return new Response(
        JSON.stringify({
          error: `Pedido não encontrado (id: ${orderId}) — ${error?.message || 'sem detalhe'}`,
        }),
        { status: 404 }
      )
    }

    // Pedido cancelado, expirado ou já pago não gera link novo
    if (order.status !== 'aguardando pagamento') {
      return new Response(
        JSON.stringify({ error: 'Este pedido não está mais aguardando pagamento. Faça um pedido novo.' }),
        { status: 409 }
      )
    }

    // Pedido com mais de 24h não gera link novo (a rotina expire-orders
    // expira o pedido na loja). A validade NÃO vai na preferência do MP.
    const expiresAt = new Date(new Date(order.created_at).getTime() + 24 * 3600 * 1000)
    if (expiresAt.getTime() - Date.now() < 10 * 60 * 1000) {
      return new Response(
        JSON.stringify({ error: 'O prazo de pagamento deste pedido acabou. Faça um pedido novo.' }),
        { status: 409 }
      )
    }

    // Link de parceiro (?ref=): o primeiro ref gravado no pedido vale.
    // Se a coluna orders.ref ainda não existe (SQL add_ref_crew.sql não
    // rodado), o update falha em silêncio e o ref vai só pro Mercado Pago.
    const ref = normalizeRef(order.ref) || normalizeRef(bodyRef)
    if (ref && !order.ref) {
      const { error: refErr } = await supabase.from('orders').update({ ref }).eq('id', order.id)
      if (refErr) console.warn('ref não gravado no pedido:', refErr.message)
    }

    const siteUrl = process.env.URL || 'http://localhost:8888'

    const mpItems = order.order_items.map((item) => ({
      title: `${item.product_name} - ${item.model_label} - ${item.size}`,
      quantity: item.qty,
      unit_price: Number(item.unit_price),
      currency_id: 'BRL',
    }))

    // Frete cobrado como item separado (já vem 0 do banco se o cupom
    // aplicado for de frete grátis), pra bater com order.total.
    const shippingFee = Number(order.shipping_fee ?? 0)
    if (shippingFee > 0) {
      mpItems.push({
        title: 'Frete',
        quantity: 1,
        unit_price: shippingFee,
        currency_id: 'BRL',
      })
    }

    // Desconto de cupom (percentual ou valor fixo) como item de valor
    // negativo, pra bater com order.total.
    const discount = Number(order.discount_amount ?? 0)
    if (discount > 0) {
      mpItems.push({
        title: `Desconto${order.coupon_code ? ` (${order.coupon_code})` : ''}`,
        quantity: 1,
        unit_price: -discount,
        currency_id: 'BRL',
      })
    }

    const preference = new Preference(await mpClient())
    const result = await preference.create({
      body: {
        items: mpItems,
        external_reference: buildExternalReference(order.id, ref),
        metadata: { order_id: order.id, ref: ref || null },
        back_urls: {
          success: `${siteUrl}/pedido-confirmado?order=${order.id}`,
          pending: `${siteUrl}/pedido-confirmado?order=${order.id}`,
          failure: `${siteUrl}/checkout?falhou=1`,
        },
        auto_return: 'approved',
        // sem boleto (demora até 3 dias úteis pra compensar): só Pix e cartão
        payment_methods: {
          excluded_payment_types: [{ id: 'ticket' }],
        },

        notification_url: `${siteUrl}/.netlify/functions/mp-webhook`,
      },
    })

    return new Response(
      JSON.stringify({ initPoint: result.init_point, preferenceId: result.id }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
}
