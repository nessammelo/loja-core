import { Link } from 'react-router-dom'
import { brand, instagramUrl, instagramHandle, whatsappStoreUrl } from '../brand'

function InstagramIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export default function Footer() {
  const whatsapp = whatsappStoreUrl()
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <img src={brand.logoFooter || brand.logo} alt={brand.name} className="footer-logo" />
          {brand.tagline && <p>{brand.tagline}</p>}
          {brand.footerFollowLabel && instagramUrl && (
            <a href={instagramUrl} target="_blank" rel="noreferrer" className="footer-follow">
              <InstagramIcon />
              <span>
                {brand.footerFollowLabel}
                <small>{instagramHandle}</small>
              </span>
            </a>
          )}
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
