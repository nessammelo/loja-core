import { storageKey } from '../brand'
import { supabase } from './supabase'

// Amigo secreto: tudo passa pelas funções ss_* do banco, que conferem o
// link secreto (token) de cada pessoa. Não tem login.

export const ENABLED_KEY = 'secret_santa_enabled'

// prazo: produção sob demanda + frete, com folga pro fim de ano
export const PRODUCTION_DAYS = 7
export const SHIPPING_DAYS = 5
export const BUFFER_DAYS = 5
export const LEAD_DAYS = PRODUCTION_DAYS + SHIPPING_DAYS + BUFFER_DAYS

export const SIZES = ['P', 'M', 'G', 'GG', 'XG']

async function rpc(name, params) {
  const { data, error } = await supabase.rpc(name, params)
  if (error) throw new Error(error.message)
  return data
}

export async function fetchSecretSantaEnabled() {
  const { data, error } = await supabase
    .from('store_settings')
    .select('value')
    .eq('key', ENABLED_KEY)
    .maybeSingle()
  if (error || !data) return false
  return data.value === 'true'
}

export function createGroup(f) {
  return rpc('ss_create_group', {
    p_name: f.name,
    p_organizer_name: f.organizerName,
    p_tee_size: f.teeSize || null,
    p_hoodie_size: f.hoodieSize || null,
    p_draw_mode: f.drawMode,
    p_draw_date: f.drawMode === 'auto' ? f.drawDate || null : null,
    p_exchange_date: f.exchangeDate || null,
    p_min_value: f.minValue === '' || f.minValue == null ? null : Number(f.minValue),
    p_max_value: f.maxValue === '' || f.maxValue == null ? null : Number(f.maxValue),
    p_require_approval: f.requireApproval,
    p_reveal_after_exchange: f.revealAfterExchange,
  })
}

export const fetchGroupPreview = (code) => rpc('ss_group_preview', { p_join_code: code })

export const joinGroup = (code, name, teeSize, hoodieSize, pin) =>
  rpc('ss_join', {
    p_join_code: code,
    p_name: name,
    p_tee_size: teeSize || null,
    p_hoodie_size: hoodieSize || null,
    p_pin: pin,
  })

// "Outras ideias de presente": texto livre, só quem tirar a pessoa vê
export const GIFT_IDEAS_MAX = 500
export const setGiftIdeas = (token, text) => rpc('ss_set_gift_ideas', { p_token: token, p_text: text || '' })

// usado logo depois de criar/entrar: se falhar, a pessoa ainda entra e pode preencher depois
export async function trySaveGiftIdeas(token, text) {
  if (!text || !text.trim()) return true
  try {
    await setGiftIdeas(token, text)
    return true
  } catch {
    return false
  }
}

// e-mail (avisos do sorteio e mensagens) + aceite de novidades; WhatsApp só do responsável
export const setContact = (token, { email, optin, phone }) =>
  rpc('ss_set_contact', {
    p_token: token,
    p_email: email || '',
    p_optin: Boolean(optin),
    p_phone: phone == null || phone === '' ? null : phone,
  })

export async function trySaveContact(token, contact) {
  if (!contact.email && !contact.phone) return true
  try {
    await setContact(token, contact)
    return true
  } catch {
    return false
  }
}

