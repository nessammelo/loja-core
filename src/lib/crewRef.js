// Rastreio de vendas da Edge Crew por link (?ref=nome).
// Usado no navegador (salvar o ref) e nas Netlify Functions (validar e
// montar o external_reference do Mercado Pago).

// Lista da Crew: só esses refs são aceitos (sem diferenciar maiúscula).
// Atleta novo = acrescentar o nome aqui (minúsculo, sem espaço).
export const CREW_REFS = ['pablo', 'luhan', 'monstrinha']

const STORAGE_KEY = 'edge_crew_ref'
const VALID_DAYS = 30

// Devolve o ref normalizado (minúsculo) se for da Crew, senão null.
export function normalizeRef(value) {
  const ref = String(value ?? '').trim().toLowerCase()
  return CREW_REFS.includes(ref) ? ref : null
}

// Lê ?ref= da URL e salva por 30 dias. Ref desconhecido é ignorado
// (não apaga o que já estava salvo). O mais recente vale.
export function captureRefFromSearch(search) {
  let ref
  try {
    ref = normalizeRef(new URLSearchParams(search).get('ref'))
  } catch {
    return null
  }
  if (!ref) return null
  try {
    const expiresAt = Date.now() + VALID_DAYS * 24 * 3600 * 1000
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ref, expiresAt }))
  } catch {
    // sem armazenamento (aba anônima etc.): segue sem rastrear
  }
  return ref
}

// Ref salvo e ainda dentro dos 30 dias, ou null.
export function getStoredRef() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const { ref, expiresAt } = JSON.parse(raw)
    if (!expiresAt || Date.now() > expiresAt || !normalizeRef(ref)) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return normalizeRef(ref)
  } catch {
    return null
  }
}

// external_reference do Mercado Pago: só o id do pedido quando não tem ref,
// ou "ref-pablo_<id do pedido>" quando tem (aparece no painel de vendas).
export function buildExternalReference(orderId, ref) {
  const r = normalizeRef(ref)
  return r ? `ref-${r}_${orderId}` : orderId
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

// Caminho inverso: tira o id do pedido do external_reference (com ou sem ref).
export function orderIdFromExternalReference(extRef) {
  if (!extRef) return null
  const m = String(extRef).match(UUID_RE)
  return m ? m[0] : String(extRef)
}
