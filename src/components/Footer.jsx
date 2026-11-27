import { Link } from 'react-router-dom'
import { brand, instagramUrl, whatsappStoreUrl } from '../brand'

export default function Footer() {
  const whatsapp = whatsappStoreUrl()
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <img src={brand.logo} alt={brand.name} style={{ height: 30, marginBottom: 12 }} />
          {brand.tagline && <p>{brand.tagline}</p>}
        </div>
        <nav className="footer-links">
          <Link to="/">Loja</Link>
          <Link to="/sobre">Sobre</Link>
          {instagramUrl && (
            <a href={instagramUrl} target="_blank" rel="noreferrer">
              Instagram
            </a>
          )}
          {whatsapp && (
            <a href={whatsapp} target="_blank" rel="noreferrer">
              WhatsApp
            </a>
          )}
          {brand.footerLinks.map((l) => (
            <a key={l.label} href={l.href}>
              {l.label}
            </a>
          ))}
        </nav>
      </div>
      <div className="container">
        <p style={{ marginTop: 24 }}>© {new Date().getFullYear()} {brand.name}.</p>
      </div>
    </footer>
  )
}
