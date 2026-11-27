import { useEffect, useState } from 'react'
import {
  fetchCoupons,
  createCoupon,
  toggleCouponActive,
  deleteCoupon,
  describeTiers,
  updateCouponCrew,
} from '../../lib/coupons'
import { fetchAllProductsAdmin } from '../../lib/catalog'

const typeLabel = {
  percent: 'Percentual',
  fixed: 'Valor fixo',
  free_shipping: 'Frete grátis',
  bundle: 'Kit',
  tiered: 'Progressivo',
}

const defaultTiers = () => [
  { min_qty: '1', percent: '10' },
  { min_qty: '2', percent: '15' },
  { min_qty: '3', percent: '20' },
]

const emptyForm = () => ({
  code: '',
  type: 'percent',
  value: '',
  bundleQty: '2',
  tiers: defaultTiers(),
  maxUses: '',
  expiresAt: '',
  athleteName: '',
  commissionPct: '5',
})

export default function AdminCoupons() {
  const [coupons, setCoupons] = useState([])
  const [products, setProducts] = useState([])
  const [productIds, setProductIds] = useState([]) // vazio = todos os itens
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [crewEdit, setCrewEdit] = useState(null) // { id, athleteName, commissionPct }

  function load() {
    setLoading(true)
    fetchCoupons()
      // cupons automáticos dos grupos do amigo secreto aparecem em Admin > Amigo secreto
      .then((list) => setCoupons(list.filter((c) => !c.ss_group_id)))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  useEffect(() => {
    fetchAllProductsAdmin()
      .then(setProducts)
      .catch((e) => setError(e.message))
  }, [])

  function toggleProduct(dbId) {
    setProductIds((prev) =>
      prev.includes(dbId) ? prev.filter((id) => id !== dbId) : [...prev, dbId]
    )
  }

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }))
  }

  function updateTier(index, field) {
    return (e) =>
      setForm((f) => ({
        ...f,
        tiers: f.tiers.map((t, i) => (i === index ? { ...t, [field]: e.target.value } : t)),
      }))
  }

  function addTier() {
    setForm((f) => {
      const last = f.tiers[f.tiers.length - 1]
      const next = last ? String((parseInt(last.min_qty, 10) || 0) + 1) : '1'
      return { ...f, tiers: [...f.tiers, { min_qty: next, percent: '' }] }
    })
  }

  function removeTier(index) {
    setForm((f) => ({ ...f, tiers: f.tiers.filter((_, i) => i !== index) }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await createCoupon({ ...form, productIds })
      setForm(emptyForm())
      setProductIds([])
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle(coupon) {
    await toggleCouponActive(coupon.id, !coupon.active)
    load()
  }

  async function handleSaveCrew() {
    setError(null)
    try {
      await updateCouponCrew(crewEdit.id, crewEdit)
      setCrewEdit(null)
      load()
    } catch (err) {
      setError(
        'Não consegui salvar a crew: ' + err.message + ' (confira se o SQL add_custos_e_crew.sql já foi rodado)'
      )
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Apagar este cupom?')) return
    await deleteCoupon(id)
    load()
  }

  return (
    <div>
      <h2>Cupons</h2>
      <div className="rule" />

      <form onSubmit={handleSubmit} style={{ marginBottom: 32 }}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="code">Código</label>
            <input
              id="code"
              required
              placeholder="EX: EDGE10"
              value={form.code}
              onChange={update('code')}
            />
          </div>
          <div className="field">
            <label htmlFor="type">Tipo</label>
            <select id="type" value={form.type} onChange={update('type')}>
              <option value="percent">Percentual (%)</option>
              <option value="fixed">Valor fixo (R$)</option>
              <option value="free_shipping">Frete grátis</option>
              <option value="bundle">Kit (leve X peças por R$)</option>
              <option value="tiered">Progressivo (mais peças, mais %)</option>
            </select>
          </div>
        </div>

        <div className="form-grid">
          {form.type !== 'free_shipping' && form.type !== 'tiered' && (
            <div className="field">
              <label htmlFor="value">
                {form.type === 'percent'
                  ? 'Percentual (ex: 10)'
                  : form.type === 'bundle'
                    ? 'Preço do kit em R$ (ex: 149)'
                    : 'Valor em R$ (ex: 20)'}
              </label>
              <input
                id="value"
                type="number"
                step="0.01"
                required
                value={form.value}
                onChange={update('value')}
              />
            </div>
          )}
          {form.type === 'bundle' && (
            <div className="field">
              <label htmlFor="bundleQty">Peças no kit</label>
              <input
                id="bundleQty"
                type="number"
                min="2"
                required
                value={form.bundleQty}
                onChange={update('bundleQty')}
              />
            </div>
          )}
          <div className="field">
            <label htmlFor="maxUses">Limite de usos (opcional)</label>
            <input
              id="maxUses"
              type="number"
              min="1"
              placeholder="Sem limite"
              value={form.maxUses}
              onChange={update('maxUses')}
            />
          </div>
        </div>

        {form.type === 'tiered' && (
          <div className="field">
            <label>Faixas</label>
            <div className="tier-list">
              {form.tiers.map((t, i) => (
                <div key={i} className="tier-row">
                  <span>A partir de</span>
                  <input
                    type="number"
                    min="1"
                    required
                    aria-label={`Faixa ${i + 1}: peças`}
                    value={t.min_qty}
                    onChange={updateTier(i, 'min_qty')}
                  />
                  <span>{t.min_qty === '1' ? 'peça' : 'peças'}:</span>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    step="0.01"
                    required
                    aria-label={`Faixa ${i + 1}: %`}
                    value={t.percent}
                    onChange={updateTier(i, 'percent')}
                  />
                  <span>%</span>
                  {form.tiers.length > 1 && (
                    <button type="button" className="btn btn-secondary" onClick={() => removeTier(i)}>
                      Tirar
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div>
              <button type="button" className="btn btn-secondary" onClick={addTier}>
                + Faixa
              </button>
            </div>
            <span className="meta">
              Conta as peças dos itens marcados abaixo (ou de todos) e aplica o % da maior faixa atingida.
              Se a primeira faixa for 2 peças, quem compra 1 não usa o cupom.
            </span>
          </div>
        )}

        <div className="form-grid">
          <div className="field">
            <label htmlFor="expiresAt">Validade (opcional)</label>
            <input
              id="expiresAt"
              type="date"
              value={form.expiresAt}
              onChange={update('expiresAt')}
            />
            <span className="meta">Vale até 23h59 do dia escolhido.</span>
          </div>
        </div>

        <div className="form-grid">
          <div className="field">
            <label htmlFor="athleteName">Atleta da crew (opcional)</label>
            <input
              id="athleteName"
              placeholder="Nome do atleta"
              value={form.athleteName}
              onChange={update('athleteName')}
            />
            <span className="meta">Preenchido = cupom da crew; entra no repasse do relatório.</span>
          </div>
          {form.athleteName.trim() && (
            <div className="field">
              <label htmlFor="commissionPct">Repasse pro atleta (%)</label>
              <input
                id="commissionPct"
                type="number"
                step="0.5"
                min="0"
                max="100"
                value={form.commissionPct}
                onChange={update('commissionPct')}
              />
              <span className="meta">Sobre o valor pago nas peças (com desconto, sem frete).</span>
            </div>
          )}
        </div>

        <div className="field">
          <label>Vale para quais itens?</label>
          <div className="check-list">
            {products.map((p) => (
              <label key={p.dbId} className="check-item">
                <input
                  type="checkbox"
                  checked={productIds.includes(p.dbId)}
                  onChange={() => toggleProduct(p.dbId)}
                />
                <span>{p.name}</span>
              </label>
            ))}
          </div>
          <span className="meta">
            {productIds.length === 0
              ? 'Nenhum marcado: o cupom vale para todos os itens.'
              : `Vale só para ${productIds.length} ${productIds.length === 1 ? 'item' : 'itens'} (o desconto é calculado só em cima deles).`}
          </span>
        </div>

        {error && (
          <p className="meta" style={{ color: 'var(--danger)', marginBottom: 12 }}>
            {error}
          </p>
        )}

        <button className="btn btn-primary" type="submit" disabled={saving}>
          {saving ? 'Salvando...' : 'Criar cupom'}
        </button>
      </form>

      {loading ? (
        <p className="meta">Carregando cupons...</p>
      ) : coupons.length === 0 ? (
        <p className="meta">Nenhum cupom criado ainda.</p>
      ) : (
        <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Tipo</th>
              <th>Valor</th>
              <th>Itens</th>
              <th>Usos</th>
              <th>Crew</th>
              <th>Validade</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {coupons.map((c) => (
              <tr key={c.id}>
                <td>{c.code}</td>
                <td>{typeLabel[c.type]}</td>
                <td>
                  {c.type === 'percent' && `${c.value}%`}
                  {c.type === 'fixed' &&
                    Number(c.value).toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    })}
                  {c.type === 'free_shipping' && '—'}
                  {c.type === 'tiered' && describeTiers(c.tiers)}
                  {c.type === 'bundle' &&
                    `${c.bundle_qty || 2} por ${Number(c.value).toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    })}`}
                </td>
                <td>
                  {c.coupon_products?.length > 0
                    ? c.coupon_products.map((cp) => cp.products?.name).filter(Boolean).join(', ')
                    : 'Todos'}
                </td>
                <td>
                  {c.uses_count}
                  {c.max_uses ? ` / ${c.max_uses}` : ''}
                </td>
                <td>
                  {crewEdit?.id === c.id ? (
                    <div className="crew-edit">
                      <input
                        aria-label="Atleta"
                        placeholder="Atleta (vazio = não é crew)"
                        value={crewEdit.athleteName}
                        onChange={(e) => setCrewEdit((s) => ({ ...s, athleteName: e.target.value }))}
                      />
                      <input
                        aria-label="Repasse %"
                        type="number"
                        step="0.5"
                        min="0"
                        max="100"
                        value={crewEdit.commissionPct}
                        onChange={(e) => setCrewEdit((s) => ({ ...s, commissionPct: e.target.value }))}
                      />
                      <button className="btn btn-primary btn-sm" onClick={handleSaveCrew}>
                        Salvar
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={() => setCrewEdit(null)}>
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      className="link-button"
                      onClick={() =>
                        setCrewEdit({
                          id: c.id,
                          athleteName: c.athlete_name ?? '',
                          commissionPct: String(c.athlete_name ? c.commission_pct ?? 5 : 5),
                        })
                      }
                    >
                      {c.athlete_name ? `${c.athlete_name} · ${Number(c.commission_pct)}%` : 'Definir'}
                    </button>
                  )}
                </td>
                <td>{c.expires_at ? new Date(c.expires_at).toLocaleDateString('pt-BR') : '—'}</td>
                <td>
                  <span className={`status-badge status-${c.active ? 'enviado' : 'novo'}`}>
                    {c.active ? 'Ativo' : 'Pausado'}
                  </span>
                </td>
                <td style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn btn-secondary" onClick={() => handleToggle(c)}>
                    {c.active ? 'Pausar' : 'Ativar'}
                  </button>
                  <button className="btn btn-secondary" onClick={() => handleDelete(c.id)}>
                    Apagar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  )
}
