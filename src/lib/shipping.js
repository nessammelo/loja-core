import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// Frete de reserva: o mesmo valor que o servidor usa quando não há cotação.
export const FALLBACK_SHIPPING_FEE = 25.0

export const onlyDigits = (s) => String(s ?? '').replace(/\D/g, '')

export function formatCep(value) {
  const d = onlyDigits(value).slice(0, 8)
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d
}

const wait = (ms) => new Promise((ok) => setTimeout(ok, ms))

// Pede a cotação pra função da Netlify. Quando a Gubo demora, a função
// responde "pending" e a gente tenta de novo (até 3 vezes).
export async function requestShippingQuote(cep, items) {
  const payload = {
    cep: onlyDigits(cep),
    items: items.map((i) => ({ product_variant_id: i.variantId, qty: i.qty })),
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch('/.netlify/functions/shipping-quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, lastTry: attempt === 3 }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data) throw new Error(data?.error || 'Não deu pra calcular o frete')
    if (!data.pending) return data
    await wait(1500)
  }
  throw new Error('Não deu pra calcular o frete')
}

// Cotação automática quando o CEP tem 8 números. Se a função falhar de vez,
// mostra o frete fixo (o servidor cobra o mesmo sem cotação).
export function useShippingQuote(cep, items) {
  const digits = onlyDigits(cep)
  const itemsKey = items.map((i) => `${i.variantId}:${i.qty}`).sort().join('|')
  const [state, setState] = useState({ status: 'idle', quote: null, key: null })
  const key = digits.length === 8 && items.length > 0 ? `${digits}#${itemsKey}` : null

  useEffect(() => {
    if (!key) return
    let cancelled = false
    setState({ status: 'loading', quote: null, key })
    const timer = setTimeout(async () => {
      try {
        const quote = await requestShippingQuote(digits, items)
        if (!cancelled) setState({ status: 'ready', quote, key })
      } catch {
        if (!cancelled) {
          setState({
            status: 'ready',
            quote: { quoteId: null, price: FALLBACK_SHIPPING_FEE, source: 'fixo' },
            key,
          })
        }
      }
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // items entra pela chave
  }, [key])

  if (!key) return { status: 'idle', quote: null }
  if (state.key !== key) return { status: 'loading', quote: null }
  return state
}

// "chega em até 12 dias úteis (previsão 12/11)"
export function describeDelivery(quote) {
  if (!quote || quote.source === 'fixo' || !quote.days) return null
  let text = `Chega em até ${quote.days} dias úteis`
  if (quote.eta) {
    const [y, m, d] = quote.eta.split('-')
    if (y && m && d) text += ` (previsão ${d}/${m})`
  }
  return text
}

// ---- admin ----

export async function fetchShippingModels() {
  const { data, error } = await supabase.from('shipping_models').select('*').order('model_label')
  if (error) throw error
  return data
}

export async function fetchStoreModelLabels() {
  const { data, error } = await supabase.from('product_variants').select('model_label')
  if (error) throw error
  return [...new Set(data.map((v) => v.model_label).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'pt-BR')
  )
}

export async function saveShippingModel(modelLabel, guboSku, guboModelName) {
  const { error } = await supabase.from('shipping_models').upsert({
    model_label: modelLabel,
    gubo_sku: guboSku,
    gubo_model_name: guboModelName,
    updated_at: new Date().toISOString(),
  })
  if (error) throw error
}

export async function deleteShippingModel(modelLabel) {
  const { error } = await supabase.from('shipping_models').delete().eq('model_label', modelLabel)
  if (error) throw error
}

export async function fetchGuboModels() {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData?.session?.access_token
  const res = await fetch('/.netlify/functions/gubo-models', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data) throw new Error(data?.error || 'Não deu pra ler o catálogo da Gubo')
  return data.models
}
