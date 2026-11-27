import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchProducts } from '../lib/catalog'
import { fetchBanners } from '../lib/banners'
import { fetchCollectionSettings, sortGroups, collectionSlug, DEFAULT_COLLECTION } from '../lib/collections'
import { brand } from '../brand'
import ProductCard from '../components/ProductCard'
import useSecretSantaEnabled from '../lib/useSecretSantaEnabled'

const AUTOPLAY_MS = 6000

function groupByCollection(products) {
  const groups = new Map()
  for (const p of products) {
    const key = p.collection || DEFAULT_COLLECTION
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(p)
  }
  return Array.from(groups.entries())
}

export default function Home() {
  const [products, setProducts] = useState([])
  const [allBanners, setBanners] = useState([])
  const [settings, setSettings] = useState({ order: {}, hidden: new Set(), images: {} })
  const [bannerIndex, setBannerIndex] = useState(0)
  const [touchStartX, setTouchStartX] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [paused, setPaused] = useState(false)
  const secretSantaEnabled = useSecretSantaEnabled()
  const heroRef = useRef(null)

  // banner que leva pro amigo secreto some sozinho quando o amigo secreto está desligado
  // espera saber se o amigo secreto está ligado, pra não pular de banner na abertura
  const banners = secretSantaEnabled === undefined ? [] : allBanners.filter(
    (b) => secretSantaEnabled || !/^\/?amigo(\/|$)/.test(linkPath(b.cta_link))
  )
  const current = banners.length ? Math.min(bannerIndex, banners.length - 1) : 0

  useEffect(() => {
    Promise.all([fetchProducts(), fetchBanners(), fetchCollectionSettings()])
      .then(([p, b, o]) => {
        setProducts(p)
        setBanners(b)
        setSettings(o)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  // coleções ocultas não aparecem na home (só pelo link /colecao/<nome>)
  const groups = sortGroups(groupByCollection(products), settings.order).filter(
    ([name]) => !settings.hidden.has(name)
  )

  // banners com título ganham o texto por cima (à esquerda) e um hero mais alto
  const heroWithText = banners.some((b) => (b.title || '').trim())

  function go(step) {
    setBannerIndex((i) => (Math.min(i, banners.length - 1) + step + banners.length) % banners.length)
  }

  // troca automática: a cada 6s, pausa com o mouse em cima, com a aba escondida
  // e para quem pediu menos movimento no aparelho. Mexer no banner reinicia o tempo.
  useEffect(() => {
    if (banners.length < 2 || paused) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') go(1)
    }, AUTOPLAY_MS)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, banners.length, paused])

  // deslizar o dedo no banner (celular) troca de banner
  function handleTouchEnd(e) {
    setPaused(false)
    if (touchStartX === null || banners.length < 2) return
    const delta = e.changedTouches[0].clientX - touchStartX
    setTouchStartX(null)
    if (Math.abs(delta) < 40) return
    go(delta < 0 ? 1 : -1)
  }

  return (
    <div>
      {banners.length > 0 && (
        <section
          ref={heroRef}
          className={`hero ${heroWithText ? 'hero-with-text' : ''}`}
          aria-roledescription="carrossel"
          aria-label="Destaques"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={(e) => {
            if (!heroRef.current?.contains(e.relatedTarget)) setPaused(false)
          }}
          onTouchStart={(e) => {
            setPaused(true)
            setTouchStartX(e.touches[0].clientX)
          }}
          onTouchEnd={handleTouchEnd}
        >
          {banners.map((b, i) => (
            <div
              key={b.id}
              className={`hero-slide ${i === current ? 'active' : ''}`}
              aria-hidden={i !== current}
            >
              <img
                src={b.image_url}
                alt={b.alt_text || ''}
                loading={i === 0 ? 'eager' : 'lazy'}
                fetchPriority={i === 0 ? 'high' : 'auto'}
              />
              {(b.title || '').trim() ? (
                <div className="hero-text">
                  <h2>{b.title}</h2>
                  {b.subtitle && <p>{b.subtitle}</p>}
                  {i === current && <BannerButton banner={b} inline />}
                </div>
              ) : (
                i === current && <BannerButton banner={b} />
              )}
            </div>
          ))}
          {banners.length > 1 && (
            <>
              <button
                type="button"
                className="carousel-arrow carousel-arrow-left"
                aria-label="Banner anterior"
                onClick={() => go(-1)}
              >
                ‹
              </button>
              <button
                type="button"
                className="carousel-arrow carousel-arrow-right"
                aria-label="Próximo banner"
                onClick={() => go(1)}
              >
                ›
              </button>
              <div className="carousel-dots">
                {banners.map((b, i) => (
                  <button
                    key={b.id}
                    type="button"
                    aria-label={`Banner ${i + 1}`}
                    className={`carousel-dot ${i === current ? 'active' : ''}`}
                    onClick={() => setBannerIndex(i)}
                  />
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {brand.home.collectionCards && groups.length > 0 && (
        <CollectionCards groups={groups} images={settings.images || {}} />
      )}

      <div className="container" id="colecao">
        {loading && <p className="meta" style={{ paddingTop: 40 }}>Carregando produtos...</p>}
        {error && <p className="meta" style={{ paddingTop: 40 }}>Erro ao carregar produtos: {error}</p>}

        {groups.map(([collection, items]) => (
          <div key={collection}>
            <div className="collection-head">
              <h1>{collection.replace(/-/g, ' ')}</h1>
              <div className="rule" />
            </div>
            <div className="product-grid">
              {items.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// link completo da própria loja vira caminho interno (não abre outra aba)
function linkPath(raw) {
  const link = (raw || '').trim()
  if (link.startsWith(window.location.origin)) return link.slice(window.location.origin.length) || '/'
  return link
}

// cards de coleção (foto + nome) antes da lista de produtos (brand.home.collectionCards).
// Foto: a escolhida em Admin > Coleções ou, sem ela, a capa do primeiro produto.
function CollectionCards({ groups, images }) {
  return (
    <section className="container collection-cards-wrap" id="colecoes">
      <div className="collection-head">
        <h2>{brand.home.collectionsTitle}</h2>
        <div className="rule" />
      </div>
      <div className="collection-cards">
        {groups.map(([name, items]) => {
          const img = images[name] || items.find((p) => p.image)?.image
          return (
            <Link key={name} to={`/colecao/${collectionSlug(name)}`} className="collection-card">
              <div className="collection-card-img">{img && <img src={img} alt="" loading="lazy" />}</div>
              <span className="collection-card-label">
                {name.replace(/-/g, ' ')} <span aria-hidden="true">→</span>
              </span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

// botão do banner configurado no admin; sem link não mostra botão
function BannerButton({ banner, inline }) {
  const link = linkPath(banner.cta_link)
  if (!link) return null
  const text = (banner.cta_text || '').trim() || 'Ver mais'
  const cls = `btn btn-primary ${inline ? 'hero-text-cta' : 'hero-cta'}`
  if (/^https?:\/\//i.test(link)) {
    return (
      <a href={link} target="_blank" rel="noreferrer" className={cls}>
        {text}
      </a>
    )
  }
  if (link.startsWith('#')) {
    return (
      <a href={link} className={cls}>
        {text}
      </a>
    )
  }
  return (
    <Link to={link.startsWith('/') ? link : `/${link}`} className={cls}>
      {text}
    </Link>
  )
}
