import { Fragment, useEffect, useState } from 'react'
import {
  fetchOrders,
  updateOrderStatus,
  markOrderShipped,
  fetchOrderEmails,
  sendOrderEmail,
  fetchRescueCoupon,
  saveRescueCoupon,
} from '../../lib/orders'
import { buildWhatsappLink } from '../../lib/whatsapp'
import { formatCpf } from '../../lib/cpf'
import OrderEmailModal from './OrderEmailModal'
import CancelOrderModal from './CancelOrderModal'

const statusLabel = {
  'aguardando pagamento': 'Aguardando pagamento',
  novo: 'Novo',
  repassado: 'Repassado pra Gubo',
  enviado: 'Enviado',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
  expirado: 'Expirado',
}

const CLOSED = ['cancelado', 'expirado']

const FILTERS = [
  { id: 'ativos', label: 'Em andamento', test: (o) => !CLOSED.includes(o.status) },
  { id: 'aguardando', label: 'Aguardando pagamento', test: (o) => o.status === 'aguardando pagamento' },
  { id: 'entregues', label: 'Entregues', test: (o) => o.status === 'entregue' },
  { id: 'cancelados', label: 'Cancelados', test: (o) => o.status === 'cancelado' },
  { id: 'expirados', label: 'Expirados', test: (o) => o.status === 'expirado' },
  { id: 'todos', label: 'Todos', test: () => true },
]

// e-mail automático que sai em cada mudança de status feita no admin
const EMAIL_ON_STATUS = { repassado: 'producao', enviado: 'enviado', entregue: 'entregue' }

const EMAIL_LABEL = {
  recebido: 'Recebemos seu pedido',
  producao: 'Em produção',
  enviado: 'Pedido enviado',
  entregue: 'Pedido entregue',
  cancelado: 'Pedido cancelado',
  resgate: 'Resgate do carrinho',
}

const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'

const nextActionLabel = {
  novo: 'Marcar repassado',
  repassado: 'Marcar enviado',
  enviado: 'Marcar entregue',
}

const brl = (v) =>
  Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function addressLines(o) {
  const a = o.shipping_address || {}
  const rua = [a.endereco, a.numero].filter(Boolean).join(', ')
  const cidade = [a.cidade, a.uf].filter(Boolean).join('/')
  return [rua, a.complemento, a.bairro, cidade, a.cep ? `CEP ${a.cep}` : null].filter(Boolean)
}

// Texto pronto pra colar no pedido da Gubo / conversa com o cliente
function buildOrderText(o) {
  const itens = o.order_items
    .map((i) => `${i.qty}x ${i.product_name} - ${i.model_label} - ${i.color} - Tam. ${i.size}`)
    .join('\n')
  return [
    `Pedido #${o.id.slice(0, 8)}`,
    '',
    'ITENS',
    itens,
    '',
    'ENTREGA',
    o.shipping_service && o.shipping_service !== 'Frete fixo' ? `Frete: ${o.shipping_service}` : null,
    o.customers?.name,
    o.customer_cpf ? `CPF: ${formatCpf(o.customer_cpf)}` : null,
    ...addressLines(o),
    o.customers?.phone ? `Tel: ${o.customers.phone}` : null,
    o.customers?.email,
  ]
    .filter((l) => l !== null && l !== undefined)
    .join('\n')
}

