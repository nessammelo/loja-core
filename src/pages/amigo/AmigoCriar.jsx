import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import useSecretSantaEnabled from '../../lib/useSecretSantaEnabled'
import {
  createGroup,
  rememberGroup,
  formatDate,
  lastOrderDate,
  parseDate,
  today,
  toIso,
  trySaveGiftIdeas,
  trySaveContact,
  isValidEmail,
  isValidPhone,
} from '../../lib/secretSanta'
import ContactFields from '../../components/amigo/ContactFields'
import Unavailable from '../../components/amigo/Unavailable'
import SizePicker from '../../components/amigo/SizePicker'
import GiftIdeasField from '../../components/amigo/GiftIdeasField'

export default function AmigoCriar() {
  const enabled = useSecretSantaEnabled()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    name: '',
    organizerName: '',
    teeSize: '',
    hoodieSize: '',
    giftIdeas: '',
    exchangeDate: '',
    drawMode: 'auto',
    drawDate: '',
    minValue: '',
    maxValue: '',
    requireApproval: true,
    revealAfterExchange: true,
  })
  const [contact, setContact] = useState({ phone: '', email: '', optin: false })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  if (enabled === undefined) return <p className="meta container" style={{ paddingTop: 40 }}>Carregando...</p>
  if (!enabled) return <Unavailable />

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e?.target ? e.target.value : e }))
  const minDate = toIso(today())

  const lastOrder = form.exchangeDate ? lastOrderDate(form.exchangeDate) : null
  const tooLate = lastOrder && lastOrder < today()

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (!isValidPhone(contact.phone)) return setError('Confira o WhatsApp (com DDD).')
    if (contact.email.trim() && !isValidEmail(contact.email)) return setError('Confira o e-mail.')
    if (form.drawMode === 'auto' && !form.drawDate) return setError('Escolha a data do sorteio.')
    if (form.exchangeDate && form.drawDate && form.drawMode === 'auto' && parseDate(form.drawDate) > parseDate(form.exchangeDate)) {
      return setError('O sorteio precisa ser antes da troca.')
    }
    setSaving(true)
    try {
      const token = await createGroup(form)
      rememberGroup(token, form.name.trim(), form.organizerName.trim())
      await trySaveContact(token, contact)
      await trySaveGiftIdeas(token, form.giftIdeas)
      navigate(`/amigo/eu/${token}?novo=1`)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="container ss-page ss-narrow">
      <Link to="/amigo" className="back-link">← Amigo secreto</Link>
      <h1 className="ss-title ss-title-sm">Criar grupo</h1>

      <form onSubmit={handleSubmit} className="ss-form">
        <div className="field">
          <label htmlFor="ss-name">Nome do grupo ou academia</label>
          <input id="ss-name" required maxLength={60} value={form.name} onChange={set('name')} placeholder="Ex: Turma da noite" />
        </div>

        <div className="field">
          <label htmlFor="ss-org">Seu nome (responsável)</label>
          <input id="ss-org" required maxLength={40} value={form.organizerName} onChange={set('organizerName')} placeholder="Como o grupo te conhece" />
          <span className="meta">Você também participa do sorteio.</span>
        </div>

        <ContactFields idPrefix="ss-org" value={contact} onChange={setContact} withPhone phoneRequired />

        <GiftIdeasField id="ss-ideas" label="Suas outras ideias de presente" value={form.giftIdeas} onChange={set('giftIdeas')} />
        <SizePicker label="Seu tamanho de camiseta" value={form.teeSize} onChange={set('teeSize')} />
        <SizePicker label="Seu tamanho de moletom" value={form.hoodieSize} onChange={set('hoodieSize')} />

        <div className="field">
          <label htmlFor="ss-exchange">Data da troca de presentes</label>
          <input id="ss-exchange" type="date" min={minDate} value={form.exchangeDate} onChange={set('exchangeDate')} />
          {lastOrder && (
            <span className={`meta ${tooLate ? 'ss-warn' : ''}`}>
              {tooLate
                ? 'Atenção: pedidos feitos hoje podem não chegar até essa data.'
                : `Para chegar a tempo, os presentes precisam ser pedidos até ${formatDate(lastOrder)}. A gente avisa isso para todo o grupo.`}
            </span>
          )}
        </div>

        <fieldset className="ss-fieldset">
          <legend>Valor do presente</legend>
          <div className="ss-two">
            <div className="field">
              <label htmlFor="ss-min">Mínimo (R$)</label>
              <input id="ss-min" type="number" min="0" step="1" inputMode="numeric" value={form.minValue} onChange={set('minValue')} placeholder="Opcional" />
            </div>
            <div className="field">
              <label htmlFor="ss-max">Máximo (R$)</label>
              <input id="ss-max" type="number" min="0" step="1" inputMode="numeric" value={form.maxValue} onChange={set('maxValue')} placeholder="Opcional" />
            </div>
          </div>
          <span className="meta">A lista de desejos mostra tudo e só marca o que está dentro da faixa.</span>
        </fieldset>

        <fieldset className="ss-fieldset">
          <legend>Sorteio</legend>
          <label className={`ss-choice ${form.drawMode === 'auto' ? 'on' : ''}`}>
            <input type="radio" name="draw" checked={form.drawMode === 'auto'} onChange={() => set('drawMode')('auto')} />
            <span>
              <b>Automático na data</b>
              <span className="meta">A loja sorteia sozinha no dia marcado (com pelo menos 3 pessoas).</span>
            </span>
          </label>
          {form.drawMode === 'auto' && (
            <div className="field ss-indent">
              <label htmlFor="ss-draw">Data do sorteio</label>
              <input id="ss-draw" type="date" min={minDate} max={form.exchangeDate || undefined} value={form.drawDate} onChange={set('drawDate')} />
            </div>
          )}
          <label className={`ss-choice ${form.drawMode === 'manual' ? 'on' : ''}`}>
            <input type="radio" name="draw" checked={form.drawMode === 'manual'} onChange={() => set('drawMode')('manual')} />
            <span>
              <b>Manual</b>
              <span className="meta">Você clica em sortear quando todo mundo tiver entrado.</span>
            </span>
          </label>
        </fieldset>

        <label className="ss-toggle-row">
          <span>
            <b>Aprovar quem entra</b>
            <span className="meta">Quem abrir o link fica esperando sua aprovação.</span>
          </span>
          <input type="checkbox" className="ss-switch" checked={form.requireApproval} onChange={(e) => set('requireApproval')(e.target.checked)} />
        </label>

        <label className="ss-toggle-row">
          <span>
            <b>Revelar quem tirou quem</b>
            <span className="meta">No dia seguinte à troca, todo mundo vê a roda completa.</span>
          </span>
          <input type="checkbox" className="ss-switch" checked={form.revealAfterExchange} onChange={(e) => set('revealAfterExchange')(e.target.checked)} />
        </label>

        {error && <p className="ss-error">{error}</p>}

        <button type="submit" className="btn btn-primary ss-full" disabled={saving}>
          {saving ? 'Criando...' : 'Criar grupo'}
        </button>
        <p className="meta" style={{ textAlign: 'center' }}>
          Sem cadastro. Você recebe um link secreto para gerenciar o grupo.
        </p>
      </form>
    </div>
  )
}
