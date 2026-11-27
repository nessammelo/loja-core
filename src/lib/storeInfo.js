import { supabase } from './supabase'

// ---- Avisos da loja (prazo de entrega, trocas) --------------
export const SETTING_KEYS = {
  delivery: 'delivery_info',
  returns: 'returns_info',
}

export async function fetchStoreSettings() {
  const { data, error } = await supabase.from('store_settings').select('key, value')
  if (error || !data) return {}
  return Object.fromEntries(data.map((r) => [r.key, r.value]))
}

export async function saveStoreSetting(key, value) {
  const { error } = await supabase.from('store_settings').upsert({ key, value })
  if (error) throw error
}

// ---- Tabelas de medidas -------------------------------------
// grid = [[cabeçalho...], [linha...]]. No admin é editada como texto:
// uma linha por tamanho, colunas separadas por ; ou TAB (dá pra colar do Excel).
export function parseGrid(text) {
  return (text || '')
    .split('\n')
    .map((line) => line.split(/\t|;/).map((c) => c.trim()))
    .filter((row) => row.some(Boolean))
}

export function gridToText(grid) {
  return (grid || []).map((row) => row.join('; ')).join('\n')
}

export async function fetchSizeCharts() {
  const { data, error } = await supabase.from('size_charts').select('name, grid').order('name')
  if (error || !data) return {}
  return Object.fromEntries(data.map((c) => [c.name, c.grid]))
}

export async function saveSizeChart(name, grid) {
  const { error } = await supabase.from('size_charts').upsert({ name, grid })
  if (error) throw error
}

export async function deleteSizeChart(name) {
  const { error } = await supabase.from('size_charts').delete().eq('name', name)
  if (error) throw error
}

// ---- Especificações do produto ------------------------------
// texto "Tecido: 100% algodão" (uma por linha) <-> [{label, value}]
export function parseSpecs(text) {
  return (text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const i = line.indexOf(':')
      return i === -1
        ? { label: line, value: '' }
        : { label: line.slice(0, i).trim(), value: line.slice(i + 1).trim() }
    })
}

export function specsToText(specs) {
  return (specs || []).map((s) => (s.value ? `${s.label}: ${s.value}` : s.label)).join('\n')
}
