import { supabase } from './supabase'
import { uploadOptimized } from './imageOptimize'

// ordem "natural" dos tamanhos de camiseta
const SIZE_ORDER = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG', 'XXG', 'EXG', 'G1', 'G2', 'G3']
export function sortSizes(sizes) {
  const rank = (s) => {
    const i = SIZE_ORDER.indexOf(String(s).toUpperCase())
    return i === -1 ? 999 : i
  }
  return [...sizes].sort((a, b) => rank(a) - rank(b) || String(a).localeCompare(String(b)))
}

// chave das fotos de um modelo numa cor: "Oversized||Preta"
export const photoKey = (modelLabel, color) => `${modelLabel}||${color}`

// fotos mostradas: do modelo+cor; senão da cor (todos os modelos); senão as gerais
export function photosFor(product, modelLabel, color) {
  const own = product.colorImages[photoKey(modelLabel, color)]
  if (own && own.length > 0) return own
  const byColor = product.colorImages[color]
  if (byColor && byColor.length > 0) return byColor
  return product.images
}

// cores padrão (a tabela product_colors pode acrescentar/alterar)
export const DEFAULT_COLOR_HEX = {
  Branca: '#ffffff',
  Preta: '#111111',
  'Off White': '#e9e4d6',
  Marrom: '#5b4636',
  'Verde Oliva': '#5a5a2e',
}
export const FALLBACK_COLOR_HEX = '#8f8d84'

let paletteCache = null
export async function fetchColorPalette(force = false) {
  if (paletteCache && !force) return paletteCache
  const palette = { ...DEFAULT_COLOR_HEX }
  try {
    const { data } = await supabase.from('product_colors').select('name, hex')
    for (const c of data || []) palette[c.name] = c.hex
  } catch {
    // tabela ainda não existe: segue com as cores padrão
  }
  paletteCache = palette
  return palette
}

export async function saveColor(name, hex) {
  const { error } = await supabase.from('product_colors').upsert({ name, hex })
  if (error) throw error
  paletteCache = null
}

function groupVariants(variants, basePrice) {
  const modelsMap = new Map()

  for (const v of variants) {
    if (!modelsMap.has(v.model_label)) {
      modelsMap.set(v.model_label, {
        id: v.model_label,
        label: v.model_label,
        price: Number(v.price ?? basePrice),
        sizes: [],
        colors: [],
      })
    }
    const model = modelsMap.get(v.model_label)
    if (!model.sizes.includes(v.size)) model.sizes.push(v.size)
    if (!model.colors.includes(v.color)) model.colors.push(v.color)
  }

  // mais barato primeiro (é o modelo que abre selecionado)
  const models = Array.from(modelsMap.values())
    .map((m) => ({ ...m, sizes: sortSizes(m.sizes) }))
    .sort((a, b) => a.price - b.price || a.label.localeCompare(b.label))

  const colors = []
  for (const m of models) for (const c of m.colors) if (!colors.includes(c)) colors.push(c)

  return { models, colors }
}

function shapeProduct(row) {
  const { models, colors } = groupVariants(row.product_variants || [], row.base_price)
  const images = row.image_urls && row.image_urls.length > 0
    ? row.image_urls
    : row.image_url ? [row.image_url] : []
  const colorImages = row.color_images && typeof row.color_images === 'object' ? row.color_images : {}
  const prices = models.map((m) => m.price)
  const minPrice = prices.length ? Math.min(...prices) : Number(row.base_price)
  const maxPrice = prices.length ? Math.max(...prices) : Number(row.base_price)
  // vitrine: foto da primeira cor do primeiro modelo, se existir; senão a primeira geral
  const first = models[0]
  const cover =
    (first && first.colors[0] && photosFor({ colorImages, images }, first.label, first.colors[0])[0]) ||
    images[0] ||
    null
  return {
    id: row.slug,
    dbId: row.id,
    name: row.name,
    active: row.active !== false,
    collection: row.collection,
    tagline: row.collection ? row.collection.replace(/-/g, ' ').toUpperCase() : '',
    price: minPrice,
    priceFrom: maxPrice > minPrice,
    description: row.description,
    image: cover,
    images,
    colorImages,
    specs: Array.isArray(row.specs) ? row.specs : [],
    modelCharts: row.model_charts && typeof row.model_charts === 'object' ? row.model_charts : {},
    models,
    colors,
  }
}

export async function fetchProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('*, product_variants(*)')
    .eq('active', true)
  if (error) throw error
  return data.map(shapeProduct)
}

