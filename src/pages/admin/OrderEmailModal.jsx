import { useEffect, useMemo, useRef, useState } from 'react'
import {
  EMAIL_TYPES,
  buildEmailHtml,
  defaultEmailType,
  emailSubject,
  emailValuesFromOrder,
  gmailComposeUrl,
} from '../../lib/orderEmail'
import { sendOrderEmail } from '../../lib/orders'
import { emailLogoUrl } from '../../brand'

const FIELD_LABELS = {
  prazo: 'Prazo de produção',
  previsao: 'Previsão de entrega',
  valor: 'Valor total',
  endereco: 'Entrega em',
  transportadora: 'Transportadora',
  codigo: 'Código de rastreio',
  link: 'Link (opcional, vira botão)',
  motivo: 'Motivo (opcional)',
  estorno: 'Texto do estorno (apague se não houve pagamento)',
  cupom: 'Cupom (opcional)',
}

// Copia HTML como texto formatado (pra colar no Gmail). Tenta a API nova e,
// se o navegador não deixar, seleciona um bloco escondido e usa o copiar antigo.
async function copyRichText(html, plain, scratchEl) {
  try {
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([
        new window.ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plain], { type: 'text/plain' }),
        }),
      ])
      return true
    }
  } catch {
    // cai pro plano B
  }
  scratchEl.innerHTML = html
  const range = document.createRange()
  range.selectNodeContents(scratchEl)
  const sel = window.getSelection()
  sel.removeAllRanges()
  sel.addRange(range)
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  sel.removeAllRanges()
  scratchEl.innerHTML = ''
  return ok
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    window.prompt('Copie:', text)
    return false
  }
}

export default function OrderEmailModal({ order, onClose, onSent }) {
  const [type, setType] = useState(() => defaultEmailType(order.status))
  const [values, setValues] = useState(() => emailValuesFromOrder(order, window.location.origin))
  const [status, setStatus] = useState('')
  const [sending, setSending] = useState(false)
  const previewRef = useRef(null)
  const scratchRef = useRef(null)

  const logoSrc = emailLogoUrl(window.location.origin)
  const html = useMemo(() => buildEmailHtml(type, values, logoSrc), [type, values, logoSrc])
  const subject = emailSubject(type, values)
  const to = order.customers?.email || ''

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (!status) return
    const t = setTimeout(() => setStatus(''), 4000)
    return () => clearTimeout(t)
  }, [status])

  function update(field) {
    return (e) => setValues((v) => ({ ...v, [field]: e.target.value }))
  }

  async function handleCopyEmail() {
    const plain = previewRef.current?.innerText || ''
    const ok = await copyRichText(html, plain, scratchRef.current)
    if (ok) {
      setStatus('E-mail copiado. Cole no corpo do e-mail no Gmail.')
    } else {
      const range = document.createRange()
      range.selectNodeContents(previewRef.current)
      const sel = window.getSelection()
      sel.removeAllRanges()
      sel.addRange(range)
      setStatus('Não consegui copiar sozinho. A prévia está selecionada: use Ctrl+C (ou Cmd+C).')
    }
  }

  async function handleSendFromSite() {
    if (!to) return
    if (!window.confirm(`Enviar o e-mail "${EMAIL_TYPES[type].tab}" para ${to}?`)) return
    setSending(true)
    const r = await sendOrderEmail({ orderId: order.id, kind: type, auto: false, values })
    setSending(false)
    if (r.ok) {
      setStatus('E-mail enviado pelo site.')
      onSent?.()
    } else {
      setStatus(`Não foi enviado: ${r.error}`)
    }
  }

  async function handleCopy(text, msg) {
    if (await copyText(text)) setStatus(msg)
  }

  const fields = EMAIL_TYPES[type].fields

  return (
    <div className="email-modal-backdrop" onClick={onClose}>
      <div
        className="email-modal"
        role="dialog"
        aria-modal="true"
        aria-label="E-mail do pedido"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="email-modal-head">
          <h3>E-mail do pedido #{order.id.slice(0, 8)}</h3>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Fechar
          </button>
        </div>

        <div className="email-tabs" role="tablist">
          {Object.entries(EMAIL_TYPES).map(([key, t]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={key === type}
              onClick={() => setType(key)}
            >
              {t.tab}
            </button>
          ))}
        </div>

        <div className="email-modal-grid">
          <div className="email-modal-form">
            <div className="field">
              <label htmlFor="em-nome">Nome do cliente</label>
              <input id="em-nome" value={values.nome} onChange={update('nome')} />
            </div>
            {fields.map((f) => (
              <div className="field" key={f}>
                <label htmlFor={`em-${f}`}>{FIELD_LABELS[f]}</label>
                <input
                  id={`em-${f}`}
                  value={values[f]}
                  placeholder={f === 'previsao' ? 'Opcional, ex: até 12/12' : f === 'link' ? 'https://...' : f === 'cupom' ? 'Ex: VOLTA10' : ''}
                  onChange={update(f)}
                />
              </div>
            ))}
            <div className="field">
              <label htmlFor="em-itens">Itens</label>
              <textarea id="em-itens" rows={3} value={values.itens} onChange={update('itens')} />
            </div>
            <div className="field">
              <label htmlFor="em-extra">Mensagem extra (opcional)</label>
              <textarea id="em-extra" rows={2} value={values.extra} onChange={update('extra')} />
            </div>
          </div>

          <div>
            <div className="email-actions">
              {to && (
                <button type="button" className="btn btn-primary" disabled={sending} onClick={handleSendFromSite}>
                  {sending ? 'Enviando...' : 'Enviar pelo site'}
                </button>
              )}
              <button type="button" className="btn btn-secondary" onClick={handleCopyEmail}>
                Copiar e-mail
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => handleCopy(subject, 'Assunto copiado.')}
              >
                Copiar assunto
              </button>
              {to && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => handleCopy(to, 'E-mail do cliente copiado.')}
                >
                  Copiar destinatário
                </button>
              )}
              {to && (
                <a
                  className="btn btn-secondary"
                  href={gmailComposeUrl(to, subject)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir no Gmail
                </a>
              )}
            </div>
            <p className="meta email-status" role="status" aria-live="polite">
              {status || '"Enviar pelo site" manda direto pro cliente. Ou copie e cole no Gmail, como antes.'}
            </p>
            <div className="email-subject">
              <span>Para</span>
              <b>{to || '—'}</b>
            </div>
            <div className="email-subject">
              <span>Assunto</span>
              <b>{subject}</b>
            </div>
            <div className="email-stage">
              <div ref={previewRef} dangerouslySetInnerHTML={{ __html: html }} />
            </div>
          </div>
        </div>
        <div ref={scratchRef} className="email-offscreen" aria-hidden="true" />
      </div>
    </div>
  )
}
