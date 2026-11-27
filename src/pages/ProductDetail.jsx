import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  fetchProducts,
  fetchProductBySlug,
  fetchVariantId,
  fetchColorPalette,
  photosFor,
  DEFAULT_COLOR_HEX,
  FALLBACK_COLOR_HEX,
} from '../lib/catalog'
import { useCart } from '../context/CartContext'
import { looksLikeHtml, sanitizeHtml } from '../lib/richText'
import { fetchStoreSettings, fetchSizeCharts, SETTING_KEYS } from '../lib/storeInfo'
import { fetchCollectionSettings } from '../lib/collections'
import ProductCard from '../components/ProductCard'
import { savedGroups, addToWishlist } from '../lib/secretSanta'
import useSecretSantaEnabled from '../lib/useSecretSantaEnabled'
import { useStoreModes } from '../lib/storeModes'
import { brand, whatsappStoreUrl } from '../brand'

export default function ProductDetail() {
  const { id } = useParams()
  const { addItem } = useCart()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const secretSanta = useSecretSantaEnabled()
  const [ssGroups] = useState(savedGroups)
  const [ssToken, setSsToken] = useState(() => savedGroups()[0]?.token ?? null)
  const [ssStatus, setSsStatus] = useState(null) // { ok, text }

  const [product, setProduct] = useState(null)
  const modes = useStoreModes()
  const [loading, setLoading] = useState(true)
  const [modelId, setModelId] = useState(null)
  const [size, setSize] = useState(null)
  const [color, setColor] = useState(null)
  const [added, setAdded] = useState(false)
  const [photoIndex, setPhotoIndex] = useState(0)
  const [palette, setPalette] = useState(DEFAULT_COLOR_HEX)
  const [settings, setSettings] = useState({})
  const [charts, setCharts] = useState({})
  const [related, setRelated] = useState([])
  const [measuresOpen, setMeasuresOpen] = useState(false)
  const [zoom, setZoom] = useState(false)
  const measuresRef = useRef(null)
  const [chartName, setChartName] = useState(null)

  useEffect(() => {
    fetchColorPalette().then(setPalette)
    fetchStoreSettings().then(setSettings)
    fetchSizeCharts().then(setCharts)
  }, [])

  // "Você também pode gostar": outros produtos da mesma coleção (nunca de coleção oculta)
  useEffect(() => {
    if (!product) return
    Promise.all([fetchProducts(), fetchCollectionSettings()])
      .then(([all, cs]) => {
        if (product.collection && cs.hidden.has(product.collection)) return setRelated([])
        setRelated(
          all
            .filter((p) => p.id !== product.id && (p.collection ?? null) === (product.collection ?? null))
            .slice(0, 4)
        )
      })
      .catch(() => setRelated([]))
  }, [product])

  useEffect(() => {
    fetchProductBySlug(id).then((p) => {
      setProduct(p)
      if (p) {
        // link da lista do amigo secreto já vem com modelo, cor e tamanho
        const wanted = p.models.find((m) => m.label === searchParams.get('modelo')) ?? p.models[0]
        const wantedColor = searchParams.get('cor')
        const wantedSize = searchParams.get('tamanho')
        setModelId(wanted?.id)
        setColor(wanted?.colors.includes(wantedColor) ? wantedColor : wanted?.colors[0])
        setSize(wanted?.sizes.includes(wantedSize) ? wantedSize : null)
      }
      setLoading(false)
    })
  }, [id])

  useEffect(() => {
    if (!zoom) return
    const onKey = (e) => e.key === 'Escape' && setZoom(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoom])

  if (loading) {
    return (
      <div className="container empty-state">
        <p>Carregando...</p>
      </div>
    )
  }

  if (!product) {
    return (
      <div className="container empty-state">
        <p>Produto não encontrado.</p>
      </div>
    )
  }

  const model = product.models.find((m) => m.id === modelId) ?? product.models[0]

  // fotos da cor escolhida; se a cor não tem foto, mostra as gerais
  const photos = color && model ? photosFor(product, model.label, color) : product.images
  const photoIdx = Math.min(photoIndex, Math.max(photos.length - 1, 0))

  function chooseModel(m) {
    setModelId(m.id)
    setPhotoIndex(0)
    // a cor/tamanho escolhidos podem não existir nesse modelo
    if (!m.colors.includes(color)) setColor(m.colors[0])
    if (size && !m.sizes.includes(size)) setSize(null)
  }

  // tabelas de medidas dos modelos deste produto (sem repetir a mesma tabela)
  const chartNames = [
    ...new Set(
      product.models.map((m) => product.modelCharts[m.label]).filter((n) => n && charts[n])
    ),
  ]
  const hasCharts = chartNames.length > 0
  const currentChart = product.modelCharts[model?.label]
  const shownChart = chartNames.includes(chartName) ? chartName : currentChart && charts[currentChart] ? currentChart : chartNames[0]

  function openMeasures() {
    setMeasuresOpen(true)
    setTimeout(() => measuresRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60)
  }

  function chooseColor(c) {
    setColor(c)
    setPhotoIndex(0)
  }

  async function handleAdd() {
    if (!size) return
    const variantId = await fetchVariantId(product.dbId, model.label, size, color)
    addItem({
      productId: product.id,
      productName: product.name,
      modelId: model.id,
      modelLabel: model.label,
      size,
      color,
      price: model.price,
      qty: 1,
      variantId,
    })
    setAdded(true)
  }

  async function handleAddToWishlist() {
    if (!size || !ssToken) return
    setSsStatus(null)
    try {
      await addToWishlist(ssToken, { slug: product.id, modelLabel: model.label, color, size })
      setSsStatus({ ok: true, text: 'Está na sua lista do amigo secreto.' })
    } catch (err) {
      setSsStatus({ ok: false, text: err.message })
    }
  }

  return (
    <div className="container">
      <Link to="/" className="back-link">
        ← Voltar para a loja
      </Link>
      <div className="pdp">
        <div className="pdp-gallery">
          <div className="photo-main">
            {photos.length > 0 ? (
              <>
                <img
                  src={photos[photoIdx]}
                  alt={product.name}
                  className="zoomable"
                  onClick={() => setZoom(true)}
                />
                {photos.length > 1 && (
                  <>
                    <button
                      type="button"
                      className="carousel-arrow carousel-arrow-left"
                      onClick={() => setPhotoIndex((photoIdx - 1 + photos.length) % photos.length)}
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      className="carousel-arrow carousel-arrow-right"
                      onClick={() => setPhotoIndex((photoIdx + 1) % photos.length)}
                    >
                      ›
                    </button>
                  </>
                )}
              </>
            ) : (
              product.name
            )}
          </div>
          {photos.length > 1 && (
            <div className="thumbs-row">
              {photos.map((url, i) => (
                <button
                  key={url + i}
                  type="button"
                  className={`thumb ${i === photoIdx ? 'active' : ''}`}
                  onClick={() => setPhotoIndex(i)}
                  aria-label={`Foto ${i + 1}`}
                >
                  <img src={url} alt="" loading="lazy" decoding="async" />
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <div className="tagline">{product.tagline}</div>
          <h1>{product.name}</h1>
          <div className="price">
            {model.price.toLocaleString('pt-BR', {
              style: 'currency',
              currency: 'BRL',
            })}
          </div>

          {product.models.length > 1 && (
            <div className="option-group">
              <div className="option-label option-label-row">
                <span>
                  Modelo<b>{model?.label}</b>
                </span>
                {hasCharts && (
                  <button type="button" className="link-btn" onClick={openMeasures}>
                    Guia de medidas
                  </button>
                )}
              </div>
              <div className="pill-group">
                {product.models.map((m) => (
                  <button
                    key={m.id}
                    className={`pill model-pill ${m.id === model?.id ? 'active' : ''}`}
                    onClick={() => chooseModel(m)}
                  >
                    {m.label}
                    <small>
                      {m.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </small>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="option-group">
            <div className="option-label">
              Cor<b>{color}</b>
            </div>
            <div className="color-dots">
              {model?.colors.map((c) => (
                <button
                  key={c}
                  type="button"
                  title={c}
                  aria-label={c}
                  className={`color-dot ${c === color ? 'active' : ''}`}
                  style={{ background: palette[c] ?? FALLBACK_COLOR_HEX }}
                  onClick={() => chooseColor(c)}
                />
              ))}
            </div>
          </div>

          <div className="option-group">
            <div className="option-label">Tamanho</div>
            <div className="pill-group">
              {model?.sizes.map((s) => (
                <button
                  key={s}
                  className={`pill ${s === size ? 'active' : ''}`}
                  onClick={() => setSize(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="pdp-actions">
            <button
              className="btn btn-primary"
              disabled={!size}
              onClick={handleAdd}
            >
              {added ? 'Adicionado' : 'Adicionar ao carrinho'}
            </button>
            {added && (
              <button className="btn btn-secondary" onClick={() => navigate('/carrinho')}>
                Ver carrinho
              </button>
            )}
          </div>

          {secretSanta && ssGroups.length > 0 && (
            <div className="ss-pdp">
              {ssGroups.length > 1 && (
                <select
                  aria-label="Grupo do amigo secreto"
                  value={ssToken ?? ''}
                  onChange={(e) => { setSsToken(e.target.value); setSsStatus(null) }}
                >
                  {ssGroups.map((g) => (
                    <option key={g.token} value={g.token}>{g.groupName}</option>
                  ))}
                </select>
              )}
              <button type="button" className="btn btn-secondary" disabled={!size} onClick={handleAddToWishlist}>
                Pôr na lista do amigo secreto
              </button>
              {!size && <span className="meta">Escolha o tamanho primeiro.</span>}
              {ssStatus && (
                <span className={ssStatus.ok ? 'meta' : 'ss-error'}>
                  {ssStatus.text}{' '}
                  {ssStatus.ok && <Link to={`/amigo/eu/${ssToken}`} className="link-inline">Ver minha lista</Link>}
                </span>
              )}
            </div>
          )}

          {brand.features.customOrder && whatsappStoreUrl() && (
            <a
              className="btn btn-secondary pdp-custom"
              href={whatsappStoreUrl(brand.copy.customOrderMessage.replace('{produto}', product.name))}
              target="_blank"
              rel="noreferrer"
            >
              {brand.copy.customOrderLabel}
            </a>
          )}

          <div className="pdp-info">
            <span>{modes.shipping === 'auto' ? 'Frete calculado pelo CEP no carrinho' : 'Frete combinado pelo WhatsApp'}</span>
            {settings[SETTING_KEYS.delivery] && <span>{settings[SETTING_KEYS.delivery]}</span>}
            {settings[SETTING_KEYS.returns] && <span>{settings[SETTING_KEYS.returns]}</span>}
          </div>

          <div className="acc">
            {product.description && (
              <details open>
                <summary>Descrição</summary>
                {looksLikeHtml(product.description) ? (
                  <div
                    className="description rich"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(product.description) }}
                  />
                ) : (
                  <div className="description plain">{product.description}</div>
                )}
              </details>
            )}

            {product.specs.length > 0 && (
              <details>
                <summary>Especificações</summary>
                <dl className="specs">
                  {product.specs.map((sp, i) => (
                    <div key={i}>
                      <dt>{sp.label}</dt>
                      {sp.value && <dd>{sp.value}</dd>}
                    </div>
                  ))}
                </dl>
              </details>
            )}

            {hasCharts && (
              <details
                ref={measuresRef}
                open={measuresOpen}
                onToggle={(e) => setMeasuresOpen(e.currentTarget.open)}
              >
                <summary>Tabela de medidas</summary>
                {chartNames.length > 1 && (
                  <div className="pill-group" style={{ marginBottom: 12 }}>
                    {chartNames.map((n) => (
                      <button
                        key={n}
                        type="button"
                        className={`pill ${n === shownChart ? 'active' : ''}`}
                        onClick={() => setChartName(n)}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                )}
                <div className="chart-wrap">
                  <table className="chart-table">
                    <thead>
                      <tr>
                        {charts[shownChart][0].map((h, i) => (
                          <th key={i}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {charts[shownChart].slice(1).map((r, i) => (
                        <tr key={i}>
                          {charts[shownChart][0].map((_, j) => (
                            <td key={j}>{r[j] ?? ''}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className="related">
          <h3>Você também pode gostar</h3>
          <div className="product-grid">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

      {zoom && photos[photoIdx] && (
        <div className="lightbox" onClick={() => setZoom(false)}>
          <img src={photos[photoIdx]} alt={product.name} />
          <button type="button" className="lightbox-close" aria-label="Fechar">
            ×
          </button>
        </div>
      )}
    </div>
  )
}
