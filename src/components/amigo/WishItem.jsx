import { Link } from 'react-router-dom'
import { photosFor } from '../../lib/catalog'
import { formatMoney, priceFit } from '../../lib/secretSanta'

const FIT_TEXT = { in: 'Dentro do valor', above: 'Acima do valor', below: 'Abaixo do valor' }

// item da lista de desejos (vem do banco já com nome, preço e fotos do produto)
export default function WishItem({ item, min, max, onRemove, buyable }) {
  const images = item.image_urls?.length ? item.image_urls : item.image_url ? [item.image_url] : []
  const photo = photosFor({ colorImages: item.color_images || {}, images }, item.model_label, item.color)[0]
  const fit = item.price != null ? priceFit(Number(item.price), min, max) : null
  const params = new URLSearchParams({ modelo: item.model_label, cor: item.color, tamanho: item.size })
  const href = `/produto/${item.product_slug}?${params}`

  return (
    <div className="ss-wish">
      <Link to={href} className="ss-wish-photo">
        {photo ? <img src={photo} alt={item.product_name} loading="lazy" decoding="async" /> : <span>{item.product_name}</span>}
      </Link>
      <div className="ss-wish-info">
        <b>{item.product_name}</b>
        <span className="meta">
          {item.model_label} · {item.color} · {item.size}
        </span>
        {item.price != null && <span>{formatMoney(item.price)}</span>}
        {fit && <span className={`ss-fit ss-fit-${fit}`}>{FIT_TEXT[fit]}</span>}
      </div>
      <div className="ss-wish-actions">
        {buyable && (
          <Link to={href} className="btn btn-primary btn-sm">Comprar</Link>
        )}
        {onRemove && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onRemove(item.id)}>
            Tirar
          </button>
        )}
      </div>
    </div>
  )
}
