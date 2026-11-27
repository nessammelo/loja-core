import { useEffect, useState } from 'react'
import {
  SETTING_KEYS,
  fetchStoreSettings,
  saveStoreSetting,
  fetchSizeCharts,
  saveSizeChart,
  deleteSizeChart,
  parseGrid,
  gridToText,
} from '../../lib/storeInfo'

function ChartPreview({ grid }) {
  if (!grid || grid.length === 0) return null
  const [head, ...rows] = grid
  return (
    <div className="chart-wrap">
      <table className="chart-table">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {head.map((_, j) => (
                <td key={j}>{r[j] ?? ''}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function AdminInfo() {
  const [delivery, setDelivery] = useState('')
  const [returns, setReturns] = useState('')
  const [savedNotice, setSavedNotice] = useState(false)

  const [charts, setCharts] = useState({})
  const [editingName, setEditingName] = useState('') // nome da tabela aberta ('' = nova)
  const [name, setName] = useState('')
  const [text, setText] = useState('')

  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)

  async function load() {
    const [s, c] = await Promise.all([fetchStoreSettings(), fetchSizeCharts()])
    setDelivery(s[SETTING_KEYS.delivery] ?? '')
    setReturns(s[SETTING_KEYS.returns] ?? '')
    setCharts(c)
  }

  useEffect(() => {
    load()
  }, [])

  async function saveNotices(e) {
    e.preventDefault()
    setError(null)
    try {
      await saveStoreSetting(SETTING_KEYS.delivery, delivery.trim())
      await saveStoreSetting(SETTING_KEYS.returns, returns.trim())
      setSavedNotice(true)
      setTimeout(() => setSavedNotice(false), 2500)
    } catch (err) {
      setError(
        err.message +
          ' (confira se o SQL add_model_pricing_and_color_photos.sql já foi rodado no Supabase)'
      )
    }
  }

  function openChart(chartName) {
    setEditingName(chartName)
    setName(chartName)
    setText(gridToText(charts[chartName]))
    setMessage(null)
  }

  function newChart() {
    setEditingName('')
    setName('')
    setText('Tamanho; Largura (cm); Altura (cm); Manga (cm)\nP; ; ; \nM; ; ; \nG; ; ; \nGG; ; ; ')
    setMessage(null)
  }

  async function saveChart(e) {
    e.preventDefault()
    setError(null)
    const trimmed = name.trim()
    const grid = parseGrid(text)
    if (!trimmed) return setError('Dê um nome para a tabela (ex: Modelo Padrão).')
    if (grid.length < 2) return setError('A tabela precisa de um cabeçalho e pelo menos uma linha.')
    try {
      await saveSizeChart(trimmed, grid)
      // renomeou: apaga a antiga
      if (editingName && editingName !== trimmed) await deleteSizeChart(editingName)
      setEditingName(trimmed)
      setMessage('Tabela salva.')
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function removeChart() {
    if (!editingName) return
    if (!window.confirm(`Apagar a tabela "${editingName}"?`)) return
    try {
      await deleteSizeChart(editingName)
      setEditingName('')
      setName('')
      setText('')
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  const textareaStyle = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    padding: '12px 14px',
    borderRadius: 4,
    fontFamily: 'var(--font-body)',
    fontSize: 14,
  }

  const previewGrid = parseGrid(text)

  return (
    <div>
      <h2>Medidas e avisos</h2>
      <div className="rule" />

      {error && (
        <p className="meta" style={{ color: 'var(--danger)', marginBottom: 16 }}>
          {error}
        </p>
      )}

      <h3>Avisos na página do produto</h3>
      <p className="meta" style={{ marginBottom: 12 }}>
        Aparecem logo abaixo do botão de comprar. Campo vazio = o aviso não aparece.
      </p>
      <form onSubmit={saveNotices} style={{ maxWidth: 640, marginBottom: 40 }}>
        <div className="field">
          <label htmlFor="delivery">Prazo de entrega</label>
          <textarea
            id="delivery"
            rows={2}
            placeholder="Ex: Produção sob demanda. Prazo de 10 a 15 dias úteis."
            value={delivery}
            onChange={(e) => setDelivery(e.target.value)}
            style={textareaStyle}
          />
        </div>
        <div className="field">
          <label htmlFor="returns">Trocas e devoluções</label>
          <textarea
            id="returns"
            rows={2}
            placeholder="Ex: Troca em até 7 dias após o recebimento."
            value={returns}
            onChange={(e) => setReturns(e.target.value)}
            style={textareaStyle}
          />
        </div>
        <button className="btn btn-primary" type="submit">
          {savedNotice ? 'Salvo!' : 'Salvar avisos'}
        </button>
      </form>

      <h3>Tabelas de medidas</h3>
      <p className="meta" style={{ marginBottom: 12 }}>
        Crie uma tabela por tipo de peça (ex: Modelo Padrão, Modelo Grande). Depois,
        em cada produto, você escolhe qual tabela cada modelo usa.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {Object.keys(charts).map((n) => (
          <button
            key={n}
            type="button"
            className={`btn btn-secondary ${n === editingName ? 'active' : ''}`}
            style={n === editingName ? { borderColor: 'var(--text)' } : undefined}
            onClick={() => openChart(n)}
          >
            {n}
          </button>
        ))}
        <button type="button" className="btn btn-primary" onClick={newChart}>
          + Nova tabela
        </button>
      </div>

      {(editingName || text) && (
        <form onSubmit={saveChart} style={{ maxWidth: 640 }}>
          <div className="field">
            <label htmlFor="chart-name">Nome da tabela</label>
            <input
              id="chart-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Modelo Padrão"
            />
          </div>
          <div className="field">
            <label htmlFor="chart-text">Medidas</label>
            <textarea
              id="chart-text"
              rows={8}
              value={text}
              onChange={(e) => setText(e.target.value)}
              style={{ ...textareaStyle, fontFamily: 'monospace' }}
            />
            <p className="meta" style={{ marginTop: 6 }}>
              Primeira linha = títulos das colunas. Uma linha por tamanho, colunas separadas por ponto e
              vírgula (;). Também dá pra copiar do Excel/Google Planilhas e colar aqui.
            </p>
          </div>

          <div className="option-label">Prévia</div>
          <ChartPreview grid={previewGrid} />

          <div style={{ display: 'flex', gap: 12, marginTop: 16, alignItems: 'center' }}>
            <button className="btn btn-primary" type="submit">
              Salvar tabela
            </button>
            {editingName && (
              <button type="button" className="btn btn-secondary" onClick={removeChart}>
                Apagar
              </button>
            )}
            {message && <span className="meta">{message}</span>}
          </div>
        </form>
      )}
    </div>
  )
}
