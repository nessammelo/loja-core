import { Link, useNavigate } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { describeDelivery, formatCep, useShippingQuote } from '../lib/shipping'
import { useStoreModes, cartWhatsappUrl } from '../lib/storeModes'

const brl = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function Cart() {
  const { items, removeItem, subtotal, cep, setCep } = useCart()
  const navigate = useNavigate()
  const modes = useStoreModes()
  const autoShipping = modes.shipping === 'auto'
  const viaWhatsapp = modes.payment === 'whatsapp'
  // no frete combinado pelo WhatsApp, não cota (CEP vazio = nenhuma cotação)
  const shipping = useShippingQuote(autoShipping ? cep : '', items)
  const fee = shipping.quote ? Number(shipping.quote.price) : null
  const whatsappUrl = viaWhatsapp
    ? cartWhatsappUrl(
        items,
        subtotal,
        autoShipping && fee !== null ? { fee, service: shipping.quote?.serviceName, cep: formatCep(cep) } : null
      )
    : ''
  const total = subtotal + (fee ?? 0)
  const delivery = describeDelivery(shipping.quote)

  if (items.length === 0) {
    return (
      <div className="container empty-state">
        <h2>Seu carrinho está vazio</h2>
        <p style={{ margin: '16px 0 24px' }}>
          Adicione uma peça pra começar.
        </p>
        <Link to="/" className="btn btn-primary">
          Ver produtos
        </Link>
      </div>
    )
  }

  return (
    <div className="container" style={{ paddingBottom: 80 }}>
      <div style={{ paddingTop: 40 }}>
        <h1>Carrinho</h1>
        <div className="rule" />
      </div>

      {items.map((item, i) => (
        <div className="cart-row" key={i}>
          <div>
            <div>{item.productName}</div>
            <div className="meta">
              {item.modelLabel} · {item.color} · Tam. {item.size} · Qtd{' '}
              {item.qty}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span>
              {(item.price * item.qty).toLocaleString('pt-BR', {
                style: 'currency',
                currency: 'BRL',
              })}
            </span>
            <button
              className="btn btn-secondary"
              onClick={() => removeItem(i)}
            >
              Remover
            </button>
          </div>
        </div>
      ))}

      <div className="summary-breakdown">
        <div className="summary-line">
          <span>Subtotal</span>
          <span>
            {subtotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </span>
        </div>
        <div className="summary-line">
          <span>Frete</span>
          <span>
            {!autoShipping
              ? 'Combinado no WhatsApp'
              : shipping.status === 'loading'
                ? 'Calculando...'
                : fee !== null
                  ? brl(fee)
                  : 'Informe o CEP'}
          </span>
        </div>
        {delivery && (
          <div className="summary-line meta">
            <span>{delivery}</span>
          </div>
        )}
      </div>

      {autoShipping && (
      <div className="field shipping-cep">
        <label htmlFor="cep-carrinho">Calcular frete</label>
        <input
          id="cep-carrinho"
          inputMode="numeric"
          autoComplete="postal-code"
          placeholder="00000-000"
          value={formatCep(cep)}
          onChange={(e) => setCep(formatCep(e.target.value))}
        />
      </div>
      )}

      <div className="cart-summary">
        <span>{fee === null ? 'Subtotal' : 'Total'}</span>
        <span>{brl(total)}</span>
      </div>

      {!viaWhatsapp ? (
        <button className="btn btn-primary" onClick={() => navigate('/checkout')}>
          Ir para o checkout
        </button>
      ) : whatsappUrl ? (
        <>
          <a className="btn btn-primary" href={whatsappUrl} target="_blank" rel="noreferrer">
            Finalizar pelo WhatsApp
          </a>
          <p className="meta" style={{ marginTop: 12 }}>
            Abre uma conversa com a loja com a lista dos itens pronta. Pagamento e entrega são combinados por lá.
          </p>
        </>
      ) : (
        <p className="report-warn">WhatsApp da loja ainda não configurado.</p>
      )}
    </div>
  )
}