export const isValidEmail = (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test((v || '').trim())
// só números, sem o +55
export const phoneDigits = (v) => {
  const d = (v || '').replace(/\D/g, '')
  return /^55\d{10,11}$/.test(d) ? d.slice(2) : d
}
export const isValidPhone = (v) => phoneDigits(v).length >= 10 && phoneDigits(v).length <= 11

// (51) 99999-1234 enquanto digita
export function formatPhone(v) {
  const d = phoneDigits(v).slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

export const fetchMyPage = (token) => rpc('ss_my_page', { p_token: token })

export const updateMe = (token, name, teeSize, hoodieSize) =>
  rpc('ss_update_me', { p_token: token, p_name: name, p_tee_size: teeSize || null, p_hoodie_size: hoodieSize || null })

export const manageParticipant = (token, participantId, action) =>
  rpc('ss_manage_participant', { p_token: token, p_participant_id: participantId, p_action: action })

// link de recuperação (só abre com o PIN da pessoa; o responsável não consegue espiar)
export const createRecoveryLink = (token, participantId) =>
  rpc('ss_recovery_link', { p_token: token, p_participant_id: participantId })

// esqueceu o PIN: troca o link pessoal (o antigo para de funcionar e a pessoa é avisada)
export const resetParticipantLink = (token, participantId) =>
  rpc('ss_reset_link', { p_token: token, p_participant_id: participantId })

// devolve o link pessoal ou lança o erro (PIN errado, tentativas restantes...)
export async function recoverWithPin(recoveryCode, pin) {
  const data = await rpc('ss_recover', { p_recovery_token: recoveryCode, p_pin: pin })
  if (data?.error) throw new Error(data.error)
  return data.token
}

export const drawNow = (token) => rpc('ss_draw_now', { p_token: token })

export const hideMessage = (token, messageId) => rpc('ss_hide_message', { p_token: token, p_message_id: messageId })

export const addToWishlist = (token, { slug, modelLabel, color, size }) =>
  rpc('ss_wishlist_add', { p_token: token, p_product_slug: slug, p_model_label: modelLabel, p_color: color, p_size: size })

export const removeFromWishlist = (token, itemId) => rpc('ss_wishlist_remove', { p_token: token, p_item_id: itemId })

// to: 'target' (quem eu tirei) ou 'giver' (quem me tirou)
export const sendMessage = (token, to, body) => rpc('ss_send_message', { p_token: token, p_to: to, p_body: body })

export const reportMessage = (token, messageId) => rpc('ss_report_message', { p_token: token, p_message_id: messageId })

// ---- links ---------------------------------------------------

export const groupUrl = (code) => `${window.location.origin}/amigo/g/${code}`
export const personalUrl = (token) => `${window.location.origin}/amigo/eu/${token}`
export const recoveryUrl = (code) => `${window.location.origin}/amigo/recuperar/${code}`

export function whatsappShareUrl(text) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}

// ---- grupos salvos neste aparelho ----------------------------
// guarda os links pessoais pra pessoa voltar sem procurar no WhatsApp
// e pra página de produto oferecer "pôr na minha lista".
const SAVED_KEY = storageKey('amigo_v1')

export function savedGroups() {
  try {
    const list = JSON.parse(localStorage.getItem(SAVED_KEY) || '[]')
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export function rememberGroup(token, groupName, myName) {
  try {
    const list = savedGroups().filter((g) => g.token !== token)
    list.unshift({ token, groupName, myName })
    localStorage.setItem(SAVED_KEY, JSON.stringify(list.slice(0, 10)))
  } catch {
    // sem armazenamento: segue sem lembrar
  }
}

export function forgetGroup(token) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(savedGroups().filter((g) => g.token !== token)))
  } catch {
    // nada a fazer
  }
}

// ---- datas ---------------------------------------------------
// datas do banco chegam como 'AAAA-MM-DD'; trata como data local (sem fuso)

export function parseDate(iso) {
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function toIso(date) {
  const p = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`
}

export function formatDate(iso) {
  const d = typeof iso === 'string' ? parseDate(iso) : iso
  if (!d) return ''
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

export function today() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

// último dia pra pedir e o presente chegar até a data
export function lastOrderDate(iso) {
  const d = typeof iso === 'string' ? parseDate(iso) : iso
  if (!d) return null
  const last = new Date(d)
  last.setDate(last.getDate() - LEAD_DAYS)
  return last
}

// prazo do Natal deste ano (ou do próximo, se já passou)
export function christmasLastOrderDate() {
  const t = today()
  let xmas = new Date(t.getFullYear(), 11, 25)
  if (t > xmas) xmas = new Date(t.getFullYear() + 1, 11, 25)
  return lastOrderDate(xmas)
}

export function formatMoney(v) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function valueRangeText(min, max) {
  if (min != null && max != null) return `${formatMoney(min)} a ${formatMoney(max)}`
  if (min != null) return `a partir de ${formatMoney(min)}`
  if (max != null) return `até ${formatMoney(max)}`
  return 'Sem valor definido'
}

// 'in' | 'below' | 'above' | null (grupo sem faixa)
export function priceFit(price, min, max) {
  if (min == null && max == null) return null
  if (min != null && price < Number(min)) return 'below'
  if (max != null && price > Number(max)) return 'above'
  return 'in'
}
