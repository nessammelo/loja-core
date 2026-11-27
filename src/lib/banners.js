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

// botão do banner: sem link = sem botão
export async function updateBannerCta(id, { ctaText, ctaLink }) {
  const { error } = await supabase
    .from('banners')
    .update({ cta_text: ctaText?.trim() || null, cta_link: ctaLink?.trim() || null })
    .eq('id', id)
  if (error) throw error
}

export async function deleteBanner(id) {
  const { error } = await supabase.from('banners').delete().eq('id', id)
  if (error) throw error
}
