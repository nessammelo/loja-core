import { useEffect, useState } from 'react'
import {
  deleteShippingModel,
  fetchGuboModels,
  fetchShippingModels,
  fetchStoreModelLabels,
  saveShippingModel,
} from '../../lib/shipping'

const CURRENT = '__atual'

export default function AdminShipping() {
  const [rows, setRows] = useState([]) // [{ label, inStore, link }]
  const [guboModels, setGuboModels] = useState([])
  const [guboError, setGuboError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([fetchStoreModelLabels(), fetchShippingModels()])
      .then(([labels, links]) => {
        const byLabel = new Map(links.map((l) => [l.model_label.trim().toLowerCase(), l]))
        const storeKeys = new Set(labels.map((l) => l.trim().toLowerCase()))
        const list = labels.map((label) => ({
          label,
          inStore: true,
          link: byLabel.get(label.trim().toLowerCase()) || null,
        }))
        // ligações de modelos que não existem mais na loja (podem ser apagadas)
        for (const l of links) {
          if (!storeKeys.has(l.model_label.trim().toLowerCase())) {
            list.push({ label: l.model_label, inStore: false, link: l })
          }
        }
        setRows(list)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))

    fetchGuboModels()
      .then(setGuboModels)
      .catch((e) => setGuboError(e.message))
  }, [])

  // value do select: o nome da peça da Gubo (o SKU de exemplo pode mudar)
  async function handleChange(row, value) {
    if (value === CURRENT) return
    setSaving(row.label)
    setError(null)
    try {
      if (!value) {
        if (row.link) await deleteShippingModel(row.link.model_label)
        setRows((prev) => prev.map((r) => (r.label === row.label ? { ...r, link: null } : r)))
      } else {
        const model = guboModels.find((m) => m.name === value)
        if (!model) return
        const sku = model.sku
        const label = row.link?.model_label || row.label
        await saveShippingModel(label, sku, model.name)
        setRows((prev) =>
          prev.map((r) =>
            r.label === row.label
              ? { ...r, link: { model_label: label, gubo_sku: sku, gubo_model_name: model.name } }
              : r
          )
        )
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(null)
    }
  }

  async function handleRemove(row) {
    setSaving(row.label)
    setError(null)
    try {
      await deleteShippingModel(row.link.model_label)
      setRows((prev) => prev.filter((r) => r.label !== row.label))
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(null)
    }
  }

  if (loading) return <p className="meta">Carregando...</p>

  const missing = rows.filter((r) => r.inStore && !r.link).length

  return (
    <div>
      <h2>Frete</h2>
      <div className="rule" />
      <p className="meta" style={{ marginBottom: 8 }}>
        O frete é calculado pela Gubo a partir do CEP do cliente e do tipo de peça. Ligue cada modelo
        da loja à peça da Gubo que ele usa. Salva na hora.
      </p>
      <p className="meta" style={{ marginBottom: 20 }}>
        Se um modelo do carrinho estiver sem ligação, ou se a Gubo não responder, a loja cobra o frete
        fixo de R$ 25.
      </p>

      {missing > 0 && (
        <p className="meta" style={{ color: 'var(--danger)', marginBottom: 16 }}>
          {missing === 1 ? '1 modelo está sem ligação.' : `${missing} modelos estão sem ligação.`}
        </p>
      )}

      {guboError && (
        <p className="meta" style={{ color: 'var(--danger)', marginBottom: 16 }}>
          Não deu pra ler o catálogo da Gubo: {guboError}
        </p>
      )}

      <div className="order-list">
        {rows.map((row) => {
          const known = row.link && guboModels.some((m) => m.name === row.link.gubo_model_name)
          const value = !row.link ? '' : known ? row.link.gubo_model_name : CURRENT
          return (
            <div className="order-row" key={row.label}>
              <span className="order-name">
                {row.label}
                {!row.inStore && <span className="meta"> · não está mais na loja</span>}
              </span>
              <span className="order-actions order-actions-wide">
                {row.inStore ? (
                  <select
                    className="shipping-select"
                    value={value}
                    disabled={saving === row.label || guboModels.length === 0}
                    onChange={(e) => handleChange(row, e.target.value)}
                    aria-label={`Peça da Gubo para ${row.label}`}
                  >
                    <option value="">Sem ligação (R$ 25)</option>
                    {value === CURRENT && (
                      <option value={CURRENT}>{row.link.gubo_model_name || row.link.gubo_sku}</option>
                    )}
                    {guboModels.map((m) => (
                      <option key={m.code} value={m.name}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <button
                    className="btn btn-secondary"
                    onClick={() => handleRemove(row)}
                    disabled={saving === row.label}
                  >
                    Apagar
                  </button>
                )}
              </span>
            </div>
          )
        })}
      </div>

      {error && (
        <p className="meta" style={{ color: 'var(--danger)', marginTop: 12 }}>
          {error}
        </p>
      )}
    </div>
  )
}
