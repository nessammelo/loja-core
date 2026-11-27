import { brand } from '../brand'

// Cálculos do relatório de vendas (Admin > Relatório).
// Tudo é feito em cima dos pedidos que o admin já carrega (fetchOrders),
// então não precisa de SQL novo.

// Pedido conta como venda quando o pagamento foi aprovado e ele já andou
// para a fila de produção. "aguardando pagamento" fica de fora, assim como
// pagamentos devolvidos/cancelados no Mercado Pago.
const SOLD_STATUSES = ['novo', 'repassado', 'enviado', 'entregue']
const LOST_PAYMENTS = ['rejected', 'cancelled', 'refunded', 'charged_back']

export function isSale(o) {
  return SOLD_STATUSES.includes(o.status) && !LOST_PAYMENTS.includes(o.payment_status)
}

export function isManual(o) {
  return o.payment_method === 'venda_manual'
}

// Datas sempre no fuso de Porto Alegre (America/Sao_Paulo).
const TZ = 'America/Sao_Paulo'
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })

export function localDay(date) {
  return dayFmt.format(new Date(date)) // AAAA-MM-DD
}

function shiftDay(day, delta) {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

export const PERIODS = [
  { id: 'hoje', label: 'Hoje' },
  { id: '7d', label: '7 dias' },
  { id: '30d', label: '30 dias' },
  { id: 'mes', label: 'Este mês' },
  { id: 'mes-passado', label: 'Mês passado' },
  { id: 'tudo', label: 'Tudo' },
  { id: 'custom', label: 'Escolher datas' },
]

// Devolve { from, to } (dias AAAA-MM-DD, inclusive). from null = sem limite.
export function periodRange(id, now = new Date(), custom = {}) {
  const today = localDay(now)
  switch (id) {
    case 'hoje':
      return { from: today, to: today }
    case '7d':
      return { from: shiftDay(today, -6), to: today }
    case '30d':
      return { from: shiftDay(today, -29), to: today }
    case 'mes':
      return { from: `${today.slice(0, 8)}01`, to: today }
    case 'mes-passado': {
      const lastOfPrev = shiftDay(`${today.slice(0, 8)}01`, -1)
      return { from: `${lastOfPrev.slice(0, 8)}01`, to: lastOfPrev }
    }
    case 'custom':
      return { from: custom.from || null, to: custom.to || today }
    default:
      return { from: null, to: today }
  }
}

function inRange(o, { from, to }) {
  const d = localDay(o.created_at)
  return (!from || d >= from) && (!to || d <= to)
}

function rank(map) {
  return [...map.entries()]
    .map(([label, v]) => ({ label, ...v }))
    .sort((a, b) => b.qty - a.qty || b.revenue - a.revenue)
}

function bump(map, key, qty, revenue) {
  const cur = map.get(key) || { qty: 0, revenue: 0 }
  cur.qty += qty
  cur.revenue += revenue
  map.set(key, cur)
}

const BIG = ['XG', 'XGG', 'XXG', 'EXG', 'G1', 'G2', 'G3', 'G4']
const round2 = (v) => Math.round(v * 100) / 100

// Custo do item: o congelado na venda (unit_cost) ou, pra pedidos antigos,
// o custo atual cadastrado no produto. null = sem custo cadastrado.
export function itemCost(i, costMap = {}) {
  if (i.unit_cost != null) return Number(i.unit_cost)
  const c = costMap[`${i.product_name}|${i.model_label}`]
  if (!c) return null
  return BIG.includes(String(i.size).toUpperCase()) && c.costBig != null ? c.costBig : c.cost
}

// Lucro e repasse de um pedido.
// lucro = valor das peças (com desconto, sem frete) − custo − repasse − taxa MP
export function orderFinance(o, { costMap = {}, fees = { pix: 0.99, card: 4.98 }, crewByCode = {} } = {}) {
  const total = Number(o.total || 0)
  const net = total - Number(o.shipping_fee || 0)
  let cost = 0
  let missing = 0
  for (const i of o.order_items || []) {
    const c = itemCost(i, costMap)
    if (c == null) missing += Number(i.qty || 0)
    else cost += c * Number(i.qty || 0)
  }
  const live = o.coupon_code ? crewByCode[o.coupon_code.toUpperCase()] : null
  const athlete = o.crew_athlete || live?.athlete || null
  const pct = athlete ? Number(o.crew_athlete ? o.crew_commission_pct : live?.pct) || 0 : 0
  const commission = round2((net * pct) / 100)
  const rate = isManual(o) ? 0 : o.payment_method === 'pix' ? fees.pix : fees.card
  const fee = round2((total * rate) / 100)
  return { net, cost: round2(cost), missing, athlete, pct, commission, fee, profit: round2(net - cost - commission - fee) }
}

const SIZE_ORDER = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG', 'XXG', 'G1', 'G2', 'G3']

export function buildReport(orders, range, finance = {}) {
  const sales = orders.filter((o) => isSale(o) && inRange(o, range))

  let revenue = 0
  let discount = 0
  let shipping = 0
  let pieces = 0
  const byProduct = new Map()
  const byModel = new Map()
  const bySize = new Map()
  const byColor = new Map()
  const byCoupon = new Map()
  const byRef = new Map()
  const byDay = new Map()
  let cost = 0
  let fees = 0
  let commission = 0
  let profit = 0
  let net = 0
  let missingCost = 0
  const athletes = new Map()
  const channel = { loja: { orders: 0, revenue: 0 }, manual: { orders: 0, revenue: 0 } }

  for (const o of sales) {
    const total = Number(o.total || 0)
    revenue += total
    discount += Number(o.discount_amount || 0)
    shipping += Number(o.shipping_fee || 0)

    const f = orderFinance(o, finance)
    o._fin = f
    cost += f.cost
    fees += f.fee
    commission += f.commission
    profit += f.profit
    net += f.net
    missingCost += f.missing
    if (f.athlete) {
      const a = athletes.get(f.athlete) || { athlete: f.athlete, coupons: new Set(), orders: [], pieces: 0, base: 0, commission: 0 }
      a.coupons.add(o.coupon_code)
      a.pieces += (o.order_items || []).reduce((s, i) => s + Number(i.qty || 0), 0)
      a.base += f.net
      a.commission += f.commission
      a.orders.push({ day: localDay(o.created_at), id: o.id, customer: o.customers?.name ?? '', net: f.net, commission: f.commission, pct: f.pct })
      athletes.set(f.athlete, a)
    }

    const ch = isManual(o) ? channel.manual : channel.loja
    ch.orders += 1
    ch.revenue += total

    const day = localDay(o.created_at)
    const d = byDay.get(day) || { orders: 0, revenue: 0 }
    d.orders += 1
    d.revenue += total
    byDay.set(day, d)

    if (o.coupon_code) {
      const c = byCoupon.get(o.coupon_code) || { qty: 0, revenue: 0, discount: 0 }
      c.qty += 1
      c.revenue += total
      c.discount += Number(o.discount_amount || 0)
      byCoupon.set(o.coupon_code, c)
    }

    if (o.ref) {
      const r = byRef.get(o.ref) || { qty: 0, revenue: 0, net: 0, coupons: new Set() }
      r.qty += 1
      r.revenue += total
      r.net += f.net
      if (o.coupon_code) r.coupons.add(o.coupon_code)
      byRef.set(o.ref, r)
    }

    for (const i of o.order_items || []) {
      const qty = Number(i.qty || 0)
      const value = Number(i.unit_price || 0) * qty
      pieces += qty
      bump(byProduct, i.product_name, qty, value)
      bump(byModel, i.model_label, qty, value)
      bump(bySize, i.size, qty, value)
      bump(byColor, i.color, qty, value)
    }
  }

  // Barras por dia: preenche os dias sem venda com zero (só quando o período
  // tem começo definido e não passa de ~3 meses; em "Tudo" mostra só dias com venda).
  const days = []
  const from = range.from || (byDay.size ? [...byDay.keys()].sort()[0] : null)
  if (from) {
    let day = from
    let guard = 0
    while (day <= range.to && guard < 400) {
      days.push({ day, ...(byDay.get(day) || { orders: 0, revenue: 0 }) })
      day = shiftDay(day, 1)
      guard += 1
    }
  }

  const sizes = rank(bySize).sort((a, b) => {
    const ia = SIZE_ORDER.indexOf(a.label)
    const ib = SIZE_ORDER.indexOf(b.label)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
  })

  return {
    orders: sales.length,
    revenue,
    discount,
    shipping,
    pieces,
    avgTicket: sales.length ? revenue / sales.length : 0,
    cost: round2(cost),
    fees: round2(fees),
    commission: round2(commission),
    profit: round2(profit),
    margin: net > 0 ? profit / net : 0,
    missingCost,
    athletes: [...athletes.values()]
      .map((a) => ({ ...a, coupons: [...a.coupons], orders: a.orders.sort((x, y) => x.day.localeCompare(y.day)) }))
      .sort((a, b) => b.commission - a.commission),
    products: rank(byProduct),
    models: rank(byModel),
    sizes,
    colors: rank(byColor),
    coupons: [...byCoupon.entries()]
      .map(([label, v]) => ({ label, ...v }))
      .sort((a, b) => b.qty - a.qty),
    refs: [...byRef.entries()]
      .map(([label, v]) => ({ label, ...v, coupons: [...v.coupons] }))
      .sort((a, b) => b.revenue - a.revenue),
    channel,
    days,
    sales,
  }
}

// CSV com uma linha por item vendido (abre direto no Excel/Planilhas).
export function buildCsv(sales, costMap = {}) {
  const head = [
    'Data', 'Pedido', 'Cliente', 'Origem', 'Status', 'Produto', 'Modelo', 'Cor', 'Tamanho',
    'Qtd', 'Preço unit.', 'Custo unit.', 'Cupom', 'Atleta', 'Link (ref)', 'Desconto do pedido', 'Frete do pedido',
    'Total do pedido', 'Taxa MP do pedido', 'Repasse do pedido', 'Lucro do pedido',
  ]
  const num = (v) => Number(v || 0).toFixed(2).replace('.', ',')
  const esc = (v) => {
    const s = String(v ?? '')
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const rows = []
  for (const o of sales) {
    const base = [
      localDay(o.created_at).split('-').reverse().join('/'),
      `#${o.id.slice(0, 8)}`,
      o.customers?.name ?? '',
      isManual(o) ? 'Venda manual' : 'Loja',
      o.status,
    ]
    const f = o._fin || {}
    const orderTail = [
      o.coupon_code ?? '', f.athlete ?? '', o.ref ?? '', num(o.discount_amount), num(o.shipping_fee), num(o.total),
      num(f.fee), num(f.commission), num(f.profit),
    ]
    for (const i of o.order_items || []) {
      const c = itemCost(i, costMap)
      rows.push([
        ...base, i.product_name, i.model_label, i.color, i.size, i.qty, num(i.unit_price),
        c == null ? '' : num(c), ...orderTail,
      ])
    }
  }
  // ; como separador e BOM pra o Excel em português abrir certinho.
  return '﻿' + [head, ...rows].map((r) => r.map(esc).join(';')).join('\n')
}

const brlTxt = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dmy = (day) => day.split('-').reverse().join('/')

// Texto pronto pra mandar pro atleta no WhatsApp.
export function athleteSummary(a, range) {
  const periodo = range.from ? `${dmy(range.from)} a ${dmy(range.to)}` : `até ${dmy(range.to)}`
  const linhas = a.orders.map(
    (o) => `${dmy(o.day).slice(0, 5)} · pedido #${o.id.slice(0, 8)} · ${brlTxt(o.net)} → ${brlTxt(o.commission)}`
  )
  return [
    `Repasse ${brand.name} · ${a.athlete}`,
    `Período: ${periodo}`,
    `Cupom: ${a.coupons.join(', ')}`,
    '',
    ...linhas,
    '',
    `${a.orders.length} ${a.orders.length === 1 ? 'pedido' : 'pedidos'} · ${a.pieces} ${a.pieces === 1 ? 'peça' : 'peças'}`,
    `Vendas (sem frete): ${brlTxt(a.base)}`,
    `Total do repasse: ${brlTxt(a.commission)}`,
  ].join('\n')
}