export default function AdminOrders() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [openId, setOpenId] = useState(null)
  const [copiedId, setCopiedId] = useState(null)
  const [emailOrder, setEmailOrder] = useState(null)
  const [cancelOrderTarget, setCancelOrderTarget] = useState(null)
  const [filter, setFilter] = useState('ativos')
  const [emails, setEmails] = useState({}) // order_id -> e-mails enviados
  const [notice, setNotice] = useState(null) // { ok, text }
  const [rescueCoupon, setRescueCoupon] = useState('')
  const [rescueSaved, setRescueSaved] = useState('')

  function loadEmails() {
    fetchOrderEmails().then((rows) => {
      const map = {}
      for (const r of rows) (map[r.order_id] ||= []).push(r)
      setEmails(map)
    })
  }

  function load() {
    setLoading(true)
    fetchOrders()
      .then(setOrders)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
    loadEmails()
  }

  useEffect(load, [])

  useEffect(() => {
    fetchRescueCoupon()
      .then((c) => {
        setRescueCoupon(c)
        setRescueSaved(c)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 6000)
    return () => clearTimeout(t)
  }, [notice])

  // Dispara o e-mail automático do status e mostra o resultado
  async function notifyCustomer(order, kind) {
    // venda feita por fora: o "cliente" é a própria loja, não manda e-mail
    if (order.payment_method === 'venda_manual') return
    const r = await sendOrderEmail({ orderId: order.id, kind, auto: true })
    if (r.ok && r.skipped === 'already_sent') {
      setNotice({ ok: true, text: `O e-mail "${EMAIL_LABEL[kind]}" já tinha sido enviado antes.` })
    } else if (r.ok) {
      setNotice({ ok: true, text: `E-mail "${EMAIL_LABEL[kind]}" enviado pro cliente.` })
    } else if (r.skipped === 'not_configured') {
      setNotice({ ok: false, text: 'Status salvo. E-mails automáticos ainda não configurados: use o botão E-mail.' })
    } else {
      setNotice({ ok: false, text: `Status salvo, mas o e-mail não foi enviado: ${r.error}` })
    }
    loadEmails()
  }

  async function advance(order) {
    try {
      let next = null
      if (order.status === 'novo') {
        await updateOrderStatus(order.id, 'repassado')
        next = 'repassado'
      } else if (order.status === 'repassado') {
        const carrier = window.prompt('Transportadora (ex: Loggi, Correios):')
        if (!carrier) return
        const trackingCode = window.prompt('Código de rastreio:')
        if (!trackingCode) return
        await markOrderShipped(order.id, { carrier, trackingCode })
        next = 'enviado'
      } else if (order.status === 'enviado') {
        if (!window.confirm(`Marcar o pedido #${order.id.slice(0, 8)} como entregue?`)) return
        await updateOrderStatus(order.id, 'entregue')
        next = 'entregue'
      }
      load()
      if (next && EMAIL_ON_STATUS[next]) await notifyCustomer(order, EMAIL_ON_STATUS[next])
    } catch (err) {
      setNotice({ ok: false, text: `Não consegui mudar o status: ${err.message}` })
    }
  }

  async function handleCancelled(order, { notify }) {
    setCancelOrderTarget(null)
    load()
    if (notify) await notifyCustomer(order, 'cancelado')
    else setNotice({ ok: true, text: `Pedido #${order.id.slice(0, 8)} cancelado.` })
  }

  async function resend(order, kind) {
    if (!window.confirm(`Reenviar o e-mail "${EMAIL_LABEL[kind]}" pro cliente?`)) return
    const r = await sendOrderEmail({ orderId: order.id, kind, auto: false })
    setNotice(r.ok ? { ok: true, text: 'E-mail reenviado.' } : { ok: false, text: `Não foi: ${r.error}` })
    loadEmails()
  }

  async function handleSaveRescueCoupon() {
    try {
      await saveRescueCoupon(rescueCoupon)
      setRescueSaved(rescueCoupon.trim().toUpperCase())
      setRescueCoupon(rescueCoupon.trim().toUpperCase())
      setNotice({ ok: true, text: rescueCoupon.trim() ? 'Cupom do resgate salvo.' : 'Resgate sem cupom.' })
    } catch (err) {
      setNotice({ ok: false, text: `Não consegui salvar: ${err.message}` })
    }
  }

  async function copyOrder(o) {
    try {
      await navigator.clipboard.writeText(buildOrderText(o))
      setCopiedId(o.id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      window.prompt('Copie os dados do pedido:', buildOrderText(o))
    }
  }

  if (loading) return <p className="meta">Carregando pedidos...</p>
  if (error) return <p className="meta">Erro ao carregar pedidos: {error}</p>

  const activeFilter = FILTERS.find((f) => f.id === filter) || FILTERS[0]
  const visible = orders.filter(activeFilter.test)
  const origin = window.location.origin

  return (
    <div>
      <h2>Pedidos</h2>
      <div className="rule" />
      <div className="order-filters" role="tablist" aria-label="Filtrar pedidos">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={f.id === filter}
            className={f.id === filter ? 'is-active' : ''}
            onClick={() => setFilter(f.id)}
          >
            {f.label} <span className="order-filter-count">{orders.filter(f.test).length}</span>
          </button>
        ))}
      </div>
      {notice && (
        <p className={`order-notice ${notice.ok ? '' : 'is-error'}`} role="status">
          {notice.text}
        </p>
      )}
      {filter === 'expirados' && (
        <div className="rescue-box">
          <p>
            Pedido não pago expira sozinho em 24h. Umas 2h depois, o cliente recebe 1 e-mail de resgate com o
            link do carrinho. Quer incluir um cupom nesse e-mail?
          </p>
          <div className="rescue-box-row">
            <input
              aria-label="Cupom do e-mail de resgate"
              placeholder="Sem cupom"
              value={rescueCoupon}
              onChange={(e) => setRescueCoupon(e.target.value.toUpperCase())}
            />
            <button
              type="button"
              className="btn btn-secondary"
              disabled={rescueCoupon.trim().toUpperCase() === rescueSaved}
              onClick={handleSaveRescueCoupon}
            >
              Salvar
            </button>
          </div>
          <p className="meta">O cupom precisa existir e estar ativo em Cupons. Se estiver vencido, o e-mail sai sem ele.</p>
        </div>
      )}
      {visible.length === 0 ? (
        <p className="meta">{orders.length === 0 ? 'Nenhum pedido ainda.' : 'Nenhum pedido neste filtro.'}</p>
      ) : (
        <table className="orders-table">
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Cliente</th>
              <th>Itens</th>
              <th>Frete</th>
              <th>Total</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((o) => {
              const whatsappLink = buildWhatsappLink(o, { origin })
              const orderEmails = emails[o.id] || []
              const isOpen = openId === o.id
              const subtotal = o.order_items.reduce((sum, i) => sum + Number(i.unit_price) * i.qty, 0)
              return (
                <Fragment key={o.id}>
                <tr>
                  <td data-label="Pedido">#{o.id.slice(0, 8)}</td>
                  <td data-label="Cliente">{o.customers?.name ?? '—'}</td>
                  <td data-label="Itens">
                    {o.order_items
                      .map((i) => `${i.qty}x ${i.product_name} · ${i.model_label} · ${i.color} · ${i.size}`)
                      .join(', ')}
                  </td>
                  <td data-label="Frete">
                    {Number(o.shipping_fee ?? 0).toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    })}
                  </td>
                  <td data-label="Total">
                    {Number(o.total).toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    })}
                  </td>
                  <td data-label="Status">
                    <span className={`status-badge status-${o.status}`}>
                      {statusLabel[o.status] ?? o.status}
                    </span>
                    {o.late_payment && (
                      <div className="order-alert">
                        {o.status === 'cancelado' ? 'Pago depois de cancelar: estornar no MP' : 'Pago depois de expirar: conferir'}
                      </div>
                    )}
                    {(o.status === 'enviado' || o.status === 'entregue') && o.tracking_code && (
                      <div className="meta" style={{ marginTop: 4 }}>
                        {o.carrier}: {o.tracking_code}
                      </div>
                    )}
                  </td>
                  <td style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      className="btn btn-secondary"
                      onClick={() => setOpenId(isOpen ? null : o.id)}
                    >
                      {isOpen ? 'Fechar' : 'Detalhes'}
                    </button>
                    {nextActionLabel[o.status] && (
                      <button className="btn btn-secondary" onClick={() => advance(o)}>
                        {nextActionLabel[o.status]}
                      </button>
                    )}
                    {o.status !== 'aguardando pagamento' && (
                      <button className="btn btn-secondary" onClick={() => setEmailOrder(o)}>
                        {o.status === 'expirado' ? 'Resgatar' : 'E-mail'}
                      </button>
                    )}
                    {whatsappLink && o.status !== 'aguardando pagamento' && (
                      <a
                        href={whatsappLink}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-secondary"
                      >
                        WhatsApp
                      </a>
                    )}
                  </td>
                </tr>
                {isOpen && (
                  <tr className="order-detail-row">
                    <td colSpan={7}>
                      <div className="order-detail">
                        <div>
                          <h4>Cliente</h4>
                          <p>{o.customers?.name ?? '—'}</p>
                          <p>{o.customers?.email ?? '—'}</p>
                          <p>{o.customers?.phone ?? '—'}</p>
                          <p>CPF: {o.customer_cpf ? formatCpf(o.customer_cpf) : '—'}</p>
                        </div>
                        <div>
                          <h4>Entrega</h4>
                          {addressLines(o).map((l, idx) => (
                            <p key={idx}>{l}</p>
                          ))}
                          {o.tracking_code && (
                            <p>
                              {o.carrier}: {o.tracking_code}
                            </p>
                          )}
                        </div>
                        <div className="order-detail-wide">
                          <h4>Itens</h4>
                          {o.order_items.map((i) => (
                            <p key={i.id} className="order-detail-item">
                              <span>
                                {i.qty}x {i.product_name} · {i.model_label} · {i.color} · Tam. {i.size}
                              </span>
                              <span>{brl(Number(i.unit_price) * i.qty)}</span>
                            </p>
                          ))}
                        </div>
                        <div className="order-detail-values">
                          <h4>Valores</h4>
                          <p className="order-detail-item">
                            <span>Subtotal</span>
                            <span>{brl(subtotal)}</span>
                          </p>
                          {Number(o.discount_amount) > 0 && (
                            <p className="order-detail-item">
                              <span>Desconto{o.coupon_code ? ` (${o.coupon_code})` : ''}</span>
                              <span>-{brl(o.discount_amount)}</span>
                            </p>
                          )}
                          {!Number(o.discount_amount) && o.coupon_code && (
                            <p className="order-detail-item">
                              <span>Cupom</span>
                              <span>{o.coupon_code}</span>
                            </p>
                          )}
                          {o.ref && (
                            <p className="order-detail-item">
                              <span>Link da Crew</span>
                              <span>{o.ref}</span>
                            </p>
                          )}
                          <p className="order-detail-item">
                            <span>Frete</span>
                            <span>{Number(o.shipping_fee) > 0 ? brl(o.shipping_fee) : 'Grátis'}</span>
                          </p>
                          {o.shipping_service && (
                            <p className="order-detail-item">
                              <span>Transportadora</span>
                              <span>
                                {o.shipping_service}
                                {o.shipping_days ? ` · ${o.shipping_days} dias úteis` : ''}
                              </span>
                            </p>
                          )}
                          <p className="order-detail-item order-detail-total">
                            <span>Total</span>
                            <span>{brl(o.total)}</span>
                          </p>
                        </div>
                        <div className="order-detail-meta">
                          <h4>Pedido</h4>
                          <p>
                            {o.created_at
                              ? new Date(o.created_at).toLocaleString('pt-BR', {
                                  dateStyle: 'short',
                                  timeStyle: 'short',
                                })
                              : '—'}
                          </p>
                          <p>Pagamento: {o.payment_method ?? '—'}</p>
                          <p>Situação: {o.payment_status ?? '—'}</p>
                          {CLOSED.includes(o.status) && (
                            <p>
                              {statusLabel[o.status]} em {fmtDateTime(o.cancelled_at)}
                              {o.cancel_reason ? ` · ${o.cancel_reason}` : ''}
                            </p>
                          )}
                          <button
                            className="btn btn-secondary"
                            style={{ marginTop: 10 }}
                            onClick={() => copyOrder(o)}
                          >
                            {copiedId === o.id ? 'Copiado!' : 'Copiar dados do pedido'}
                          </button>
                          {!CLOSED.includes(o.status) && (
                            <button
                              className="btn btn-secondary btn-danger-outline"
                              style={{ marginTop: 10 }}
                              onClick={() => setCancelOrderTarget(o)}
                            >
                              Cancelar pedido
                            </button>
                          )}
                        </div>
                        <div className="order-detail-wide">
                          <h4>E-mails pro cliente</h4>
                          {orderEmails.length === 0 ? (
                            <p className="meta">Nenhum e-mail automático enviado ainda.</p>
                          ) : (
                            orderEmails.map((em) => (
                              <p key={em.id} className="order-detail-item">
                                <span>
                                  {EMAIL_LABEL[em.kind] ?? em.kind}
                                  {em.auto ? '' : ' (reenvio)'} · {fmtDateTime(em.created_at)}
                                  {em.status === 'failed' && (
                                    <span className="order-email-failed"> · não enviado{em.error ? `: ${em.error}` : ''}</span>
                                  )}
                                  {em.status === 'sending' && <span className="meta"> · enviando</span>}
                                </span>
                                <button type="button" className="btn-link" onClick={() => resend(o, em.kind)}>
                                  Reenviar
                                </button>
                              </p>
                            ))
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      )}
      {emailOrder && (
        <OrderEmailModal
          order={emailOrder}
          onClose={() => setEmailOrder(null)}
          onSent={() => {
            loadEmails()
            setNotice({ ok: true, text: 'E-mail enviado pelo site.' })
          }}
        />
      )}
      {cancelOrderTarget && (
        <CancelOrderModal
          order={cancelOrderTarget}
          onClose={() => setCancelOrderTarget(null)}
          onCancelled={(opts) => handleCancelled(cancelOrderTarget, opts)}
        />
      )}
    </div>
  )
}
