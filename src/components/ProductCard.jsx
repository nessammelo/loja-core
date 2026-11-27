import { Link } from 'react-router-dom'

export default function ProductCard({ product }) {
  return (
    <Link to={`/produto/${product.id}`} className="product-card">
      <div className="photo">
        {product.image ? (
          <img src={product.image} alt={product.name} loading="lazy" decoding="async" />
        ) : (
          product.name
        )}
      </div>
      <div className="info">
        <div className="tagline">{product.tagline}</div>
        <h3>{product.name}</h3>
        <div className="price">
          {product.priceFrom && <span className="price-from">a partir de </span>}
          {product.price.toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL',
          })}
        </div>
      </div>
    </Link>
  )
}
