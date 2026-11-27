import { Link } from 'react-router-dom'

export default function Unavailable() {
  return (
    <div className="container empty-state">
      <p>O amigo secreto não está disponível no momento.</p>
      <p style={{ marginTop: 16 }}>
        <Link to="/" className="btn btn-secondary">Ver a loja</Link>
      </p>
    </div>
  )
}
