import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <img src="/assets/logo-edge.png" alt="EDGE" style={{ height: 30, marginBottom: 12 }} />
          <p>Camisetas minimalistas com essência do Jiu-Jitsu.</p>
        </div>
        <nav className="footer-links">
          <Link to="/">Loja</Link>
          <Link to="/sobre">Sobre</Link>
          <a href="https://instagram.com/edge.bjj" target="_blank" rel="noreferrer">
            Instagram
          </a>
          <a href="#">Trocas e devoluções</a>
          <a href="#">Política de privacidade</a>
          <a href="#">Termos de uso</a>
        </nav>
      </div>
      <div className="container">
        <p style={{ marginTop: 24 }}>© {new Date().getFullYear()} EDGE.</p>
      </div>
    </footer>
  )
}
