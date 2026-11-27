import { supabase } from './supabase'

// Custos por modelo (tabela product_costs, só o admin enxerga).
// Precisa do SQL supabase/add_custos_e_crew.sql.

export const BIG_SIZES = ['XG', 'XGG', 'XXG', 'EXG', 'G1', 'G2', 'G3', 'G4']

export function isBigSize(size) {
  return BIG_SIZES.includes(String(size || '').toUpperCase())
}

// { 'Padrão': { cost: '55', costBig: '60' }, ... }
export async function fetchProductCosts(productId) {
  const { data, error } = await supabase
    .from('product_costs')
    .select('model_label, cost, cost_big')
    .eq('product_id', productId)
  if (error) throw error
  const out = {}
  for (const r of data || []) {
    out[r.model_label] = {
      cost: r.cost == null ? '' : String(r.cost),
      costBig: r.cost_big == null ? '' : String(r.cost_big),
    }
  }
  return out
}

// models: [{ label, cost, costBig }] — modelo sem custo preenchido é ignorado
export async function saveProductCosts(productId, models) {
  const rows = models
    .filter((m) => m.cost !== '' && m.cost != null && !Number.isNaN(Number(m.cost)))
    .map((m) => ({
      product_id: productId,
      model_label: m.label,
      cost: Number(m.cost),
      cost_big: m.costBig === '' || m.costBig == null ? null : Number(m.costBig),
      updated_at: new Date().toISOString(),
    }))

  // apaga custos de modelos que não existem mais (ou ficaram em branco)
  const keep = rows.map((r) => r.model_label)
  const { data: existing, error: exError } = await supabase
    .from('product_costs')
    .select('model_label')
    .eq('product_id', productId)
  if (exError) throw exError
  const toDelete = (existing || []).map((r) => r.model_label).filter((l) => !keep.includes(l))
  if (toDelete.length) {
    const { error } = await supabase
      .from('product_costs')
      .delete()
      .eq('product_id', productId)
      .in('model_label', toDelete)
    if (error) throw error
  }

  if (rows.length) {
    const { error } = await supabase.from('product_costs').upsert(rows, { onConflict: 'product_id,model_label' })
    if (error) throw error
  }
}

// Mapa "Nome do produto|Modelo" -> { cost, costBig }, usado no relatório
// pra pedidos antigos (de antes do custo existir).
export async function fetchCostMap() {
  const { data, error } = await supabase
    .from('product_costs')
    .select('model_label, cost, cost_big, products(name)')
  if (error) throw error
  const map = {}
  for (const r of data || []) {
    if (!r.products?.name) continue
    map[`${r.products.name}|${r.model_label}`] = {
      cost: Number(r.cost),
      costBig: r.cost_big == null ? null : Number(r.cost_big),
    }
  }
  return map
}

export const DEFAULT_FEES = { pix: 0.99, card: 4.98 }

export async function fetchFees() {
  const { data, error } = await supabase.from('admin_settings').select('key, value')
  if (error) throw error
  const byKey = Object.fromEntries((data || []).map((r) => [r.key, r.value]))
  const num = (v, d) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Number(v))
  return {
    pix: num(byKey.mp_fee_pix, DEFAULT_FEES.pix),
    card: num(byKey.mp_fee_card, DEFAULT_FEES.card),
  }
}

export async function saveFees({ pix, card }) {
  const { error } = await supabase.from('admin_settings').upsert([
    { key: 'mp_fee_pix', value: String(Number(pix)) },
    { key: 'mp_fee_card', value: String(Number(card)) },
  ])
  if (error) throw error
}
