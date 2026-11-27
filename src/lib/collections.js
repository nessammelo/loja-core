import { supabase } from './supabase'

// Configuração das coleções feita no admin: ordem e quais estão ocultas.
// Se a tabela ainda não existe/está vazia, a loja segue com o padrão.
export async function fetchCollectionSettings() {
  const { data, error } = await supabase.from('collection_order').select('*')
  if (error) return { order: {}, hidden: new Set(), images: {} }
  return {
    order: Object.fromEntries(data.map((r) => [r.collection, r.sort_order])),
    hidden: new Set(data.filter((r) => r.hidden).map((r) => r.collection)),
    images: Object.fromEntries(data.filter((r) => r.image_url).map((r) => [r.collection, r.image_url])),
  }
}

// Foto do card da coleção na home (precisa do SQL add_home_vitrine.sql)
export async function saveCollectionImage(collection, imageUrl) {
  const { error } = await supabase
    .from('collection_order')
    .upsert({ collection, image_url: imageUrl || null }, { onConflict: 'collection' })
  if (error) throw error
}

// list = [{ name, hidden }] na ordem final (primeiro = aparece primeiro na loja)
export async function saveCollectionSettings(list) {
  const rows = list.map((c, i) => ({
    collection: c.name,
    sort_order: i,
    hidden: Boolean(c.hidden),
  }))
  const { error } = await supabase.from('collection_order').upsert(rows, { onConflict: 'collection' })
  if (error) throw error
}

// Mesmo nome que a Home usa pra agrupar produtos sem coleção.
export const DEFAULT_COLLECTION = 'Loja'

// Ordena [[nome, itens], ...] pela ordem salva; coleções sem posição vão pro fim,
// mantendo a ordem em que apareceram.
export function sortGroups(groups, order) {
  return groups
    .map((g, i) => ({ g, i }))
    .sort((a, b) => {
      const pa = order[a.g[0]] ?? Number.MAX_SAFE_INTEGER
      const pb = order[b.g[0]] ?? Number.MAX_SAFE_INTEGER
      return pa - pb || a.i - b.i
    })
    .map((x) => x.g)
}

// Parte final do link da coleção: /colecao/<slug>
export function collectionSlug(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}
