import { useEffect, useState } from 'react'
import { cancelOrder } from '../../lib/orders'
import { brand } from '../../brand'

const REASONS = ['Cliente desistiu', ...brand.features.cancelReasons, 'Pedido duplicado', 'Pedido de teste', 'Outro']

const brl = (v) => Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function CancelOrderModal({ order, onClose, onCancelled }) {
  const paid = order.payment_status === 'approved'
  const [reason, setReason] = useState(REASONS[0])
  const [other, setOther] = useState('')
  const [notify, setNotify] = useState(Boolean(order.customers?.email) && order.payment_method !== 'venda_manual')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleConfirm() {
    const finalReason = reason === 'Outro' ? other.trim() : reason
    setSaving(true)
    setError(null)
    try {
      await cancelOrder(order.id, finalReason)
      onCancelled({ notify })
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
        aria-label="Cancelar pedido"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="email-modal-head">
          <h3>Cancelar pedido #{order.id.slice(0, 8)}</h3>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Fechar
          </button>
        </div>

        <p className="meta" style={{ marginTop: 0 }}>
          {order.customers?.name ?? 'Cliente'} · {brl(order.total)}
        </p>

        {paid && (
          <div className="cancel-warning">
            <b>Este pedido foi pago.</b> Cancelar aqui não devolve o dinheiro: faça o estorno de {brl(order.total)} no
            painel do Mercado Pago (Atividades &gt; pagamento &gt; Devolver).{' '}
            <a href="https://www.mercadopago.com.br/activities" target="_blank" rel="noreferrer">
              Abrir Mercado Pago
            </a>
            <br />
            Se você estornar primeiro no MP, a loja cancela o pedido sozinha.
          </div>
        )}

        <div className="field">
          <label htmlFor="cancel-reason">Motivo</label>
          <select id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
            {REASONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </div>
        {reason === 'Outro' && (
          <div className="field">
            <label htmlFor="cancel-other">Qual?</label>
            <input id="cancel-other" value={other} onChange={(e) => setOther(e.target.value)} maxLength={200} />
          </div>
        )}

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={notify}
            disabled={!order.customers?.email}
            onChange={(e) => setNotify(e.target.checked)}
          />
          Avisar o cliente por e-mail
        </label>
        {order.coupon_code && paid && (
          <p className="meta">O uso do cupom {order.coupon_code} volta a ficar disponível.</p>
        )}
        <p className="meta">O pedido sai do relatório de vendas. Não dá pra desfazer.</p>

        {error && <p className="order-email-failed">Não consegui cancelar: {error}</p>}

        <div className="email-actions" style={{ marginTop: 16 }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving || (reason === 'Outro' && !other.trim())}
            onClick={handleConfirm}
          >
            {saving ? 'Cancelando...' : 'Cancelar pedido'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Voltar
          </button>
        </div>
      </div>
    </div>
  )
}
