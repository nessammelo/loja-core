import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { recoverWithPin } from '../../lib/secretSanta'

// Link de recuperação: a pessoa digita o PIN que criou ao entrar no grupo.
export default function AmigoRecuperar() {
  const { code } = useParams()
  const navigate = useNavigate()
  const [pin, setPin] = useState('')
  const [error, setError] = useState(null)
  const [checking, setChecking] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setChecking(true)
    setError(null)
    try {
      const token = await recoverWithPin(code, pin)
      navigate(`/amigo/eu/${token}?novo=1`, { replace: true })
    } catch (err) {
      setError(err.message)
      setPin('')
      setChecking(false)
    }
  }

  return (
    <div className="container ss-page ss-narrow">
      <div className="ss-kicker">Amigo secreto</div>
      <h1 className="ss-title ss-title-sm">Recuperar meu link</h1>
      <form onSubmit={handleSubmit} className="ss-form">
        <div className="field">
          <label htmlFor="ss-rec-pin">Seu PIN de 4 números</label>
          <input
            id="ss-rec-pin"
            required
            inputMode="numeric"
            autoComplete="off"
            pattern="[0-9]{4}"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            className="ss-pin"
          />
          <span className="meta">É o PIN que você criou quando entrou no grupo.</span>
        </div>
        {error && <p className="ss-error">{error}</p>}
        <button type="submit" className="btn btn-primary ss-full" disabled={checking || pin.length !== 4}>
          {checking ? 'Conferindo...' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
