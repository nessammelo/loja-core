import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { brand, whatsappStoreUrl } from '../brand'

// Modos da loja, escolhidos em Admin > Pagamento e frete (tabela store_settings).
//   payment:  'whatsapp' | 'mercadopago'
//   shipping: 'whatsapp' | 'auto'
// Sem nada salvo, vale o padrão do cliente (brand.features).
export const MODE_KEYS = { payment: 'payment_mode', shipping: 'shipping_mode' }

const PAYMENTS = ['whatsapp', 'mercadopago']
const SHIPPINGS = ['whatsapp', 'auto']

export function normalizeModes(raw = {}) {
  const payment = PAYMENTS.includes(raw.payment) ? raw.payment : brand.features.paymentMode
  let shipping = SHIPPINGS.includes(raw.shipping) ? raw.shipping : brand.features.shippingMode
  // checkout do Mercado Pago precisa do valor do frete: com ele, o frete é sempre automático
  if (payment === 'mercadopago') shipping = 'auto'
  return { payment, shipping }
}

export async function fetchStoreModes() {
  const { data, error } = await supabase
    .from('store_settings')
    .select('key, value')
    .in('key', Object.values(MODE_KEYS))
  const map = error || !data ? {} : Object.fromEntries(data.map((r) => [r.key, r.value]))
  return normalizeModes({ payment: map[MODE_KEYS.payment], shipping: map[MODE_KEYS.shipping] })
}

// { payment, shipping, loading }. Enquanto carrega, usa o padrão do cliente.
export function useStoreModes() {
  const [state, setState] = useState(() => ({ ...normalizeModes(), loading: true }))
  useEffect(() => {
    let alive = true
    fetchStoreModes()
      .then((m) => alive && setState({ ...m, loading: false }))
      .catch(() => alive && setState((s) => ({ ...s, loading: false })))
    return () => {
      alive = false
    }
  }, [])
  return state
}

const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Final do checkout no modo WhatsApp: o pedido já está no admin, então a
// mensagem leva só o número e o total (a loja vê os itens no admin).
export function orderWhatsappUrl(orderId, total, shippingToCombine) {
  const lines = [
    `Oi! Acabei de fazer o pedido #${String(orderId).slice(0, 8)} no site da ${brand.name}.`,
    `${shippingToCombine ? 'Subtotal' : 'Total'}: ${brl(total)}${shippingToCombine ? ' (frete a combinar)' : ''}`,
    '',
    'Como faço pra pagar?',
  ]
  return whatsappStoreUrl(lines.join('\n'))
}
