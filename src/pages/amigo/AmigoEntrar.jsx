import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  fetchGroupPreview,
  joinGroup,
  rememberGroup,
  formatDate,
  valueRangeText,
  trySaveGiftIdeas,
  trySaveContact,
  isValidEmail,
} from '../../lib/secretSanta'
import ContactFields from '../../components/amigo/ContactFields'
import SizePicker from '../../components/amigo/SizePicker'
import GiftIdeasField from '../../components/amigo/GiftIdeasField'

// Página do link do grupo: quem recebe o link entra com nome e tamanhos.
export default function AmigoEntrar() {
  const { code } = useParams()
  const navigate = useNavigate()
  const [group, setGroup] = useState(undefined)
  const [name, setName] = useState('')
  const [teeSize, setTeeSize] = useState('')
  const [hoodieSize, setHoodieSize] = useState('')
  const [pin, setPin] = useState('')
  const [giftIdeas, setGiftIdeas] = useState('')
  const [contact, setContact] = useState({ email: '', optin: false })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchGroupPreview(code).then(setGroup).catch(() => setGroup(null))
  }, [code])

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (contact.email.trim() && !isValidEmail(contact.email)) return setError('Confira o e-mail.')
    setSaving(true)
    try {
      const token = await joinGroup(code, name, teeSize, hoodieSize, pin)
      rememberGroup(token, group.name, name.trim())
      await trySaveContact(token, contact)
      await trySaveGiftIdeas(token, giftIdeas)
      navigate(`/amigo/eu/${token}?novo=1`)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  if (group === undefined) return <p className="meta container" style={{ paddingTop: 40 }}>Carregando...</p>
  if (group === null) {
    return (
      <div className="container empty-state">
        <p>Grupo não encontrado. Confira o link com quem te convidou.</p>
      </div>
    )
  }

  return (
    <div className="container ss-page ss-narrow">
      <div className="ss-kicker">Amigo secreto · convite</div>
      <h1 className="ss-title ss-title-sm">{group.name}</h1>
      <p className="meta">
        Organizado por {group.organizer} · {group.count} {group.count === 1 ? 'pessoa' : 'pessoas'} no grupo
      </p>

      <div className="ss-facts">
        <div>
          <span>Sorteio</span>
          <b>{group.draw_mode === 'auto' && group.draw_date ? formatDate(group.draw_date) : 'Pelo responsável'}</b>
        </div>
        <div>
          <span>Troca</span>
          <b>{group.exchange_date ? formatDate(group.exchange_date) : 'A combinar'}</b>
        </div>
        <div>
          <span>Valor</span>
          <b>{valueRangeText(group.min_value, group.max_value)}</b>
        </div>
      </div>

      {!group.open ? (
        <p className="ss-box">
          {group.drawn
            ? 'Esse grupo já fez o sorteio e não aceita mais gente.'
            : 'O amigo secreto não está disponível no momento.'}
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="ss-form">
          <div className="field">
            <label htmlFor="ss-join-name">Seu nome</label>
            <input id="ss-join-name" required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="Como o grupo te conhece" />
          </div>
          <ContactFields idPrefix="ss-join" value={contact} onChange={setContact} />
          <GiftIdeasField id="ss-join-ideas" value={giftIdeas} onChange={setGiftIdeas} />
          <SizePicker label="Tamanho de camiseta" value={teeSize} onChange={setTeeSize} />
          <SizePicker label="Tamanho de moletom" value={hoodieSize} onChange={setHoodieSize} />
          <p className="meta">Só quem te tirar vê seus tamanhos.</p>
          <div className="field">
            <label htmlFor="ss-join-pin">Crie um PIN de 4 números</label>
            <input
              id="ss-join-pin"
              required
              inputMode="numeric"
              autoComplete="off"
              pattern="[0-9]{4}"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              className="ss-pin"
            />
            <span className="meta">
              Só serve se você perder seu link. Não conte para ninguém, nem para quem organiza.
            </span>
          </div>
          {error && <p className="ss-error">{error}</p>}
          <button type="submit" className="btn btn-primary ss-full" disabled={saving}>
            {saving ? 'Entrando...' : 'Entrar no grupo'}
          </button>
          {group.require_approval && (
            <p className="meta" style={{ textAlign: 'center' }}>
              {group.organizer} precisa aprovar sua entrada.
            </p>
          )}
        </form>
      )}

      <p style={{ marginTop: 32 }}>
        <Link to="/" className="back-link">Ver a loja</Link>
      </p>
    </div>
  )
}
