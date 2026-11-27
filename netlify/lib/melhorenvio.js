// Melhor Envio: cotação de frete (PAC, SEDEX, Mini Envios, Jadlog...).
// Chaves guardadas em store_secrets pelo admin (Pagamento e frete):
//   melhorenvio_token  token de acesso (Melhor Envio > Integrações > Permissões de acesso)
//   melhorenvio_cep    CEP de onde a loja envia
//   melhorenvio_env    'sandbox' (teste) ou 'producao'
import { brand } from '../../src/brand.js'
import { getSecret } from './secrets.js'

const BASE = {
  sandbox: 'https://sandbox.melhorenvio.com.br',
  producao: 'https://melhorenvio.com.br',
}

function headers(token) {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    // o Melhor Envio pede nome da aplicação e um contato no User-Agent
    'User-Agent': `${brand.name} (${brand.contact.email || 'loja-core'})`,
  }
}

export async function melhorEnvioConfig() {
  const [token, cep, env] = await Promise.all([
    getSecret('melhorenvio_token'),
    getSecret('melhorenvio_cep'),
    getSecret('melhorenvio_env'),
  ])
  return { token, cep, env: env === 'producao' ? 'producao' : 'sandbox' }
}

// Testa o token. Devolve { ok, account } ou { ok: false, error }.
export async function testMelhorEnvio(token, env) {
  try {
    const res = await fetch(`${BASE[env] || BASE.sandbox}/api/v2/me`, {
      headers: headers(token),
      signal: AbortSignal.timeout(8000),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: data?.message || `Melhor Envio respondeu ${res.status}` }
    const name = [data.firstname, data.lastname].filter(Boolean).join(' ')
    return { ok: true, account: name || data.email || '' }
  } catch (err) {
    return { ok: false, error: `Não deu pra falar com o Melhor Envio: ${err.message}` }
  }
}

// packages: [{ weightKg, lengthCm, widthCm, heightCm, value, qty }]
// Devolve a opção mais barata: { price, serviceCode, serviceName, transitDays }
export async function quoteMelhorEnvio({ token, env, fromCep, toCep, packages }) {
  const res = await fetch(`${BASE[env] || BASE.sandbox}/api/v2/me/shipment/calculate`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({
      from: { postal_code: fromCep },
      to: { postal_code: toCep },
      products: packages.map((p, i) => ({
        id: String(i + 1),
        weight: p.weightKg,
        length: p.lengthCm,
        width: p.widthCm,
        height: p.heightCm,
        insurance_value: p.value,
        quantity: p.qty,
      })),
      options: { receipt: false, own_hand: false },
    }),
    signal: AbortSignal.timeout(8000),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || !Array.isArray(data)) {
    throw new Error(data?.message || `Melhor Envio respondeu ${res.status}`)
  }
  const options = data
    .filter((o) => !o.error && (o.custom_price || o.price))
    .map((o) => ({
      price: Number(o.custom_price || o.price),
      serviceCode: String(o.id),
      serviceName: [o.company?.name, o.name].filter(Boolean).join(' '),
      transitDays: Number(o.custom_delivery_time ?? o.delivery_time) || null,
    }))
    .sort((a, b) => a.price - b.price)
  if (options.length === 0) throw new Error('nenhum serviço atende esse CEP')
  return options[0]
}