export async function fetchProductBySlug(slug) {
  const { data, error } = await supabase
    .from('products')
    .select('*, product_variants(*)')
    .eq('slug', slug)
    .single()
  if (error) return null
  return shapeProduct(data)
}

export async function fetchVariantId(dbProductId, modelLabel, size, color) {
  const { data } = await supabase
    .from('product_variants')
    .select('id')
    .eq('product_id', dbProductId)
    .eq('model_label', modelLabel)
    .eq('size', size)
    .eq('color', color)
    .single()
  return data?.id ?? null
}

// ---- Admin: cadastro/edição de produto ----------------------

export async function fetchAllProductsAdmin() {
  const { data, error } = await supabase
    .from('products')
    .select('*, product_variants(*)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data.map(shapeProduct)
}

export async function fetchProductByIdAdmin(dbId) {
  const { data, error } = await supabase
    .from('products')
    .select('*, product_variants(*)')
    .eq('id', dbId)
    .single()
  if (error) throw error
  return data
}

export function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export async function uploadProductImage(file) {
  const ext = file.name.split('.').pop()
  const base = slugify(file.name.replace(/\.[^.]+$/, '')) || 'foto'
  const { url } = await uploadOptimized('product-images', file, base, ext)
  return url
}

// Salva o produto e sincroniza as variantes SEM trocar os ids das que já
// existem (carrinhos e pedidos continuam apontando pra variante certa).
// models: [{ label, price, sizes: [...], colors: [...] }]
export async function saveProduct({
  id, // dbId — presente quando é edição
  name,
  slug,
  collection,
  description,
  imageUrls, // fotos gerais
  colorImages, // { 'Preta': [urls], ... }
  specs, // [{ label, value }]
  modelCharts, // { 'Oversized': 'Camiseta Oversized' }
  models,
}) {
  const prices = models.map((m) => Number(m.price))
  const payload = {
    name,
    slug,
    collection: collection || null,
    description,
    base_price: Math.min(...prices), // preço "a partir de"
    image_urls: imageUrls || [],
    color_images: colorImages || {},
    specs: specs || [],
    model_charts: modelCharts || {},
  }

  let productId = id
  if (id) {
    const { error } = await supabase.from('products').update(payload).eq('id', id)
    if (error) throw error
  } else {
    const { data, error } = await supabase.from('products').insert(payload).select('id').single()
    if (error) throw error
    productId = data.id
  }

  // combinações desejadas
  const wanted = new Map() // chave -> { model_label, size, color, price }
  for (const m of models) {
    for (const s of m.sizes) {
      for (const c of m.colors) {
        wanted.set(`${m.label}|${s}|${c}`, {
          model_label: m.label,
          size: s,
          color: c,
          price: Number(m.price),
        })
      }
    }
  }

  const { data: existing, error: exError } = await supabase
    .from('product_variants')
    .select('id, model_label, size, color, price')
    .eq('product_id', productId)
  if (exError) throw exError

  const toDelete = []
  const priceChanges = new Map() // modelo -> novo preço
  const seen = new Set()
  for (const v of existing || []) {
    const key = `${v.model_label}|${v.size}|${v.color}`
    const w = wanted.get(key)
    if (!w || seen.has(key)) {
      toDelete.push(v.id)
    } else {
      seen.add(key)
      if (Number(v.price) !== w.price) priceChanges.set(v.model_label, w.price)
    }
  }

  if (toDelete.length > 0) {
    const { error } = await supabase.from('product_variants').delete().in('id', toDelete)
    if (error) throw error
  }
  for (const [modelLabel, price] of priceChanges) {
    const { error } = await supabase
      .from('product_variants')
      .update({ price })
      .eq('product_id', productId)
      .eq('model_label', modelLabel)
    if (error) throw error
  }

  const inserts = []
  for (const [key, w] of wanted) {
    if (seen.has(key)) continue
    inserts.push({
      product_id: productId,
      model_label: w.model_label,
      size: w.size,
      color: w.color,
      price: w.price,
      sku: `${slug}-${slugify(w.model_label)}-${w.size}-${slugify(w.color)}`.toUpperCase(),
    })
  }
  if (inserts.length > 0) {
    const { error } = await supabase.from('product_variants').insert(inserts)
    if (error) throw error
  }

  return productId
}

// ocultar/mostrar na loja sem apagar (o link direto do produto continua abrindo)
export async function setProductActive(dbId, active) {
  const { error } = await supabase.from('products').update({ active }).eq('id', dbId)
  if (error) throw error
}

export async function deleteProduct(dbId) {
  const { error } = await supabase.from('products').delete().eq('id', dbId)
  if (error) throw error
}
