import { supabase } from './supabase'

// Fotos e banners: antes de subir pro Supabase, o próprio navegador do admin
// reduz o tamanho e converte pra WebP. Uma foto de 2 MB em PNG vira ~150 KB.
// Isso é o que segura o "cached egress" do plano gratuito do Supabase.

export const PRODUCT_MAX_SIZE = 1600 // maior lado, em px
export const BANNER_MAX_WIDTH = 2880 // medida do banner: 2880×800
const QUALITY = 0.82
// o nome do arquivo é único (leva a data), então o navegador pode guardar por 1 ano
export const LONG_CACHE = '31536000'
// marca no nome dos arquivos já conferidos: otimizados, ou que já eram leves
// e não compensava mexer (o botão de otimizar pula esses)
export const OPTIMIZED_TAG = '-otm-'

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

async function loadBitmap(blob) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob)
    } catch {
      // cai pro <img> abaixo
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Não deu para ler essa imagem.'))
    }
    img.src = url
  })
}

// Devolve { blob, ext } otimizado, ou null se não compensar
// (GIF/SVG, ou o resultado não ficou menor que o original).
export async function optimizeBlob(blob, { maxWidth, maxHeight }) {
  if (!blob.type.startsWith('image/') || /gif|svg/.test(blob.type)) return null
  const bmp = await loadBitmap(blob)
  const w0 = bmp.width
  const h0 = bmp.height
  const scale = Math.min(1, maxWidth / w0, maxHeight / h0)
  const w = Math.round(w0 * scale)
  const h = Math.round(h0 * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bmp, 0, 0, w, h)
  if (bmp.close) bmp.close()

  let out = await canvasToBlob(canvas, 'image/webp', QUALITY)
  let ext = 'webp'
  // navegador que não gera WebP devolve PNG: aí usa JPG
  if (!out || out.type !== 'image/webp') {
    out = await canvasToBlob(canvas, 'image/jpeg', 0.85)
    ext = 'jpg'
  }
  if (!out || out.size >= blob.size * 0.9) return null
  return { blob: out, ext }
}

export function limitsFor(bucket) {
  return bucket === 'site-banners'
    ? { maxWidth: BANNER_MAX_WIDTH, maxHeight: BANNER_MAX_WIDTH }
    : { maxWidth: PRODUCT_MAX_SIZE, maxHeight: PRODUCT_MAX_SIZE }
}

// Sobe uma imagem já otimizada (ou a original, se não compensar) com cache longo.
// baseName: nome sem extensão, já "limpo".
export async function uploadOptimized(bucket, fileOrBlob, baseName, originalExt) {
  let body = fileOrBlob
  let ext = (originalExt || 'jpg').toLowerCase()
  let tag = '-'
  try {
    const opt = await optimizeBlob(fileOrBlob, limitsFor(bucket))
    if (opt) {
      body = opt.blob
      ext = opt.ext
    }
    // sem opt = a foto já era leve (ou é GIF/SVG): sobe como está, mas marcada
    // como conferida, pra não aparecer no aviso de "Fotos pesadas"
    tag = OPTIMIZED_TAG
  } catch {
    // não conseguiu otimizar: sobe a original mesmo
  }
  const path = `${baseName}${tag}${Date.now()}.${ext}`
  const { error } = await supabase.storage.from(bucket).upload(path, body, {
    cacheControl: LONG_CACHE,
    contentType: body.type || undefined,
  })
  if (error) throw error
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return { url: data.publicUrl, optimized: tag === OPTIMIZED_TAG, size: body.size }
}

