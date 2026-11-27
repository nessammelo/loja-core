import { useEffect, useState } from 'react'
import { markOrderPaid } from '../../lib/orders'

const brl = (v) => Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// "1.234,56" / "25" / "25,5" -> número (vazio = 0)
function parseMoney(text) {
  const clean = String(text || '').replace(/[^\d,.]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')
  const n = Number(clean)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN
}

// Pedido do WhatsApp: a loja confirma o pagamento combinado na conversa e,
// se o frete foi combinado lá, informa o valor (o total do pedido se ajusta).
export default function MarkPaidModal({ order, onClose, onPaid }) {
  const toCombine = order.shipping_service === 'A combinar no WhatsApp'
  const subtotal = (order.order_items || []).reduce((s, i) => s + Number(i.unit_price) * i.qty, 0)
  const discount = Number(order.discount_amount || 0)
  const [freteText, setFreteText] = useState(
    toCombine ? '' : Number(order.shipping_fee || 0).toFixed(2).replace('.', ',')
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const frete = parseMoney(freteText)
  const total = Math.max(0, subtotal - discount) + (Number.isNaN(frete) ? 0 : frete)

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleConfirm() {
    if (Number.isNaN(frete) || frete < 0) return setError('Confira o valor do frete.')
    setSaving(true)
    setError(null)
    try {
      await markOrderPaid(order.id, { shippingFee: frete, total: Math.round(total * 100) / 100, combined: toCombine })
      onPaid()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="email-modal-backdrop" onClick={onClose}>
      <div
        className="email-modal cancel-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Marcar pedido como pago"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="email-modal-head">
          <h3>Marcar pago #{order.id.slice(0, 8)}</h3>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Fechar
          </button>
        </div>

        <p className="meta" style={{ marginTop: 0 }}>
          {order.customers?.name ?? 'Cliente'} · pedido pelo WhatsApp
        </p>

        <div className="field">
          <label htmlFor="paid-frete">{toCombine ? 'Frete combinado (R$)' : 'Frete (R$)'}</label>
          <input
            id="paid-frete"
            inputMode="decimal"
            placeholder="0,00"
            autoFocus
            value={freteText}
            onChange={(e) => setFreteText(e.target.value)}
          />
          <span className="meta" style={{ fontSize: 12 }}>
            {toCombine ? 'O valor que você combinou com a cliente. Deixe 0 se for retirada ou frete grátis.' : 'Pode ajustar se mudou na conversa.'}
          </span>
        </div>

        <div className="summary-breakdown">
          <div className="summary-line">
            <span>Itens</span>
            <span>{brl(subtotal)}</span>
          </div>
          {discount > 0 && (
            <div className="summary-line">
              <span>Desconto{order.coupon_code ? ` (${order.coupon_code})` : ''}</span>
              <span>-{brl(discount)}</span>
            </div>
          )}
          <div className="summary-line">
            <span>Frete</span>
            <span>{Number.isNaN(frete) ? '—' : brl(frete)}</span>
          </div>
          <div className="summary-line">
            <strong>Total pago</strong>
            <strong>{brl(total)}</strong>
          </div>
        </div>

        <p className="meta">O pedido vira Novo e entra na fila de produção.{order.customers?.email ? ' A cliente recebe o e-mail "Recebemos seu pedido".' : ''}</p>

        {error && <p className="order-email-failed">{error}</p>}

        <div className="email-actions" style={{ marginTop: 16 }}>
          <button type="button" className="btn btn-primary" disabled={saving || freteText.trim() === ''} onClick={handleConfirm}>
            {saving ? 'Salvando...' : 'Confirmar pagamento'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Voltar
          </button>
        </div>
      </div>
    </div>
  )
}
