import { useEffect, useState } from 'react'
import { fetchBanners, uploadBannerImage, createBanner, deleteBanner, updateBannerCta, reorderBanners } from '../../lib/banners'

export default function AdminBanners() {
  const [banners, setBanners] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  function load() {
    setLoading(true)
    fetchBanners()
      .then(setBanners)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const url = await uploadBannerImage(file)
      // banner novo entra no fim da fila
      const last = banners.reduce((max, b) => Math.max(max, b.position ?? 0), -1)
      await createBanner({ imageUrl: url, altText: file.name, position: last + 1 })
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function handleDelete(id) {
    if (!confirm('Apagar esse banner?')) return
    await deleteBanner(id)
    load()
  }

  // troca o banner de lugar com o vizinho e salva a ordem nova
  async function move(index, dir) {
    const target = index + dir
    if (target < 0 || target >= banners.length) return
    const next = [...banners]
    ;[next[index], next[target]] = [next[target], next[index]]
    setBanners(next)
    setSaving(true)
    setError(null)
    try {
      await reorderBanners(next.map((b) => b.id))
    } catch (err) {
      setError(`Não deu pra salvar a ordem: ${err.message}`)
      load()
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="meta">Carregando banners...</p>

  return (
    <div>
      <h2>Banners da home</h2>
      <div className="rule" />
      <p className="meta" style={{ marginBottom: 20 }}>
        Tamanho recomendado: 2880 × 800px (proporção 1440 × 400). Eles passam sozinhos na home,
        um a cada 6 segundos, na ordem desta lista: use as setas para mudar a ordem. Deixe o
        texto/logo do lado esquerdo: no celular a imagem é recortada pela direita.
      </p>

      {error && (
        <p className="meta" style={{ color: 'var(--danger)', marginBottom: 12 }}>
          {error}
        </p>
      )}

      <ol className="admin-banner-list">
        {banners.map((b, i) => (
          <li key={b.id} className="admin-banner-row">
            <div className="admin-banner-order">
              <span className="admin-banner-num">{i + 1}</span>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => move(i, -1)}
                disabled={i === 0 || saving}
                aria-label={`Subir banner ${i + 1}`}
                title="Subir"
              >
                ↑
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => move(i, 1)}
                disabled={i === banners.length - 1 || saving}
                aria-label={`Descer banner ${i + 1}`}
                title="Descer"
              >
                ↓
              </button>
            </div>
            <div className="admin-banner-body">
              <div style={{ position: 'relative' }}>
                <img
                  src={b.image_url}
                  alt={b.alt_text || ''}
                  style={{ width: '100%', aspectRatio: '1440/400', objectFit: 'cover', borderRadius: 4, border: '1px solid var(--border)', display: 'block' }}
                />
                <button
                  className="btn btn-secondary"
                  style={{ position: 'absolute', top: 8, right: 8 }}
                  onClick={() => handleDelete(b.id)}
                >
                  Apagar
                </button>
              </div>
              <BannerCtaForm banner={b} />
            </div>
          </li>
        ))}
      </ol>
      {saving && <p className="meta" style={{ marginBottom: 16 }}>Salvando ordem...</p>}

      <p className="meta" style={{ marginBottom: 16 }}>
        Botão do banner: deixe o link vazio para o banner ficar sem botão. O link pode ser um
        caminho da loja (ex: /colecao/road-to-vegas ou /amigo), #colecao para descer até os
        produtos, ou um endereço completo (abre em outra aba).
      </p>

      <div className="field" style={{ maxWidth: 320 }}>
        <label htmlFor="banner-upload">Adicionar banner</label>
        <input id="banner-upload" type="file" accept="image/*" onChange={handleUpload} disabled={uploading} />
        {uploading && <span className="meta">Enviando...</span>}
      </div>
    </div>
  )
}

function BannerCtaForm({ banner }) {
  const [text, setText] = useState(banner.cta_text || '')
  const [link, setLink] = useState(banner.cta_link || '')
  const [title, setTitle] = useState(banner.title || '')
  const [subtitle, setSubtitle] = useState(banner.subtitle || '')
  const [status, setStatus] = useState(null)

  async function save(e) {
    e.preventDefault()
    setStatus('Salvando...')
    try {
      await updateBannerCta(banner.id, { ctaText: text, ctaLink: link, title, subtitle })
      setStatus(link.trim() ? 'Salvo' : 'Salvo (sem botão)')
    } catch (err) {
      setStatus(err.message)
    }
  }

  return (
    <form onSubmit={save} style={{ marginTop: 10 }}>
      <div className="field" style={{ marginBottom: 8 }}>
        <label htmlFor={`title-${banner.id}`}>Título em cima da foto (opcional)</label>
        <input id={`title-${banner.id}`} value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Bolsas feitas à mão" />
      </div>
      <div className="field" style={{ marginBottom: 8 }}>
        <label htmlFor={`subtitle-${banner.id}`}>Frase embaixo do título (opcional)</label>
        <input id={`subtitle-${banner.id}`} value={subtitle} maxLength={140} onChange={(e) => setSubtitle(e.target.value)} placeholder="Ex: Peças únicas, com acabamento de alto padrão." />
      </div>
      <div className="field" style={{ marginBottom: 8 }}>
        <label htmlFor={`cta-text-${banner.id}`}>Texto do botão</label>
        <input id={`cta-text-${banner.id}`} value={text} maxLength={30} onChange={(e) => setText(e.target.value)} placeholder="Ex: Ver coleção" />
      </div>
      <div className="field" style={{ marginBottom: 8 }}>
        <label htmlFor={`cta-link-${banner.id}`}>Link do botão</label>
        <input id={`cta-link-${banner.id}`} value={link} onChange={(e) => setLink(e.target.value)} placeholder="Vazio = sem botão" />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button type="submit" className="btn btn-secondary">Salvar textos e botão</button>
        {status && <span className="meta">{status}</span>}
      </div>
    </form>
  )
}
