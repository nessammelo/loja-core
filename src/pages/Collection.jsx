import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchProducts } from '../lib/catalog'
import { collectionSlug, DEFAULT_COLLECTION } from '../lib/collections'
import ProductCard from '../components/ProductCard'

// Página de uma coleção, acessada por link (funciona também pra coleções ocultas).
export default function Collection() {
  const { slug } = useParams()
  const [items, setItems] = useState([])
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetchProducts()
      .then((products) => {
        const matches = products.filter(
          (p) => collectionSlug(p.collection || DEFAULT_COLLECTION) === slug
        )
        setItems(matches)
        setTitle(matches[0] ? matches[0].collection || DEFAULT_COLLECTION : '')
      })
      .finally(() => setLoading(false))
  }, [slug])

  return (
    <div className="container">
      {loading ? (
        <p className="meta" style={{ paddingTop: 40 }}>Carregando...</p>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <p>Coleção não encontrada.</p>
          <p style={{ marginTop: 16 }}>
            <Link to="/" className="btn btn-secondary">Ver a loja</Link>
          </p>
        </div>
      ) : (
        <>
          <div className="collection-head">
            <h1>{title.replace(/-/g, ' ')}</h1>
            <div className="rule" />
          </div>
          <div className="product-grid">
            {items.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
