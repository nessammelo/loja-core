import { useEffect, useState } from 'react'
import { fetchAllProductsAdmin } from '../../lib/catalog'
import {
  fetchCollectionSettings,
  saveCollectionSettings,
  saveCollectionImage,
  sortGroups,
  collectionSlug,
  DEFAULT_COLLECTION,
} from '../../lib/collections'
import { uploadBannerImage } from '../../lib/banners'
import { brand } from '../../brand'

export default function AdminCollections() {
  const [list, setList] = useState([]) // [{ name, count, hidden }]
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(null)

  useEffect(() => {
    Promise.all([fetchAllProductsAdmin(), fetchCollectionSettings()])
      .then(([products, { order, hidden, images }]) => {
        const counts = new Map()
        for (const p of products) {
          const key = p.collection || DEFAULT_COLLECTION
          counts.set(key, (counts.get(key) || 0) + 1)
        }
        const groups = Array.from(counts.entries())
        const sorted = sortGroups(groups, order)
        setList(sorted.map(([name, count]) => ({ name, count, hidden: hidden.has(name), image: images?.[name] || '' })))
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  async function persist(next) {
    setList(next)
    setSaving(true)
    setError(null)
    try {
      await saveCollectionSettings(next)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function move(index, delta) {
    const target = index + delta
    if (target < 0 || target >= list.length) return
    const next = [...list]
    ;[next[index], next[target]] = [next[target], next[index]]
    persist(next)
  }

  function toggleHidden(index) {
    persist(list.map((c, i) => (i === index ? { ...c, hidden: !c.hidden } : c)))
  }

  async function changeImage(c, file) {
    if (!file) return
    setSaving(true)
    setError(null)
    try {
      const url = await uploadBannerImage(file)
      await saveCollectionImage(c.name, url)
      setList((l) => l.map((x) => (x.name === c.name ? { ...x, image: url } : x)))
    } catch (err) {
      setError('Não consegui salvar a foto: ' + err.message + ' (confira se o SQL add_home_vitrine.sql já foi rodado)')
    } finally {
      setSaving(false)
    }
  }

  async function copyLink(c) {
    const url = `${window.location.origin}/colecao/${collectionSlug(c.name)}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(c.name)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      window.prompt('Copie o link da coleção:', url)
    }
  }

  if (loading) return <p className="meta">Carregando coleções...</p>

  return (
    <div>
      <h2>Coleções</h2>
      <div className="rule" />
      <p className="meta" style={{ marginBottom: 8 }}>
        A coleção de cima aparece primeiro na loja. Use as setas pra subir ou descer — salva na hora.
      </p>
      <p className="meta" style={{ marginBottom: 20 }}>
        Coleção <strong>oculta</strong> não aparece na home: só quem tiver o link dela consegue ver.
        Use "Copiar link" pra enviar.
      </p>

      {list.length === 0 ? (
        <p className="meta">Nenhum produto cadastrado ainda.</p>
      ) : (
        <div className="order-list">
          {list.map((c, i) => (
            <div className="order-row" key={c.name}>
              <span className="order-pos">{i + 1}</span>
              <span className="order-name">
                {c.name.replace(/-/g, ' ')}
                <span className="meta">
                  {' '}· {c.count} {c.count === 1 ? 'produto' : 'produtos'}
                </span>
                {c.hidden && <span className="status-badge status-repassado hidden-badge">Oculta</span>}
              </span>
              <span className="order-actions">
                <button
                  className="btn btn-secondary"
                  onClick={() => move(i, -1)}
                  disabled={i === 0 || saving}
                  aria-label="Subir"
                >
                  ↑
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => move(i, 1)}
                  disabled={i === list.length - 1 || saving}
                  aria-label="Descer"
                >
                  ↓
                </button>
              </span>
              <span className="order-actions order-actions-wide">
                <button className="btn btn-secondary" onClick={() => toggleHidden(i)} disabled={saving}>
                  {c.hidden ? 'Mostrar na home' : 'Ocultar'}
                </button>
                {brand.home.collectionCards && (
                  <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
                    {c.image ? 'Trocar foto do card' : 'Foto do card'}
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      disabled={saving}
                      onChange={(e) => changeImage(c, e.target.files?.[0])}
                    />
                  </label>
                )}
                <button className="btn btn-secondary" onClick={() => copyLink(c)}>
                  {copied === c.name ? 'Copiado!' : 'Copiar link'}
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="meta" style={{ color: 'var(--danger)', marginTop: 12 }}>
          {error}
        </p>
      )}
    </div>
  )
}
