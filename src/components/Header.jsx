import { Link } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import useSecretSantaEnabled from '../lib/useSecretSantaEnabled'
import { brand, instagramUrl } from '../brand'

export default function Header() {
  const { count } = useCart()
  const secretSanta = useSecretSantaEnabled()

  return (
    <header className="site-header">
      <div className="container">
        <Link to="/" className="logo">
          <img src={brand.logo} alt={brand.name} />
        </Link>
        <nav className={`nav-links ${secretSanta ? 'has-amigo' : ''}`}>
          <Link to="/">Loja</Link>
          {secretSanta && <Link to="/amigo">Amigo secreto</Link>}
          <Link to="/sobre">Sobre</Link>
          {instagramUrl && (
            <a href={instagramUrl} target="_blank" rel="noreferrer" className="nav-instagram">
              Instagram
            </a>
          )}
        </nav>
        <Link to="/carrinho" className="cart-link">
          Carrinho
          {count > 0 && <span className="cart-badge">{count}</span>}
        </Link>
      </div>
    </header>
  )
}
