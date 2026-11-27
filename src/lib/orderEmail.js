// Gerador dos e-mails do pedido.
// Monta HTML em tabelas com estilo inline, que é o que o Gmail aceita colar.
// Nome, cores, logo e textos de marca vêm de src/brand.js.
import { brand, instagramUrl, instagramHandle, emailSignature } from '../brand.js'

export const IG_URL = instagramUrl
export const DEFAULT_PRAZO = brand.copy.defaultProductionTime
const NAME = brand.name
const C = brand.copy
const E = brand.email

const brl = (v) => Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function esc(s) {
  return String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  )
}

export function safeUrl(u) {
  const v = (u || '').trim()
  return /^https?:\/\//i.test(v) ? v : ''
}

const mono = (t) =>
  `<span style="font-family:'Courier New',Courier,monospace;font-size:18px;letter-spacing:1px;color:#0a0a0a;">${esc(t)}</span>`

export const EMAIL_TYPES = {
  recebido: {
    tab: 'Recebemos seu pedido',
    headline: 'Recebemos seu pedido.',
    body: (v, n) =>
      `Oi${n}. ${C.orderThanks} Seu pagamento foi confirmado e já estamos cuidando do seu pedido. ${C.productionNote} Quando ele sair, você recebe outro e-mail com o código de rastreio.`,
    rows: (v) => [
      ['Prazo de produção', v.prazo],
      ['Valor total', v.valor],
      ['Entrega em', v.endereco],
    ],
    button: () => null,
    subject: (v) => `Recebemos seu pedido ${NAME} #${v.pedido}`,
    fields: ['prazo', 'valor', 'endereco'],
  },
  producao: {
    tab: 'Em produção',
    headline: 'Sua peça entrou em produção.',
    body: (v, n) =>
      `Oi${n}. ${C.inProduction} Assim que ela estiver pronta e enviada, você recebe o código de rastreio por aqui.`,
    rows: (v) => [
      ['Prazo de produção', v.prazo],
      ['Previsão de entrega', v.previsao],
    ],
    button: () => null,
    subject: (v) => `Seu pedido ${NAME} #${v.pedido} está em produção`,
    fields: ['prazo', 'previsao'],
  },
  enviado: {
    tab: 'Pedido enviado',
    headline: 'Seu pedido está a caminho.',
    body: (v, n) =>
      `Oi${n}. Seu pedido já saiu e pode ser acompanhado pelo código abaixo. O código pode levar algumas horas para aparecer no site da transportadora.`,
    rows: (v) => [
      ['Transportadora', v.transportadora],
      ['Código de rastreio', v.codigo && mono(v.codigo), true],
      ['Previsão de entrega', v.previsao],
    ],
    button: (v) => (safeUrl(v.link) ? ['Rastrear pedido', safeUrl(v.link)] : null),
    subject: (v) => `Seu pedido ${NAME} #${v.pedido} está a caminho`,
    fields: ['transportadora', 'codigo', 'link', 'previsao'],
  },
  entregue: {
    tab: 'Pedido entregue',
    headline: 'Chegou. Tudo certo?',
    body: (v, n) =>
      `Oi${n}. Pelos nossos dados, seu pedido foi entregue. ${C.deliveredWish} Se algo não saiu como esperado, é só responder este e-mail que a gente resolve.${IG_URL ? ` ${C.deliveredShare}` : ''}`,
    rows: () => [],
    button: () => (IG_URL ? [`Marcar ${instagramHandle}`, IG_URL] : null),
    subject: (v) => `Seu pedido ${NAME} #${v.pedido} foi entregue`,
    fields: [],
  },
  cancelado: {
    tab: 'Pedido cancelado',
    headline: 'Seu pedido foi cancelado.',
    body: (v, n) =>
      `Oi${n}. Seu pedido foi cancelado.${v.motivo ? ` Motivo: ${esc(v.motivo)}.` : ''} ${esc(v.estorno || '')} Se tiver qualquer dúvida, é só responder este e-mail.`,
    rows: (v) => [['Valor do pedido', v.valor]],
    button: () => null,
    subject: (v) => `Seu pedido ${NAME} #${v.pedido} foi cancelado`,
    fields: ['motivo', 'estorno', 'valor'],
  },
  resgate: {
    tab: 'Resgatar carrinho',
    headline: 'Seu carrinho ainda está aqui.',
    body: (v, n) =>
      `Oi${n}. O pagamento do seu pedido não foi concluído e o link expirou. Separamos as mesmas peças pra você: é só clicar no botão, conferir e pagar com Pix ou cartão.${v.cupom ? ' E pra facilitar, tem um cupom esperando por você.' : ''}`,
    rows: (v) => [['Cupom', v.cupom && mono(v.cupom), true]],
    button: (v) => {
      const u = safeUrl(v.link)
      if (!u) return null
      const c = (v.cupom || '').trim()
      return ['Voltar pro carrinho', c && !/[?&]cupom=/.test(u) ? `${u}${u.includes('?') ? '&' : '?'}cupom=${encodeURIComponent(c)}` : u]
    },
    subject: () => `Seu carrinho ${NAME} ainda está aqui`,
    fields: ['link', 'cupom'],
  },
}

export const REFUND_TEXT =
  'O valor pago é devolvido pelo Mercado Pago na mesma forma de pagamento. No cartão, o estorno pode aparecer em até 2 faturas; no Pix, volta pra conta em alguns dias.'

// Link que remonta o carrinho de um pedido expirado (com cupom opcional)
export function rescueCartUrl(origin, orderId, coupon) {
  const base = `${origin}/carrinho/recuperar/${orderId}`
  return coupon ? `${base}?cupom=${encodeURIComponent(coupon)}` : base
}

