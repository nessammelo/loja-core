// E-mails automáticos do amigo secreto (mesmo visual dos e-mails de pedido).
// Nunca diz quem a pessoa tirou: só leva pro link pessoal.
import { esc, IG_URL } from './orderEmail.js'

const LEAD_DAYS = 17 // igual a secretSanta.js (produção + frete + folga)

function ddmm(iso) {
  if (!iso) return ''
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })
}

function minusDays(iso, n) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d - n))
  return dt.toISOString().slice(0, 10)
}

const firstName = (n) => (n || '').trim().split(/\s+/)[0] || ''

// kind: 'sorteio' | 'mensagens' | 'aviso_responsavel'
// r: linha devolvida por ss_cron_tick; link: link pessoal
export function amigoEmail(kind, r, link) {
  const nome = firstName(r.name)
  const oi = nome ? `Oi, ${esc(nome)}.` : 'Oi.'
  const grupo = esc(r.group_name)
  let subject, headline, body, button
  const extras = []

  if (kind === 'sorteio') {
    subject = `Saiu o sorteio do amigo secreto: ${r.group_name}`
    headline = 'O sorteio saiu.'
    body = `${oi} O sorteio do amigo secreto <b>${grupo}</b> já foi feito. Entre pelo seu link pra ver quem você tirou, os tamanhos e a lista de desejos.`
    button = ['Ver quem eu tirei', link]
    if (r.exchange_date) {
      const last = minusDays(r.exchange_date, LEAD_DAYS)
      const today = new Date().toISOString().slice(0, 10)
      extras.push([
        'Troca',
        last >= today
          ? `${ddmm(r.exchange_date)} · peça até ${ddmm(last)} pra chegar a tempo`
          : `${ddmm(r.exchange_date)}`,
      ])
    }
    if (r.coupon_code) extras.push(['Cupom do grupo', `${esc(r.coupon_code)} · 5% em toda a loja`, true])
  } else if (kind === 'mensagens') {
    subject = `Mensagem nova no amigo secreto: ${r.group_name}`
    headline = 'Tem mensagem nova pra você.'
    body = `${oi} Chegou mensagem nova no amigo secreto <b>${grupo}</b>. Entre pelo seu link pra ler e responder, sem se entregar.`
    button = ['Ler mensagens', link]
  } else if (kind === 'aviso_responsavel') {
    const pend = Number(r.pending || 0)
    subject = `O sorteio de ${r.group_name} não aconteceu`
    headline = 'O sorteio ficou esperando.'
    body =
      `${oi} Chegou o dia do sorteio de <b>${grupo}</b>, mas ele precisa de pelo menos 3 pessoas aprovadas e hoje ${Number(r.approved) === 1 ? 'tem 1' : `tem ${Number(r.approved || 0)}`}.` +
      (pend > 0 ? ` ${pend === 1 ? 'Tem 1 pessoa esperando' : `Tem ${pend} pessoas esperando`} sua aprovação.` : ' Chame mais gente pelo link do grupo.') +
      ' Assim que tiver 3 aprovados, o sorteio acontece sozinho, ou você pode sortear pelo painel.'
    button = ['Abrir o painel', link]
  } else {
    throw new Error(`E-mail desconhecido: ${kind}`)
  }

  return { subject, html: layout({ kicker: `Amigo secreto · ${r.group_name}`, headline, body, button, extras }) }
}

function layout({ kicker, headline, body, button, extras }) {
  const F = 'Arial, Helvetica, sans-serif'
  const D = "Impact, 'Arial Narrow Bold', 'Arial Black', Arial, sans-serif"
  const logo = `${(globalThis.process?.env?.URL || 'https://edgebjj.com.br').replace(/\/$/, '')}/assets/logo-edge.png`
  const rows = extras
    .map(
      ([k, v, raw], i) => `
    <tr><td style="padding:${i === 0 ? '0' : '14px'} 0 0;font-family:${F};">
      <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#8f8d84;padding-bottom:4px;">${esc(k)}</div>
      <div style="font-size:16px;color:#0a0a0a;">${raw ? v : esc(v)}</div>
    </td></tr>`
    )
    .join('')
  const detail = rows
    ? `<tr><td style="padding:28px 32px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f3ee;"><tr><td style="padding:22px 24px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table></td></tr></table></td></tr>`
    : ''
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f3ee;">
 <tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e4e0d6;">
   <tr><td align="center" style="background:#000000;padding:26px 24px;">
     <img src="${esc(logo)}" width="125" height="75" alt="EDGE" style="display:block;border:0;width:125px;height:75px;">
   </td></tr>
   <tr><td style="padding:40px 32px 0;font-family:${F};">
     <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#8f8d84;">${esc(kicker)}</div>
     <div style="font-family:${D};font-size:38px;line-height:1.05;letter-spacing:1px;text-transform:uppercase;color:#0a0a0a;padding:10px 0 16px;">${esc(headline)}</div>
     <div style="font-size:15px;line-height:1.6;color:#2a2a26;">${body}</div>
   </td></tr>
   ${detail}
   <tr><td style="padding:24px 32px 0;" align="left">
     <a href="${esc(button[1])}" target="_blank" style="display:inline-block;background:#0a0a0a;color:#f5f3ee;font-family:${F};font-size:14px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;text-decoration:none;padding:15px 30px;">${esc(button[0])}</a>
   </td></tr>
   <tr><td style="padding:16px 32px 0;font-family:${F};font-size:13px;line-height:1.5;color:#8f8d84;">
     Este link é só seu e abre sua página sem senha. Não encaminhe este e-mail.
   </td></tr>
   <tr><td style="padding:36px 32px 36px;font-family:${F};">
     <div style="border-top:1px solid #e4e0d6;padding-top:22px;font-size:14px;line-height:1.6;color:#2a2a26;">
       Você recebe este aviso porque colocou seu e-mail no amigo secreto da EDGE.<br>
       <span style="color:#0a0a0a;font-weight:bold;letter-spacing:2px;text-transform:uppercase;font-size:12px;">Equipe EDGE</span>
       <span style="color:#8f8d84;"> · </span>
       <a href="${IG_URL}" target="_blank" style="color:#2a2a26;text-decoration:underline;">@edge.bjj</a>
     </div>
   </td></tr>
  </table>
 </td></tr>
</table>`
}