// ".../storage/v1/object/public/<bucket>/<path>" -> { bucket, path }
export function parseStorageUrl(url) {
  const m = /\/storage\/v1\/object\/public\/([^/]+)\/([^?#]+)/.exec(url || '')
  if (!m) return null
  return { bucket: m[1], path: decodeURIComponent(m[2]) }
}

export function isOptimizedUrl(url) {
  const p = parseStorageUrl(url)
  return !!p && p.path.includes(OPTIMIZED_TAG)
}

// ---------- otimizar as fotos que já estão no ar ----------

function collectProductUrls(row) {
  const urls = []
  if (row.image_url) urls.push(row.image_url)
  for (const u of row.image_urls || []) urls.push(u)
  const ci = row.color_images && typeof row.color_images === 'object' ? row.color_images : {}
  for (const list of Object.values(ci)) for (const u of list || []) urls.push(u)
  return urls
}

// Lista o que ainda falta otimizar (fotos de produto + banners).
export async function findUnoptimizedImages() {
  const [{ data: products, error: e1 }, { data: banners, error: e2 }] = await Promise.all([
    supabase.from('products').select('id, image_url, image_urls, color_images'),
    supabase.from('banners').select('id, image_url'),
  ])
  if (e1) throw e1
  if (e2) throw e2
  const urls = new Set()
  for (const p of products || []) for (const u of collectProductUrls(p)) urls.add(u)
  for (const b of banners || []) if (b.image_url) urls.add(b.image_url)
  const pending = [...urls].filter((u) => parseStorageUrl(u) && !isOptimizedUrl(u))
  return { pending, products: products || [], banners: banners || [] }
}

function replaceAll(list, map) {
  return (list || []).map((u) => map.get(u) || u)
}

// Baixa cada imagem, otimiza, sobe a versão nova e troca os links nos produtos
// e banners. Os arquivos antigos ficam no Storage (nada quebra se algo falhar).
// onProgress({ done, total, current, savedBytes, failed })
export async function optimizeExistingImages(onProgress = () => {}) {
  const { pending, products, banners } = await findUnoptimizedImages()
  const map = new Map()
  const failed = []
  let savedBytes = 0
  let done = 0
  const total = pending.length
  onProgress({ done, total, current: null, savedBytes, failed })

  for (const url of pending) {
    const { bucket, path } = parseStorageUrl(url)
    const name = path.split('/').pop()
    onProgress({ done, total, current: name, savedBytes, failed })
    try {
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) throw new Error(`download ${res.status}`)
      const blob = await res.blob()
      const opt = await optimizeBlob(blob, limitsFor(bucket))
      if (opt) {
        const base = name.replace(/\.[^.]+$/, '').replace(/-\d{10,}$/, '')
        const newPath = `${base}${OPTIMIZED_TAG}${Date.now()}.${opt.ext}`
        const { error } = await supabase.storage.from(bucket).upload(newPath, opt.blob, {
          cacheControl: LONG_CACHE,
          contentType: opt.blob.type,
        })
        if (error) throw error
        map.set(url, supabase.storage.from(bucket).getPublicUrl(newPath).data.publicUrl)
        savedBytes += blob.size - opt.blob.size
      } else {
        // já era leve: só copia com a marca no nome, pra sair do aviso
        const ext = name.includes('.') ? name.split('.').pop() : 'jpg'
        const base = name.replace(/\.[^.]+$/, '').replace(/-\d{10,}$/, '')
        const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : ''
        const newPath = `${dir}${base}${OPTIMIZED_TAG}${Date.now()}.${ext}`
        const { error } = await supabase.storage.from(bucket).copy(path, newPath)
        if (error) throw error
        map.set(url, supabase.storage.from(bucket).getPublicUrl(newPath).data.publicUrl)
      }
    } catch (err) {
      failed.push({ name, message: err.message })
    }
    done += 1
    onProgress({ done, total, current: name, savedBytes, failed })
  }

  // troca os links (só nas linhas que mudaram)
  let updatedProducts = 0
  let updatedBanners = 0
  for (const p of products) {
    const before = collectProductUrls(p)
    if (!before.some((u) => map.has(u))) continue
    const ci = p.color_images && typeof p.color_images === 'object' ? p.color_images : {}
    const colorImages = {}
    for (const [k, list] of Object.entries(ci)) colorImages[k] = replaceAll(list, map)
    const { error } = await supabase
      .from('products')
      .update({
        image_url: p.image_url ? map.get(p.image_url) || p.image_url : p.image_url,
        image_urls: replaceAll(p.image_urls, map),
        color_images: colorImages,
      })
      .eq('id', p.id)
    if (error) failed.push({ name: `produto ${p.id}`, message: error.message })
    else updatedProducts += 1
  }
  for (const b of banners) {
    if (!map.has(b.image_url)) continue
    const { error } = await supabase.from('banners').update({ image_url: map.get(b.image_url) }).eq('id', b.id)
    if (error) failed.push({ name: `banner ${b.id}`, message: error.message })
    else updatedBanners += 1
  }

  return { total, optimized: map.size, savedBytes, failed, updatedProducts, updatedBanners }
}
