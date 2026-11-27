import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { fetchRescueCart } from '../lib/orders'
import { storageKey } from '../brand'

export const COUPON_PREFILL_KEY = storageKey('coupon_prefill_v1')

const brl = (v) => Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Link do e-mail de resgate: /carrinho/recuperar/<pedido>?cupom=XXX
// Remonta o carrinho com as mesmas peças (preço sempre o atual) e leva pro carrinho.
export default function RescueCart() {
  const { orderId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { items, addItem } = useCart()
  const [state, setState] = useState({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    fetchRescueCart(orderId)
      .then((data) => {
        if (cancelled) return
        const all = data?.items || []
        if (all.length === 0) {
          setState({ status: 'empty' })
          return
        }
        const available = all.filter((i) => i.available)
        const missing = all.filter((i) => !i.available)
        const changed = available.filter((i) => Number(i.price) !== Number(i.old_price))

        // não duplica se o cliente abrir o link duas vezes
        for (const i of available) {
          const already = items.some(
            (c) =>
              c.productId === i.product_slug &&
              c.modelId === i.model_label &&
              c.size === i.size &&
              c.color === i.color
          )
          if (already) continue
          addItem({
            productId: i.product_slug,
            productName: i.product_name,
            modelId: i.model_label,
            modelLabel: i.model_label,
            size: i.size,
            color: i.color,
            price: Number(i.price),
            qty: i.qty,
            variantId: i.variant_id,
          })
        }

        const cupom = (searchParams.get('cupom') || '').trim().toUpperCase().slice(0, 40)
        if (cupom) {
          try {
            localStorage.setItem(COUPON_PREFILL_KEY, cupom)
          } catch {
            // sem armazenamento: o cliente digita o cupom
          }
        }

        if (missing.length === 0 && changed.length === 0) {
          navigate('/carrinho', { replace: true })
        } else {
          setState({ status: 'notes', missing, changed, cupom, count: available.length })
        }
      })
      .catch(() => !cancelled && setState({ status: 'empty' }))
    return () => {
      cancelled = true
    }
    // roda uma vez só, ao abrir o link
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId])

  if (state.status === 'loading') {
    return (
      <div className="container empty-state">
        <p className="meta">Separando suas peças...</p>
      </div>
    )
  }

  if (state.status === 'empty') {
    return (
      <div className="container empty-state">
        <h1>Link expirado</h1>
        <div className="rule" style={{ margin: '16px auto 20px' }} />
        <p style={{ marginBottom: 24 }}>Este carrinho não está mais disponível. Mas a loja está aqui.</p>
        <Link to="/" className="btn btn-primary">
          Ver a loja
        </Link>
      </div>
    )
  }

  return (
    <div className="container empty-state rescue-page">
      <h1>Seu carrinho voltou</h1>
      <div className="rule" style={{ margin: '16px auto 20px' }} />
      {state.missing.length > 0 && (
        <>
          <p>Algumas peças não estão mais à venda e ficaram de fora:</p>
          <ul>
            {state.missing.map((i, idx) => (
              <li key={idx}>
                {i.product_name} · {i.model_label} · {i.color} · Tam. {i.size}
              </li>
            ))}
          </ul>
        </>
      )}
      {state.changed.length > 0 && (
        <>
          <p>O preço de algumas peças mudou. Vale o preço atual:</p>
          <ul>
            {state.changed.map((i, idx) => (
              <li key={idx}>
                {i.product_name} · {i.model_label}: {brl(i.price)}
              </li>
            ))}
          </ul>
        </>
      )}
      {state.cupom && <p>O cupom {state.cupom} já fica preenchido no checkout.</p>}
      {state.count > 0 ? (
        <Link to="/carrinho" className="btn btn-primary" style={{ marginTop: 16 }}>
          Ir pro carrinho
        </Link>
      ) : (
        <Link to="/" className="btn btn-primary" style={{ marginTop: 16 }}>
          Ver a loja
        </Link>
      )}
    </div>
  )
}
