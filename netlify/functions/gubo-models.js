import { createClient } from '@supabase/supabase-js'

// Admin: lista os tipos de peça que existem em "Meus produtos" na Gubo, cada
// um com um SKU de exemplo. É esse SKU que o frete usa pra saber o peso.

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const GUBO_URL =
  process.env.GUBO_API_URL ||
  'https://kx75xapy8azwdvdnd4brts7y098e5qvg.buildprintusercontent.com/gubo-api/latest/live/v1'

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function gubo(path) {
  const res = await fetch(`${GUBO_URL}${path}`, {
    headers: { Authorization: `Bearer ${process.env.GUBO_API_KEY}` },
    signal: AbortSignal.timeout(8000),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.erro?.mensagem || `Gubo respondeu ${res.status}`)
  return body
}

export default async (req) => {
  // só quem está logado no admin
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  const { data: auth } = token ? await supabase.auth.getUser(token) : { data: null }
  if (!auth?.user) return json({ error: 'Faça login no admin.' }, 401)

  if (!process.env.GUBO_API_KEY) return json({ error: 'GUBO_API_KEY não configurada na Netlify.' }, 500)

  try {
    const products = []
    let cursor = null
    for (let page = 0; page < 10; page++) {
      const list = await gubo(`/catalogo/produtos?limite=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
      products.push(...list.dados)
      if (!list.tem_mais) break
      cursor = list.proximo_cursor
    }

    // um produto ativo por tipo de peça
    const byModel = new Map()
    for (const p of products) {
      if (p.situacao !== 'ativo' || !p.modelo?.codigo || byModel.has(p.modelo.codigo)) continue
      byModel.set(p.modelo.codigo, p)
    }

    const models = []
    for (const [code, p] of byModel) {
      const variants = await gubo(`/catalogo/variantes?produto=${encodeURIComponent(p.codigo)}&disponivel=true&limite=1`)
      const sku = variants.dados?.[0]?.sku
      if (sku) models.push({ code, name: p.modelo.nome, sku, example: p.nome })
    }
    models.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    return json({ models })
  } catch (err) {
    return json({ error: err.message }, 502)
  }
}
