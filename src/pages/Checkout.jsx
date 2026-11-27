import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { createOrder } from '../lib/orders'
import { validateCoupon } from '../lib/coupons'
import { COUPON_PREFILL_KEY } from './RescueCart'
import { describeDelivery, formatCep, onlyDigits, useShippingQuote } from '../lib/shipping'
import { formatCpf, isValidCpf, cpfDigits } from '../lib/cpf'
import { getStoredRef } from '../lib/crewRef'

// Mensagem do cupom aplicado. No progressivo, mostra a faixa e quanto falta pra próxima.
function couponAppliedMessage(result) {
  if (result.type === 'tiered' && result.tier) {
    const { qty, percent, next_min_qty: nextQty, next_percent: nextPercent } = result.tier
    let msg = `Cupom aplicado: ${Number(percent)}% de desconto com ${qty} ${qty === 1 ? 'peça' : 'peças'}.`
    if (nextQty && nextPercent) {
      const falta = nextQty - qty
      msg += ` Leva mais ${falta} ${falta === 1 ? 'peça' : 'peças'} e sobe pra ${Number(nextPercent)}%.`
    }
    return msg
  }
  return result.restricted ? 'Cupom aplicado nos itens elegíveis!' : 'Cupom aplicado!'
}

export default function Checkout() {
  const { items, subtotal, clearCart, cep, setCep } = useCart()
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [form, setForm] = useState({
    nome: '',
    email: '',
    telefone: '',
    cpf: '',
    endereco: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    uf: '',
  })
  const cpfComplete = cpfDigits(form.cpf).length === 11
  const cpfInvalid = cpfComplete && !isValidCpf(form.cpf)

  // Preenche rua, bairro, cidade e UF pelo CEP (ViaCEP). Só completa o que estiver vazio.
  const cepDigits = onlyDigits(cep)
  useEffect(() => {
    if (cepDigits.length !== 8) return
    let cancelled = false
    fetch(`https://viacep.com.br/ws/${cepDigits}/json/`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d || d.erro) return
        setForm((f) => ({
          ...f,
          endereco: f.endereco || d.logradouro || '',
          bairro: f.bairro || d.bairro || '',
          cidade: f.cidade || d.localidade || '',
          uf: f.uf || d.uf || '',
        }))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [cepDigits])

  // cupom que veio do link de resgate do carrinho (o cliente só clica Aplicar)
  const [couponInput, setCouponInput] = useState(() => {
    try {
      return localStorage.getItem(COUPON_PREFILL_KEY) || ''
    } catch {
      return ''
    }
  })
  const [coupon, setCoupon] = useState(null) // resultado de validate_coupon aplicado
  const [couponChecking, setCouponChecking] = useState(false)
  const [couponMessage, setCouponMessage] = useState(null)

  const shippingQuote = useShippingQuote(cep, items)
  const shipping = shippingQuote.quote ? Number(shippingQuote.quote.price) : 0
  const shippingReady = shippingQuote.status === 'ready'
  const delivery = describeDelivery(shippingQuote.quote)

  const discount = coupon?.valid ? Number(coupon.discount_amount || 0) : 0
  const shippingAfterCoupon = coupon?.free_shipping ? 0 : shipping
  const total = subtotal - discount + shippingAfterCoupon

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }))
  }

  async function handleApplyCoupon() {
    if (!couponInput.trim()) return
    setCouponChecking(true)
    setCouponMessage(null)
    try {
      const result = await validateCoupon(couponInput.trim(), items)
      if (result.valid) {
        setCoupon(result)
        setCouponMessage(couponAppliedMessage(result))
      } else {
        setCoupon(null)
        setCouponMessage(result.message || 'Cupom inválido.')
      }
    } catch (err) {
      setCoupon(null)
      setCouponMessage('Não deu pra validar o cupom agora.')
    } finally {
      setCouponChecking(false)
    }
  }

  function handleRemoveCoupon() {
    setCoupon(null)
    setCouponInput('')
    setCouponMessage(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!shippingReady) return
    if (!isValidCpf(form.cpf)) {
      setError('CPF inválido. Confira os números.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const orderId = await createOrder({
        customer: form,
        address: {
          cep: formatCep(cep),
          endereco: form.endereco,
          numero: form.numero,
          complemento: form.complemento,
          bairro: form.bairro.trim(),
          cidade: form.cidade,
          uf: form.uf.trim().toUpperCase(),
        },
        items,
        shippingQuoteId: shippingQuote.quote?.quoteId ?? null,
        couponCode: coupon?.valid ? couponInput.trim() : null,
        paymentMethod: 'mercado_pago',
      })

      const res = await fetch('/.netlify/functions/create-preference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, ref: getStoredRef() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Não deu pra criar o pagamento')

      clearCart()
      try {
        localStorage.removeItem(COUPON_PREFILL_KEY)
      } catch {
        // sem armazenamento: tudo bem
      }
      window.location.href = data.initPoint
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (items.length === 0) {
    return (
      <div className="container empty-state">
        <p>Seu carrinho está vazio.</p>
      </div>
    )
  }

  return (
    <div className="container" style={{ paddingBottom: 80 }}>
      <div style={{ paddingTop: 40 }}>
        <h1>Checkout</h1>
        <div className="rule" />
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-grid full">
          <div className="field">
            <label htmlFor="nome">Nome completo</label>
            <input
              id="nome"
              required
              value={form.nome}
              onChange={update('nome')}
            />
          </div>
        </div>

        <div className="form-grid">
          <div className="field">
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              type="email"
              required
              value={form.email}
              onChange={update('email')}
            />
          </div>
          <div className="field">
            <label htmlFor="telefone">Telefone</label>
            <input
              id="telefone"
              required
              value={form.telefone}
              onChange={update('telefone')}
            />
          </div>
        </div>

        <div className="form-grid">
          <div className="field">
            <label htmlFor="cpf">CPF</label>
            <input
              id="cpf"
              required
              inputMode="numeric"
              placeholder="000.000.000-00"
              value={form.cpf}
              onChange={(e) => setForm((f) => ({ ...f, cpf: formatCpf(e.target.value) }))}
              aria-invalid={cpfInvalid}
              aria-describedby="cpf-hint"
            />
            <span
              id="cpf-hint"
              className="meta"
              style={{ fontSize: 12, color: cpfInvalid ? 'var(--danger)' : 'var(--text-muted)' }}
            >
              {cpfInvalid
                ? 'CPF inválido. Confira os números.'
                : 'A transportadora exige o CPF de quem recebe.'}
            </span>
          </div>
        </div>

        <div className="form-grid">
          <div className="field">
            <label htmlFor="cep">CEP</label>
            <input
              id="cep"
              required
              inputMode="numeric"
              autoComplete="postal-code"
              placeholder="00000-000"
              pattern="[0-9]{5}-?[0-9]{3}"
              value={formatCep(cep)}
              onChange={(e) => setCep(formatCep(e.target.value))}
            />
          </div>
          <div className="field">
            <label htmlFor="bairro">Bairro</label>
            <input
              id="bairro"
              required
              value={form.bairro}
              onChange={update('bairro')}
            />
          </div>
        </div>

        <div className="form-grid">
          <div className="field">
            <label htmlFor="cidade">Cidade</label>
            <input
              id="cidade"
              required
              value={form.cidade}
              onChange={update('cidade')}
            />
          </div>
          <div className="field">
            <label htmlFor="uf">Estado (UF)</label>
            <input
              id="uf"
              required
              maxLength={2}
              placeholder="RS"
              pattern="[A-Za-z]{2}"
              autoComplete="address-level1"
              value={form.uf}
              onChange={(e) => setForm((f) => ({ ...f, uf: e.target.value.toUpperCase() }))}
            />
          </div>
        </div>

        <div className="form-grid">
          <div className="field">
            <label htmlFor="endereco">Endereço</label>
            <input
              id="endereco"
              required
              value={form.endereco}
              onChange={update('endereco')}
            />
          </div>
          <div className="field">
            <label htmlFor="numero">Número</label>
            <input
              id="numero"
              required
              value={form.numero}
              onChange={update('numero')}
            />
          </div>
        </div>

        <div className="form-grid">
          <div className="field">
            <label htmlFor="complemento">Complemento (opcional)</label>
            <input
              id="complemento"
              placeholder="Apto, bloco, referência..."
              value={form.complemento}
              onChange={update('complemento')}
            />
          </div>
        </div>

        <div className="form-grid full" style={{ maxWidth: 560 }}>
          <div className="field">
            <label htmlFor="cupom">Cupom de desconto (opcional)</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                id="cupom"
                placeholder="Ex: EDGE10"
                value={couponInput}
                disabled={Boolean(coupon?.valid)}
                onChange={(e) => setCouponInput(e.target.value)}
              />
              {coupon?.valid ? (
                <button type="button" className="btn btn-secondary" onClick={handleRemoveCoupon}>
                  Remover
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleApplyCoupon}
                  disabled={couponChecking || !couponInput.trim()}
                >
                  {couponChecking ? 'Verificando...' : 'Aplicar'}
                </button>
              )}
            </div>
            {couponMessage && (
              <p
                className="meta"
                style={{ color: coupon?.valid ? 'var(--text)' : 'var(--danger)', marginTop: 4 }}
              >
                {couponMessage}
              </p>
            )}
          </div>
        </div>

        <div className="summary-breakdown" style={{ maxWidth: 560 }}>
          <div className="summary-line">
            <span>Subtotal</span>
            <span>
              {subtotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </span>
          </div>
          {discount > 0 && (
            <div className="summary-line">
              <span>Desconto ({couponInput.trim().toUpperCase()})</span>
              <span>
                -{discount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </span>
            </div>
          )}
          <div className="summary-line">
            <span>Frete</span>
            <span>
              {shippingQuote.status === 'loading'
                ? 'Calculando...'
                : !shippingReady
                  ? 'Informe o CEP'
                  : shippingAfterCoupon === 0 && coupon?.free_shipping
                    ? 'Grátis'
                    : shippingAfterCoupon.toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                      })}
            </span>
          </div>
          {delivery && (
            <div className="summary-line">
              <span>{delivery}</span>
            </div>
          )}
        </div>

        <div className="cart-summary" style={{ maxWidth: 560 }}>
          <span>Total</span>
          <span>
            {total.toLocaleString('pt-BR', {
              style: 'currency',
              currency: 'BRL',
            })}
          </span>
        </div>

        <p className="meta" style={{ marginBottom: 20, color: 'var(--text-muted)', fontSize: 13 }}>
          Ao finalizar, você é redirecionado pro Mercado Pago pra pagar via Pix
          ou cartão.
        </p>

        {error && (
          <p className="meta" style={{ color: 'var(--danger)', marginBottom: 12 }}>
            Não deu pra finalizar: {error}
          </p>
        )}

        <button className="btn btn-primary" type="submit" disabled={submitting || !shippingReady}>
          {submitting
            ? 'Redirecionando...'
            : shippingQuote.status === 'loading'
              ? 'Calculando frete...'
              : onlyDigits(cep).length !== 8
                ? 'Informe o CEP'
                : 'Ir pro pagamento'}
        </button>
      </form>
    </div>
  )
}