// Qual e-mail faz sentido pelo status do pedido
export function defaultEmailType(status) {
  if (status === 'cancelado') return 'cancelado'
  if (status === 'expirado') return 'resgate'
  if (status === 'repassado') return 'producao'
  if (status === 'enviado') return 'enviado'
  if (status === 'entregue') return 'entregue'
  return 'recebido'
}

// Dados iniciais do formulário a partir do pedido do admin
export function emailValuesFromOrder(o, origin = '') {
  const a = o.shipping_address || {}
  const firstName = (o.customers?.name || '').trim().split(/\s+/)[0] || ''
  return {
    nome: firstName,
    pedido: o.id.slice(0, 8),
    prazo: DEFAULT_PRAZO,
    previsao: '',
    valor: brl(o.total),
    endereco: [a.cidade, a.uf].filter(Boolean).join('/'),
    transportadora: o.carrier || '',
    codigo: o.tracking_code || '',
    link: o.status === 'expirado' && origin ? rescueCartUrl(origin, o.id) : '',
    motivo: o.cancel_reason || '',
    estorno: o.payment_status === 'approved' || o.payment_status === 'refunded' ? REFUND_TEXT : '',
    cupom: '',
    itens: (o.order_items || [])
      .map((i) => `${i.qty}x ${i.product_name} · ${i.model_label} · ${i.color} · Tam. ${i.size}`)
      .join('\n'),
    extra: '',
  }
}

export function emailSubject(type, v) {
  return EMAIL_TYPES[type].subject(v)
}

export function buildEmailHtml(type, v, logoSrc) {
  const T = EMAIL_TYPES[type]
  const F = 'Arial, Helvetica, sans-serif'
  const D = E.displayFont
  const [LW, LH] = brand.logoEmailSize
  const nome = v.nome ? ', ' + esc(v.nome) : ''
  const itens = (v.itens || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  const rows = T.rows(v)
    .filter((r) => r[1])
    .map(([k, val, raw]) => [k, raw ? val : esc(val)])
  const detail = rows
    .map(
      ([k, val], i) => `
    <tr><td style="padding:${i === 0 ? '0' : '14px'} 0 0;font-family:${F};">
      <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#8f8d84;padding-bottom:4px;">${k}</div>
      <div style="font-size:16px;color:#0a0a0a;">${val}</div>
    </td></tr>`
    )
    .join('')
  const detailBlock = rows.length
    ? `
   <tr><td style="padding:28px 32px 0;">
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${E.pageBg};">
      <tr><td style="padding:22px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${detail}</table>
      </td></tr>
     </table>
   </td></tr>`
    : ''

  const b = T.button(v)
  const button = b
    ? `
    <tr><td style="padding:24px 32px 0;" align="left">
      <a href="${esc(b[1])}" target="_blank" style="display:inline-block;background:${E.buttonBg};color:${E.buttonText};font-family:${F};font-size:14px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;text-decoration:none;padding:15px 30px;">${esc(b[0])}</a>
    </td></tr>`
    : ''

  const itemsBlock = itens.length
    ? `
    <tr><td style="padding:32px 32px 0;font-family:${F};">
      <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#8f8d84;padding-bottom:10px;border-bottom:1px solid #e4e0d6;">No pedido</div>
      ${itens.map((l) => `<div style="font-size:14px;line-height:1.5;color:#0a0a0a;padding:10px 0;border-bottom:1px solid #eeebe3;">${esc(l)}</div>`).join('')}
    </td></tr>`
    : ''

  const extra = v.extra
    ? `
    <tr><td style="padding:24px 32px 0;font-family:${F};font-size:15px;line-height:1.6;color:#2a2a26;">${esc(v.extra).replace(/\n/g, '<br>')}</td></tr>`
    : ''

  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${E.pageBg};">
 <tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e4e0d6;">
   <tr><td align="center" style="background:${E.headerBg};padding:26px 24px;">
     <img src="${esc(logoSrc)}" width="${LW}" height="${LH}" alt="${esc(NAME)}" style="display:block;border:0;width:${LW}px;height:${LH}px;">
   </td></tr>
   <tr><td style="padding:40px 32px 0;font-family:${F};">
     <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#8f8d84;">Pedido #${esc(v.pedido || '—')}</div>
     <div style="font-family:${D};font-size:38px;line-height:1.05;letter-spacing:1px;text-transform:${E.headlineTransform};color:#0a0a0a;padding:10px 0 16px;">${esc(T.headline)}</div>
     <div style="font-size:15px;line-height:1.6;color:#2a2a26;">${T.body(v, nome)}</div>
   </td></tr>
   ${detailBlock}
   ${button}
   ${itemsBlock}
   ${extra}
   <tr><td style="padding:36px 32px 36px;font-family:${F};">
     <div style="border-top:1px solid #e4e0d6;padding-top:22px;font-size:14px;line-height:1.6;color:#2a2a26;">
       Qualquer dúvida, é só responder este e-mail.<br>
       <span style="color:#0a0a0a;font-weight:bold;letter-spacing:2px;text-transform:uppercase;font-size:12px;">${esc(emailSignature)}</span>${IG_URL ? `
       <span style="color:#8f8d84;"> · </span>
       <a href="${IG_URL}" target="_blank" style="color:#2a2a26;text-decoration:underline;">${esc(instagramHandle)}</a>` : ''}
     </div>
   </td></tr>
  </table>
 </td></tr>
</table>`
}

// Link do Gmail com destinatário e assunto já preenchidos (o corpo é colado depois)
export function gmailComposeUrl(to, subject) {
  const enc = encodeURIComponent
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${enc(to || '')}&su=${enc(subject || '')}`
}
