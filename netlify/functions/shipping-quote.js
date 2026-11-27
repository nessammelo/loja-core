import { createClient } from '@supabase/supabase-js'
import { brand } from '../../src/brand.js'

// Cota o frete na Gubo e guarda a cotação no Supabase. O pedido usa o valor
// guardado (pelo id), nunca o que o navegador mandar.
// Se a Gubo falhar, guarda o frete fixo de reserva, pra nenhuma venda travar.
// Cliente com features.shipping = 'fixed' não usa a Gubo: sempre frete fixo.

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const GUBO_URL =
  process.env.GUBO_API_URL ||
  'https://kx75xapy8azwdvdnd4brts7y098e5qvg.buildprintusercontent.com/gubo-api/latest/live/v1'
const FALLBACK_FEE = 25.0
// A função da Netlify tem pouco tempo de vida; acima disso o navegador
// tenta de novo (a Gubo reaproveita a cotação pronta na hora).
const GUBO_TIMEOUT_MS = 8000

const normalize = (s) => String(s ?? '').trim().toLowerCase()

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function saveQuote(cep, items, data) {
  const { data: id, error } = await supabase.rpc('save_shipping_quote', {
    p_cep: cep,
    p_items: items,
    p_price: data.price,
    p_source: data.source,
    p_service_code: data.serviceCode ?? null,
    p_service_name: data.serviceName ?? null,
    p_days: data.days ?? null,
    p_eta: data.eta ?? null,
    p_gubo_quote_id: data.guboQuoteId ?? null,
    p_note: data.note ?? null,
  })
  if (error) throw error
  return { quoteId: id, ...data }
}

function fallback(note) {
  return { price: FALLBACK_FEE, source: 'fixo', note }
}

// monta os itens da Gubo: cada modelo da loja vira o SKU de exemplo da peça
async function buildGuboItems(items) {
  const ids = items.map((i) => i.product_variant_id)
  const { data: variants, error } = await supabase
    .from('product_variants')
    .select('id, model_label')
    .in('id', ids)
  if (error) throw error

  const { data: models, error: modelsError } = await supabase
    .from('shipping_models')
    .select('model_label, gubo_sku')
  if (modelsError) throw modelsError

  const skuByModel = new Map(models.map((m) => [normalize(m.model_label), m.gubo_sku]))
  const variantById = new Map(variants.map((v) => [v.id, v]))

  const qtyBySku = new Map()
  const missing = new Set()
  for (const item of items) {
    const variant = variantById.get(item.product_variant_id)
    if (!variant) return { error: 'item_inexistente' }
    const sku = skuByModel.get(normalize(variant.model_label))
    if (!sku) {
      missing.add(variant.model_label)
      continue
    }
    qtyBySku.set(sku, (qtyBySku.get(sku) || 0) + item.qty)
  }

  if (missing.size > 0) return { missing: [...missing] }
  return { guboItems: [...qtyBySku].map(([sku, quantidade]) => ({ sku, quantidade })) }
}

async function askGubo(cep, guboItems) {
  const res = await fetch(`${GUBO_URL}/fretes/cotacoes`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.GUBO_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ cep, itens: guboItems, entrega: { preferencia: 'mais_barata' } }),
    signal: AbortSignal.timeout(GUBO_TIMEOUT_MS),
  })
  const body = await res.json().catch(() => null)
  return { status: res.status, body }
}

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  let payload
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Pedido inválido' }, 400)
  }

  const cep = String(payload.cep ?? '').replace(/\D/g, '')
  const rawItems = Array.isArray(payload.items) ? payload.items : []
  const items = rawItems
    .map((i) => ({ product_variant_id: String(i.product_variant_id ?? ''), qty: Number(i.qty) }))
    .filter((i) => i.product_variant_id && Number.isInteger(i.qty) && i.qty > 0)

  if (cep.length !== 8) return json({ error: 'CEP inválido' }, 400)
  if (items.length === 0 || items.length !== rawItems.length || items.length > 50) {
    return json({ error: 'Carrinho inválido' }, 400)
  }
  // última tentativa do navegador: não espera mais a Gubo
  const lastTry = payload.lastTry === true

  try {
    if (brand.features.shipping !== 'gubo') {
      return json(await saveQuote(cep, items, fallback('frete fixo da loja')))
    }
    const built = await buildGuboItems(items)
    if (built.error) return json({ error: 'Um item do carrinho não existe mais.' }, 400)
    if (built.missing) {
      return json(await saveQuote(cep, items, fallback(`modelo sem ligação: ${built.missing.join(', ')}`)))
    }
    if (!process.env.GUBO_API_KEY) {
      return json(await saveQuote(cep, items, fallback('GUBO_API_KEY não configurada')))
    }

    let gubo
    try {
      gubo = await askGubo(cep, built.guboItems)
    } catch (err) {
      if (err.name === 'TimeoutError' && !lastTry) return json({ pending: true })
      return json(await saveQuote(cep, items, fallback(`gubo sem resposta: ${err.message}`)))
    }

    const cot = gubo.body
    if (gubo.status === 202 || cot?.situacao === 'pendente') {
      if (!lastTry) return json({ pending: true })
      return json(await saveQuote(cep, items, fallback('gubo demorou demais')))
    }

    if (gubo.status !== 201 || !cot || cot.situacao !== 'pronta' || !cot.escolha) {
      const motivo = cot?.sem_escolha?.codigo || cot?.erro?.codigo || cot?.erro?.tipo || `http ${gubo.status}`
      return json(await saveQuote(cep, items, fallback(`gubo: ${motivo}`)))
    }

    const opcao = (cot.opcoes || []).find((o) => o.servico === cot.escolha.servico) || {}
    return json(
      await saveQuote(cep, items, {
        price: cot.escolha.preco_centavos / 100,
        source: 'gubo',
        serviceCode: cot.escolha.servico,
        serviceName: opcao.nome || cot.escolha.servico,
        days: opcao.prazo_total_dias_uteis ?? null,
        eta: cot.escolha.previsao_entrega ?? null,
        guboQuoteId: cot.id,
      })
    )
  } catch (err) {
    return json({ error: err.message || 'Não deu pra calcular o frete' }, 500)
  }
}
