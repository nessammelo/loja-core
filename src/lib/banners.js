import { supabase } from './supabase'
import { uploadOptimized } from './imageOptimize'

export async function fetchBanners() {
  const { data, error } = await supabase
    .from('banners')
    .select('*')
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

// salva a ordem escolhida no admin: posição 0, 1, 2... na ordem da lista
export async function reorderBanners(ids) {
  const results = await Promise.all(
    ids.map((id, position) => supabase.from('banners').update({ position }).eq('id', id))
  )
  const failed = results.find((r) => r.error)
  if (failed) throw failed.error
}

export async function uploadBannerImage(file) {
  const ext = file.name.split('.').pop()
  const { url } = await uploadOptimized('site-banners', file, 'banner', ext)
  return url
}

export async function createBanner({ imageUrl, altText, position }) {
  const { error } = await supabase
    .from('banners')
    .insert({ image_url: imageUrl, alt_text: altText, position: position ?? 0 })
  if (error) throw error
}

// botão do banner: sem link = sem botão. title/subtitle = texto em cima da foto
// (precisa do SQL add_home_vitrine.sql; sem ele, salva só o botão).
export async function updateBannerCta(id, { ctaText, ctaLink, title, subtitle }) {
  const base = { cta_text: ctaText?.trim() || null, cta_link: ctaLink?.trim() || null }
  const withText = { ...base, title: title?.trim() || null, subtitle: subtitle?.trim() || null }
  let { error } = await supabase.from('banners').update(withText).eq('id', id)
  if (error && /title|subtitle/.test(error.message || '')) {
    ;({ error } = await supabase.from('banners').update(base).eq('id', id))
  }
  if (error) throw error
}

export async function deleteBanner(id) {
  const { error } = await supabase.from('banners').delete().eq('id', id)
  if (error) throw error
}
