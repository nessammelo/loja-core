import { sendOrderEmail } from './email.js'

const REFUNDED = ['refunded', 'charged_back']

// Aplica no pedido o status de um pagamento do Mercado Pago.
// Usada pelo webhook e pela rotina de expiração (mesma regra nos dois).
export async function applyPayment(db, orderId, paymentStatus) {
  const { data: order } = await db
    .from('orders')
    .select('id, status, payment_status')
    .eq('id', orderId)
    .maybeSingle()
  if (!order) return

  if (paymentStatus === 'approved') {
    if (order.status === 'aguardando pagamento') {
      await db.from('orders').update({ payment_status: 'approved', status: 'novo' }).eq('id', order.id)
      await sendOrderEmail(db, { orderId: order.id, kind: 'recebido' })
    } else if (order.status === 'expirado') {
      // pagou depois de expirar: volta pra fila com aviso pra loja decidir
      await db
        .from('orders')
        .update({ payment_status: 'approved', status: 'novo', late_payment: true })
        .eq('id', order.id)
      await sendOrderEmail(db, { orderId: order.id, kind: 'recebido' })
    } else if (order.status === 'cancelado') {
      // pagou um pedido já cancelado: fica cancelado, com aviso de estornar
      if (order.payment_status !== 'approved' && !REFUNDED.includes(order.payment_status)) {
        await db.from('orders').update({ payment_status: 'approved', late_payment: true }).eq('id', order.id)
      }
    } else if (order.payment_status !== 'approved') {
      await db.from('orders').update({ payment_status: 'approved' }).eq('id', order.id)
    }
    return
  }

  if (REFUNDED.includes(paymentStatus)) {
    // só vale estorno de um pagamento que tinha sido aprovado
    if (order.payment_status !== 'approved' && !REFUNDED.includes(order.payment_status)) return
    const patch = { payment_status: paymentStatus }
    const wasActive = order.status !== 'cancelado'
    if (wasActive) {
      patch.status = 'cancelado'
      patch.cancelled_at = new Date().toISOString()
      patch.cancel_reason =
        paymentStatus === 'charged_back' ? 'Contestação no cartão (chargeback)' : 'Estornado no Mercado Pago'
    }
    await db.from('orders').update(patch).eq('id', order.id)
    if (wasActive && paymentStatus === 'refunded') {
      await sendOrderEmail(db, { orderId: order.id, kind: 'cancelado' })
    }
    return
  }

  // pending, in_process, rejected, cancelled...: só anota enquanto não houver
  // pagamento aprovado (um aviso atrasado de tentativa recusada não pode
  // apagar um pagamento que já foi aprovado).
  if (order.payment_status === 'approved' || REFUNDED.includes(order.payment_status)) return
  if (order.status === 'aguardando pagamento' || order.status === 'expirado') {
    await db.from('orders').update({ payment_status: paymentStatus }).eq('id', order.id)
  }
}
