import { supabase } from './supabase'

// Confere se um código é válido pro carrinho atual (usado no checkout,
// antes de criar o pedido). A validação de verdade acontece de novo,
// no servidor, dentro de create_customer_order.
export async function validateCoupon(code, items) {
  const { data, error } = await supabase.rpc('validate_coupon', {
    p_code: code,
    p_items: items.map((i) => ({
      product_variant_id: i.variantId ?? null,
      unit_price: i.price,
      qty: i.qty,
    })),
  })
  if (error) throw error
  return data
}

export async function fetchCoupons() {
  const { data, error } = await supabase
    .from('coupons')
    .select('*, coupon_products(product_id, products(name))')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

// productIds vazio = vale pra todos os itens
// Faixas do cupom progressivo: limpa linhas vazias, ordena pela quantidade
// e não deixa duas faixas com a mesma quantidade mínima.
export function normalizeTiers(tiers = []) {
  const clean = tiers
    .map((t) => ({ min_qty: parseInt(t.min_qty, 10), percent: Number(t.percent) }))
    .filter((t) => t.min_qty >= 1 && t.percent > 0 && t.percent <= 100)
    .sort((a, b) => a.min_qty - b.min_qty)
  return clean.filter((t, i) => i === 0 || t.min_qty !== clean[i - 1].min_qty)
}

export function describeTiers(tiers = []) {
  return (tiers || [])
    .map((t) => `${t.min_qty} ${t.min_qty === 1 ? 'peça' : 'peças'}: ${t.percent}%`)
    .join(' · ')
}

export async function createCoupon({ code, type, value, bundleQty, tiers, maxUses, expiresAt, productIds = [], athleteName, commissionPct }) {
  const cleanTiers = type === 'tiered' ? normalizeTiers(tiers) : null
  if (type === 'tiered' && cleanTiers.length === 0) {
    throw new Error('Preencha pelo menos uma faixa (quantidade e %).')
  }

  const { data, error } = await supabase
    .from('coupons')
    .insert({
      code: code.trim().toUpperCase(),
      type,
      value: type === 'free_shipping' || type === 'tiered' ? null : Number(value),
      bundle_qty: type === 'bundle' ? Number(bundleQty || 2) : null,
      tiers: cleanTiers,
      max_uses: maxUses ? Number(maxUses) : null,
      // O campo de data manda só "2026-11-30"; sem horário o Postgres entende
      // meia-noite UTC (21h do dia anterior em Porto Alegre). Vale até 23h59 do dia.
      expires_at: expiresAt ? `${expiresAt}T23:59:59-03:00` : null,
      // campos da crew só vão quando preenchidos (precisam do SQL add_custos_e_crew.sql)
      ...(athleteName?.trim()
        ? { athlete_name: athleteName.trim(), commission_pct: Number(commissionPct || 0) }
        : {}),
    })
    .select('id')
    .single()
  if (error) throw error

  if (productIds.length > 0) {
    const { error: linkError } = await supabase
      .from('coupon_products')
      .insert(productIds.map((product_id) => ({ coupon_id: data.id, product_id })))
    if (linkError) {
      // não deixa um cupom "pra todos" por engano se a lista de itens falhou
      await supabase.from('coupons').delete().eq('id', data.id)
      throw linkError
    }
  }
}

export async function toggleCouponActive(id, active) {
  const { error } = await supabase.from('coupons').update({ active }).eq('id', id)
  if (error) throw error
}

export async function deleteCoupon(id) {
  const { error } = await supabase.from('coupons').delete().eq('id', id)
  if (error) throw error
}

// Cupom da crew: nome do atleta e % de repasse (vazio = não é da crew)
export async function updateCouponCrew(id, { athleteName, commissionPct }) {
  const name = (athleteName || '').trim()
  const { error } = await supabase
    .from('coupons')
    .update({ athlete_name: name || null, commission_pct: name ? Number(commissionPct || 0) : 0 })
    .eq('id', id)
  if (error) throw error
}
