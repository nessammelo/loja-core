import { useEffect, useMemo, useState } from 'react'
import { fetchOrders } from '../../lib/orders'
import { PERIODS, periodRange, buildReport, buildCsv, athleteSummary } from '../../lib/salesReport'
import { fetchCostMap, fetchFees, saveFees, DEFAULT_FEES } from '../../lib/costs'
import { fetchCoupons } from '../../lib/coupons'
import { brand, hasPartnerRefs } from '../../brand'
const pct = (v) => `${(Number(v || 0) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`

function AthleteCard({ a, range }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(athleteSummary(a, range))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setOpen(true)
    }
  }
  return (
    <li className="athlete">
      <div className="athlete-row">
        <div>
          <strong>{a.athlete}</strong>
          <span className="meta">
            {' '}
            · {a.coupons.join(', ')} · {a.orders.length} {a.orders.length === 1 ? 'pedido' : 'pedidos'} · {a.pieces}{' '}
            {a.pieces === 1 ? 'peça' : 'peças'} · vendeu {brl(a.base)}
          </span>
        </div>
        <div className="athlete-actions">
          <span className="athlete-total">{brl(a.commission)}</span>
          <button className="btn btn-secondary btn-sm" onClick={copy}>
            {copied ? 'Copiado!' : 'Copiar resumo'}
          </button>
          <button className="link-button" onClick={() => setOpen((v) => !v)}>
            {open ? 'Esconder' : 'Ver pedidos'}
          </button>
        </div>
      </div>
      {open && <pre className="athlete-summary">{athleteSummary(a, range)}</pre>}
    </li>
  )
}

const brl = (v) => Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const int = (v) => Number(v ?? 0).toLocaleString('pt-BR')
const dm = (day) => day.slice(8, 10) + '/' + day.slice(5, 7)

