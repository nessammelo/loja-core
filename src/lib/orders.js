import { supabase } from './supabase'

export async function createOrder({ customer, address, items, shippingQuoteId, couponCode, paymentMethod }) {
  const itemsPayload = items.map((i) => ({
    product_variant_id: i.variantId ?? null,
    product_name: i.productName,
    model_label: i.modelLabel,
    size: i.size,
    color: i.color,
    unit_price: i.price,
    qty: i.qty,
  }))

  // O total final (com desconto e frete grátis se for o caso) é
  // recalculado dentro de create_customer_order, não confiamos no valor
  // calculado no navegador. O frete vem da cotação guardada no servidor
  // (shippingQuoteId); sem cotação, o servidor cobra o frete fixo.
  const { data: orderId, error } = await supabase.rpc('create_customer_order', {
    p_name: customer.nome,
    p_email: customer.email,
    p_phone: customer.telefone,
    p_cpf: customer.cpf ? customer.cpf.replace(/\D/g, '') : null,
    p_address: address,
    p_items: itemsPayload,
    p_shipping_fee: null, // ignorado pelo servidor
    p_shipping_quote_id: shippingQuoteId || null,
    p_coupon_code: couponCode || null,
    p_payment_method: paymentMethod,
  })

  if (error) throw error
  return orderId
}

// Modo pagamento pelo WhatsApp: registra o pedido no admin ("aguardando
// pagamento", payment_method 'whatsapp') antes de abrir a conversa.
// O servidor recalcula os valores a partir das variantes e da cotação.
export async function createWhatsappOrder({ nome, telefone, email, items, cep, shippingQuoteId }) {
  const { data: orderId, error } = await supabase.rpc('create_whatsapp_order', {
    p_name: nome,
    p_phone: telefone,
    p_email: email || null,
    p_items: items.map((i) => ({ product_variant_id: i.variantId ?? null, qty: i.qty })),
    p_cep: cep || null,
    p_shipping_quote_id: shippingQuoteId || null,
  })
  if (error) throw error
  return orderId
}

export async function fetchOrders() {
  const { data, error } = await supabase
    .from('orders')
    .select('*, customers(name, email, phone), order_items(*)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function updateOrderStatus(orderId, status) {
  const { error } = await supabase.from('orders').update({ status }).eq('id', orderId)
  if (error) throw error
}

// Pedido do WhatsApp: a loja confirma o pagamento combinado na conversa
export async function markOrderPaid(orderId) {
  const { error } = await supabase
    .from('orders')
    .update({ status: 'novo', payment_status: 'approved' })
    .eq('id', orderId)
    .eq('status', 'aguardando pagamento')
  if (error) throw error
}

export async function markOrderShipped(orderId, { carrier, trackingCode }) {
  const { error } = await supabase
    .from('orders')
    .update({ status: 'enviado', carrier, tracking_code: trackingCode })
    .eq('id', orderId)
  if (error) throw error
}

// Cancela o pedido (o banco devolve o uso do cupom, se tinha contado).
export async function cancelOrder(orderId, reason) {
  const { error } = await supabase
    .from('orders')
    .update({ status: 'cancelado', cancel_reason: reason || null, cancelled_at: new Date().toISOString() })
    .eq('id', orderId)
  if (error) throw error
}

// Histórico dos e-mails automáticos. Se o SQL novo ainda não rodou, volta vazio.
export async function fetchOrderEmails() {
  const { data, error } = await supabase
    .from('order_emails')
    .select('id, order_id, kind, auto, status, error, created_at')
    .order('created_at', { ascending: true })
  if (error) return []
  return data
}

// Pede pra Netlify enviar um e-mail do pedido (login do admin vai junto).
// auto = true: só envia se aquele e-mail automático ainda não saiu.
export async function sendOrderEmail({ orderId, kind, auto = false, values }) {
  try {
    const { data } = await supabase.auth.getSession()
    const token = data?.session?.access_token
    const res = await fetch('/.netlify/functions/order-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}` },
      body: JSON.stringify({ orderId, kind, auto, values }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: body.error || `Erro ${res.status}` }
    return body
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

// Cupom do e-mail de resgate automático (Admin > Pedidos > Expirados)
export async function fetchRescueCoupon() {
  const { data } = await supabase.from('admin_settings').select('value').eq('key', 'rescue_coupon').maybeSingle()
  return data?.value || ''
}

export async function saveRescueCoupon(code) {
  const { error } = await supabase
    .from('admin_settings')
    .upsert({ key: 'rescue_coupon', value: (code || '').trim().toUpperCase() })
  if (error) throw error
}

// Carrinho de um pedido expirado (link do e-mail de resgate)
export async function fetchRescueCart(orderId) {
  const { data, error } = await supabase.rpc('get_rescue_cart', { p_order_id: orderId })
  if (error) throw error
  return data
}
