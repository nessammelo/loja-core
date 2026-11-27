import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { saveStoreSetting } from '../../lib/storeInfo'
import { fetchStoreModes, MODE_KEYS } from '../../lib/storeModes'
import { brand, whatsappStoreUrl } from '../../brand'

// Chama a function store-keys com o login do admin
async function storeKeys(method, body) {
  const { data: s } = await supabase.auth.getSession()
  const token = s?.session?.access_token
  const res = await fetch('/.netlify/functions/store-keys', {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data) throw new Error(data?.error || 'Não deu pra falar com o servidor.')
  return data
}

function Option({ name, value, current, onChange, title, children, disabled }) {
  const active = current === value
  return (
    <label className={`mode-option ${active ? 'active' : ''} ${disabled ? 'disabled' : ''}`}>
      <input
        type="radio"
        name={name}
        value={value}
        checked={active}
        disabled={disabled}
        onChange={() => onChange(value)}
      />
      <span>
        <strong>{title}</strong>
        <span className="meta">{children}</span>
      </span>
    </label>
  )
}

export default function AdminPayments() {
  const [modes, setModes] = useState(null)
  const [mp, setMp] = useState(null) // { connected, account, error, source }
  const [mpError, setMpError] = useState(null)
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    fetchStoreModes().then(setModes)
    storeKeys('GET')
      .then((d) => setMp(d.mercadopago))
      .catch((e) => {
        setMp({ connected: false })
        setMpError(e.message)
      })
  }, [])

  async function saveMode(kind, value) {
    setMsg(null)
    const next = { ...modes, [kind]: value }
    if (next.payment === 'mercadopago') next.shipping = 'auto'
    try {
      await saveStoreSetting(MODE_KEYS.payment, next.payment)
      await saveStoreSetting(MODE_KEYS.shipping, next.shipping)
      setModes(next)
      setMsg('Salvo. A loja já está usando o modo novo.')
    } catch (e) {
      setMsg('Não consegui salvar: ' + e.message)
    }
  }

  async function connectMp(e) {
    e.preventDefault()
    setBusy(true)
    setMpError(null)
    try {
      const d = await storeKeys('POST', { provider: 'mercadopago', accessToken: token })
      setMp(d.mercadopago)
      setToken('')
    } catch (err) {
      setMpError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function removeMp() {
    setBusy(true)
    setMpError(null)
    try {
      if (modes?.payment === 'mercadopago') await saveMode('payment', 'whatsapp')
      const d = await storeKeys('POST', { provider: 'mercadopago', remove: true })
      setMp(d.mercadopago)
    } catch (err) {
      setMpError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (!modes) return <p className="meta">Carregando...</p>

  const mpReady = Boolean(mp?.connected)
  const hasWhatsapp = Boolean(whatsappStoreUrl())

  return (
    <div style={{ maxWidth: 680 }}>
      <h2>Pagamento e frete</h2>
      <p className="meta" style={{ marginTop: 8 }}>
        A loja pode fechar a venda pelo WhatsApp ou cobrar direto no site. Dá pra trocar quando quiser.
      </p>
      {!hasWhatsapp && (
        <p className="report-warn">
          O WhatsApp da loja ainda não foi configurado. Sem ele, o modo WhatsApp não funciona.
        </p>
      )}

      <section className="report-card">
        <h3>Pagamento</h3>
        <div className="mode-options">
          <Option name="payment" value="whatsapp" current={modes.payment} onChange={(v) => saveMode('payment', v)} title="Pelo WhatsApp">
            O carrinho termina com o botão &quot;Finalizar pelo WhatsApp&quot;, que abre uma conversa com a lista dos
            itens. O pagamento é combinado na conversa.
          </Option>
          <Option
            name="payment"
            value="mercadopago"
            current={modes.payment}
            onChange={(v) => saveMode('payment', v)}
            disabled={!mpReady}
            title="Mercado Pago (Pix e cartão no site)"
          >
            {mpReady ? 'O cliente paga no site e o pedido cai aqui no admin.' : 'Conecte o Mercado Pago abaixo pra liberar.'}
          </Option>
        </div>

        <h3 style={{ marginTop: 24 }}>Mercado Pago</h3>
        {mp === null ? (
          <p className="meta">Verificando...</p>
        ) : mpReady ? (
          <>
            <p className="key-status ok">
              Conectado{mp.account ? ` como ${mp.account}` : ''}.
              {mp.source === 'netlify' && ' (chave configurada na Netlify)'}
            </p>
            {mp.source === 'admin' && (
              <button className="btn btn-secondary btn-sm" onClick={removeMp} disabled={busy}>
                Desconectar
              </button>
            )}
          </>
        ) : (
          <form onSubmit={connectMp}>
            <p className="meta">
              No Mercado Pago, vá em Seu negócio &gt; Configurações &gt; Credenciais de produção e copie o{' '}
              <strong>Access Token</strong> (começa com APP_USR-). A chave fica guardada só no servidor e não aparece
              mais aqui.
            </p>
            {mp.error && <p className="report-warn">A chave salva parou de funcionar: {mp.error}</p>}
            <div className="field">
              <label htmlFor="mp-token">Access Token</label>
              <input
                id="mp-token"
                type="password"
                autoComplete="off"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="APP_USR-..."
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={busy || !token.trim()}>
              {busy ? 'Testando...' : 'Testar e conectar'}
            </button>
          </form>
        )}
        {mpError && <p className="report-warn">{mpError}</p>}
      </section>

      <section className="report-card">
        <h3>Frete</h3>
        <div className="mode-options">
          <Option
            name="shipping"
            value="whatsapp"
            current={modes.shipping}
            onChange={(v) => saveMode('shipping', v)}
            disabled={modes.payment === 'mercadopago'}
            title="Combinado no WhatsApp"
          >
            {modes.payment === 'mercadopago'
              ? 'Com o Mercado Pago ligado, o frete precisa ser calculado no site.'
              : 'O carrinho não pede CEP. O frete é combinado na conversa.'}
          </Option>
          <Option name="shipping" value="auto" current={modes.shipping} onChange={(v) => saveMode('shipping', v)} title="Calculado no site">
            {brand.features.shipping === 'gubo'
              ? 'O cliente informa o CEP e o frete é cotado na Gubo.'
              : 'O cliente informa o CEP e vê o frete fixo da loja.'}
          </Option>
        </div>
      </section>

      {msg && <p className="meta">{msg}</p>}
    </div>
  )
}