function RankTable({ title, rows, limit = 10 }) {
  const shown = rows.slice(0, limit)
  const max = Math.max(1, ...shown.map((r) => r.qty))
  return (
    <section className="report-card">
      <h3>{title}</h3>
      {shown.length === 0 ? (
        <p className="meta">Sem vendas no período.</p>
      ) : (
        <ul className="report-rank">
          {shown.map((r) => (
            <li key={r.label}>
              <div className="report-rank-row">
                <span className="report-rank-label">{r.label}</span>
                <span className="report-rank-num">
                  {int(r.qty)} {r.qty === 1 ? 'peça' : 'peças'} · {brl(r.revenue)}
                </span>
              </div>
              <div className="report-bar-track">
                <div className="report-bar" style={{ width: `${(r.qty / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function DayChart({ days }) {
  if (days.length === 0) return <p className="meta">Sem vendas no período.</p>
  const max = Math.max(1, ...days.map((d) => d.revenue))
  const step = Math.ceil(days.length / 6) // no máximo ~6 rótulos no eixo
  return (
    <div className="report-days" role="img" aria-label="Faturamento por dia">
      {days.map((d, idx) => (
        <div
          key={d.day}
          className="report-day"
          title={`${dm(d.day)}: ${brl(d.revenue)} (${d.orders} ${d.orders === 1 ? 'pedido' : 'pedidos'})`}
        >
          <div className="report-day-bar-wrap">
            <div
              className={`report-day-bar${d.revenue === 0 ? ' empty' : ''}`}
              style={{ height: `${Math.max(d.revenue ? 4 : 1, (d.revenue / max) * 100)}%` }}
            />
          </div>
          <span className="report-day-label">{idx % step === 0 ? dm(d.day) : ''}</span>
        </div>
      ))}
    </div>
  )
}

export default function AdminReports() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [period, setPeriod] = useState('30d')
  const [custom, setCustom] = useState({ from: '', to: '' })
  const [costMap, setCostMap] = useState({})
  const [fees, setFees] = useState(DEFAULT_FEES)
  const [feeForm, setFeeForm] = useState(null)
  const [crewByCode, setCrewByCode] = useState({})
  const [financeWarning, setFinanceWarning] = useState(null)

  useEffect(() => {
    // custo, taxas e crew dependem do SQL add_custos_e_crew.sql; sem ele o
    // relatório de vendas continua funcionando, só o lucro fica incompleto.
    const warn = () =>
      setFinanceWarning('Rode o SQL add_custos_e_crew.sql no Supabase pra ver custo, lucro e repasse da crew.')
    fetchCostMap().then(setCostMap).catch(warn)
    fetchFees().then(setFees).catch(warn)
    fetchCoupons()
      .then((list) => {
        const map = {}
        for (const c of list) {
          if (c.athlete_name) map[c.code.toUpperCase()] = { athlete: c.athlete_name, pct: Number(c.commission_pct || 0) }
        }
        setCrewByCode(map)
      })
      .catch(() => {})
    fetchOrders()
      .then(setOrders)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const range = useMemo(() => periodRange(period, new Date(), custom), [period, custom])
  const r = useMemo(
    () => buildReport(orders, range, { costMap, fees, crewByCode }),
    [orders, range, costMap, fees, crewByCode]
  )

  async function handleSaveFees() {
    try {
      const next = { pix: Number(feeForm.pix), card: Number(feeForm.card) }
      await saveFees(next)
      setFees(next)
      setFeeForm(null)
    } catch (e) {
      setFinanceWarning('Não consegui salvar as taxas: ' + e.message)
    }
  }

  function downloadCsv() {
    const blob = new Blob([buildCsv(r.sales, costMap)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vendas-${brand.slug}-${range.from ?? 'inicio'}-a-${range.to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <p className="meta">Carregando...</p>
  if (error) return <p className="error">Erro ao carregar pedidos: {error}</p>

  const rangeText = range.from
    ? range.from === range.to
      ? dm(range.from)
      : `${dm(range.from)} a ${dm(range.to)}`
    : 'desde o início'

  return (
    <div className="report">
      <div className="report-head">
        <div>
          <h1>Relatório de vendas</h1>
          <p className="meta">
            {rangeText} · só pedidos com pagamento aprovado (sem "aguardando pagamento")
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={downloadCsv} disabled={!r.orders}>
          Baixar CSV
        </button>
      </div>

      <div className="report-periods">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            className={`report-chip${period === p.id ? ' active' : ''}`}
            onClick={() => setPeriod(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {period === 'custom' && (
        <div className="report-custom">
          <div className="field">
            <label htmlFor="rep-from">De</label>
            <input
              id="rep-from"
              type="date"
              value={custom.from}
              onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="rep-to">Até</label>
            <input
              id="rep-to"
              type="date"
              value={custom.to}
              onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
            />
          </div>
        </div>
      )}

      <div className="report-kpis">
        <div className="report-kpi">
          <span>Faturamento</span>
          <strong>{brl(r.revenue)}</strong>
        </div>
        <div className="report-kpi">
          <span>Pedidos</span>
          <strong>{int(r.orders)}</strong>
        </div>
        <div className="report-kpi">
          <span>Peças vendidas</span>
          <strong>{int(r.pieces)}</strong>
        </div>
        <div className="report-kpi">
          <span>Ticket médio</span>
          <strong>{brl(r.avgTicket)}</strong>
        </div>
        <div className="report-kpi">
          <span>Desconto cupons</span>
          <strong>{brl(r.discount)}</strong>
        </div>
        <div className="report-kpi">
          <span>Frete cobrado</span>
          <strong>{brl(r.shipping)}</strong>
        </div>
      </div>

      <div className="report-kpis report-kpis-profit">
        <div className="report-kpi highlight">
          <span>Lucro</span>
          <strong>{brl(r.profit)}</strong>
        </div>
        <div className="report-kpi">
          <span>Margem</span>
          <strong>{pct(r.margin)}</strong>
        </div>
        <div className="report-kpi">
          <span>Custo das peças</span>
          <strong>{brl(r.cost)}</strong>
        </div>
        <div className="report-kpi">
          <span>Taxas Mercado Pago</span>
          <strong>{brl(r.fees)}</strong>
        </div>
        {hasPartnerRefs && (
          <div className="report-kpi">
            <span>Repasse crew</span>
            <strong>{brl(r.commission)}</strong>
          </div>
        )}
      </div>
      <p className="meta report-note">
        Lucro = peças vendidas (com desconto, sem frete) − custo{hasPartnerRefs ? ' − repasse da crew' : ''} − taxa do Mercado Pago (Pix{' '}
        {fees.pix.toLocaleString('pt-BR')}%, cartão {fees.card.toLocaleString('pt-BR')}%, venda manual sem taxa).
      </p>
      {financeWarning && <p className="report-warn">{financeWarning}</p>}
      {r.missingCost > 0 && (
        <p className="report-warn">
          {r.missingCost} {r.missingCost === 1 ? 'peça vendida está' : 'peças vendidas estão'} sem custo cadastrado,
          então o lucro aparece maior do que é. Preencha o custo em Admin &gt; Produtos.
        </p>
      )}

      {hasPartnerRefs && (
        <section className="report-card">
          <h3>Repasse da crew</h3>
          {r.athletes.length === 0 ? (
            <p className="meta">
              Nenhuma venda com cupom da crew no período. Pra marcar um cupom como da crew, vá em Cupons e preencha o
              atleta.
            </p>
          ) : (
            <ul className="athletes">
              {r.athletes.map((a) => (
                <AthleteCard key={a.athlete} a={a} range={range} />
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="report-card">
        <h3>Faturamento por dia</h3>
        <DayChart days={r.days} />
      </section>

      <div className="report-grid">
        <RankTable title="Produtos mais vendidos" rows={r.products} />
        <RankTable title="Modelos" rows={r.models} />
        <RankTable title="Tamanhos" rows={r.sizes} limit={20} />
        <RankTable title="Cores" rows={r.colors} />
      </div>

      <div className="report-grid">
        <section className="report-card">
          <h3>Cupons</h3>
          {r.coupons.length === 0 ? (
            <p className="meta">Nenhum cupom usado no período.</p>
          ) : (
            <table className="report-table">
              <thead>
                <tr>
                  <th>Cupom</th>
                  <th>Usos</th>
                  <th>Desconto</th>
                  <th>Vendeu</th>
                </tr>
              </thead>
              <tbody>
                {r.coupons.map((c) => (
                  <tr key={c.label}>
                    <td>{c.label}</td>
                    <td>{c.qty}</td>
                    <td>{brl(c.discount)}</td>
                    <td>{brl(c.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {hasPartnerRefs && (
          <section className="report-card">
            <h3>Vendas por link da Crew</h3>
            {r.refs.length === 0 ? (
              <p className="meta">Nenhuma venda por link (?ref=) no período.</p>
            ) : (
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Link</th>
                    <th>Pedidos</th>
                    <th>Vendeu</th>
                    <th>Cupom usado</th>
                  </tr>
                </thead>
                <tbody>
                  {r.refs.map((x) => (
                    <tr key={x.label}>
                      <td>{x.label}</td>
                      <td>{x.qty}</td>
                      <td>{brl(x.revenue)}</td>
                      <td>{x.coupons.length ? x.coupons.join(', ') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}

        <section className="report-card">
          <h3>Loja x venda manual</h3>
          <table className="report-table">
            <thead>
              <tr>
                <th>Origem</th>
                <th>Pedidos</th>
                <th>Faturamento</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Loja (site)</td>
                <td>{r.channel.loja.orders}</td>
                <td>{brl(r.channel.loja.revenue)}</td>
              </tr>
              <tr>
                <td>Venda manual</td>
                <td>{r.channel.manual.orders}</td>
                <td>{brl(r.channel.manual.revenue)}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>

      <section className="report-card report-fees">
        <h3>Taxas do Mercado Pago</h3>
        {feeForm ? (
          <div className="report-custom">
            <div className="field">
              <label htmlFor="fee-pix">Pix (%)</label>
              <input id="fee-pix" type="number" step="0.01" min="0" value={feeForm.pix}
                onChange={(e) => setFeeForm((f) => ({ ...f, pix: e.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="fee-card">Cartão (%)</label>
              <input id="fee-card" type="number" step="0.01" min="0" value={feeForm.card}
                onChange={(e) => setFeeForm((f) => ({ ...f, card: e.target.value }))} />
            </div>
            <div className="report-fee-actions">
              <button className="btn btn-primary btn-sm" onClick={handleSaveFees}>Salvar</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setFeeForm(null)}>Cancelar</button>
            </div>
          </div>
        ) : (
          <p className="meta">
            Pix {fees.pix.toLocaleString('pt-BR')}% · cartão {fees.card.toLocaleString('pt-BR')}% (pedido sem forma de
            pagamento conta como cartão).{' '}
            <button className="link-button" onClick={() => setFeeForm({ pix: String(fees.pix), card: String(fees.card) })}>
              Alterar
            </button>
          </p>
        )}
      </section>
    </div>
  )
}
