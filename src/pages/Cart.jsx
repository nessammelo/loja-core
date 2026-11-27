import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { describeDelivery, formatCep, useShippingQuote } from '../lib/shipping'
import { useStoreModes, cartWhatsappUrl } from '../lib/storeModes'
import { createWhatsappOrder } from '../lib/orders'
import { storageKey } from '../brand'

// nome e WhatsApp ficam salvos no aparelho pra próxima compra
const CONTACT_KEY = storageKey('contato')
function loadContact() {
  try {
    return { nome: '', telefone: '', email: '', ...JSON.parse(localStorage.getItem(CONTACT_KEY) || '{}') }
  } catch {
    return { nome: '', telefone: '', email: '' }
  }
}

function formatPhone(v) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`
}

const brl = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function Cart() {
  const { items, removeItem, subtotal, cep, setCep, clearCart } = useCart()
  const [contact, setContact] = useState(loadContact)
  const [sending, setSending] = useState(false)
  const [formError, setFormError] = useState(null)
  const navigate = useNavigate()
  const modes = useStoreModes()
  const autoShipping = modes.shipping === 'auto'
  const viaWhatsapp = modes.payment === 'whatsapp'
  // no frete combinado pelo WhatsApp, não cota (CEP vazio = nenhuma cotação)
  const shipping = useShippingQuote(autoShipping ? cep : '', items)
  const fee = shipping.quote ? Number(shipping.quote.price) : null
  const shippingInfo =
    autoShipping && fee !== null ? { fee, service: shipping.quote?.serviceName, cep: formatCep(cep) } : null
  const whatsappUrl = viaWhatsapp ? cartWhatsappUrl(items, subtotal, shippingInfo) : ''

  function setField(k, v) {
    setContact((c) => ({ ...c, [k]: v }))
    setFormError(null)
  }

  // registra o pedido no admin e abre a conversa já com o número do pedido
  async function finishWhatsapp(e) {
    e.preventDefault()
    setFormError(null)
    const nome = contact.nome.trim()
    const telefone = contact.telefone.replace(/\D/g, '')
    const email = contact.email.trim()
    if (nome.length < 2) return setFormError('Informe seu nome.')
    if (telefone.length < 10) return setFormError('Informe seu WhatsApp com DDD.')
    if (autoShipping && fee === null) return setFormError('Informe o CEP pra calcular o frete.')
    setSending(true)
    let orderId = null
    try {
      orderId = await createWhatsappOrder({
        nome,
        telefone,
        email,
        items,
        cep: autoShipping ? cep : null,
        shippingQuoteId: autoShipping ? shipping.quote?.quoteId : null,
      })
    } catch (err) {
      // Erro de dado (nome, telefone, item indisponível): mostra e para.
      // Falha de rede/servidor: segue pro WhatsApp mesmo assim, pra não perder a venda.
      if (err?.code === 'P0001') {
        setSending(false)
        return setFormError(err.message)
      }
      console.error('Pedido não registrado no admin', err)
    }
    try {
      localStorage.setItem(CONTACT_KEY, JSON.stringify({ nome, telefone: contact.telefone, email }))
    } catch {
      // sem localStorage: tudo bem
    }
    const url = cartWhatsappUrl(items, subtotal, shippingInfo, orderId)
    if (orderId) clearCart()
    window.location.assign(url)
  }
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
        <form className="whatsapp-checkout" onSubmit={finishWhatsapp} noValidate>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="wa-nome">Seu nome</label>
              <input
                id="wa-nome"
                autoComplete="name"
                value={contact.nome}
                onChange={(e) => setField('nome', e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="wa-telefone">Seu WhatsApp</label>
              <input
                id="wa-telefone"
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="(11) 99999-9999"
                value={contact.telefone}
                onChange={(e) => setField('telefone', formatPhone(e.target.value))}
              />
            </div>
            <div className="field">
              <label htmlFor="wa-email">E-mail (opcional)</label>
              <input
                id="wa-email"
                type="email"
                autoComplete="email"
                value={contact.email}
                onChange={(e) => setField('email', e.target.value)}
              />
            </div>
          </div>
          {formError && <p className="report-warn">{formError}</p>}
          <button className="btn btn-primary" type="submit" disabled={sending}>
            {sending ? 'Abrindo o WhatsApp...' : 'Finalizar pelo WhatsApp'}
          </button>
          <p className="meta" style={{ marginTop: 12 }}>
            Abre uma conversa com a loja com a lista dos itens pronta. Pagamento e entrega são combinados por lá.
          </p>
        </form>
      ) : (
        <p className="report-warn">WhatsApp da loja ainda não configurado.</p>
      )}
    </div>
  )
}
