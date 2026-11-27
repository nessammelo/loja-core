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

// Mensagem pronta do carrinho pro WhatsApp da loja.
// shipping: { fee, service, cep } quando o frete foi calculado; null = a combinar.
export function cartWhatsappMessage(items, subtotal, shipping) {
  const lines = items.map(
    (i) => `• ${i.qty}x ${i.productName} (${[i.modelLabel, i.color, i.size && `Tam. ${i.size}`].filter(Boolean).join(', ')}) - ${brl(i.price * i.qty)}`
  )
  const parts = [`Oi! Quero fazer este pedido na ${brand.name}:`, '', ...lines, '', `Subtotal: ${brl(subtotal)}`]
  if (shipping && shipping.fee != null) {
    parts.push(`Frete${shipping.service ? ` (${shipping.service})` : ''}: ${brl(shipping.fee)}${shipping.cep ? ` · CEP ${shipping.cep}` : ''}`)
    parts.push(`Total: ${brl(subtotal + Number(shipping.fee))}`)
  } else {
    parts.push('Frete: a combinar')
  }
  parts.push('', 'Como faço pra pagar?')
  return parts.join('\n')
}

export function cartWhatsappUrl(items, subtotal, shipping) {
  return whatsappStoreUrl(cartWhatsappMessage(items, subtotal, shipping))
}
