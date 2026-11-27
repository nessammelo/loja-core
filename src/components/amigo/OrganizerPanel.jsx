import { useState } from 'react'
import {
  drawNow,
  createRecoveryLink,
  resetParticipantLink,
  groupUrl,
  hideMessage,
  manageParticipant,
  personalUrl,
  recoveryUrl,
  whatsappShareUrl,
  formatDate,
} from '../../lib/secretSanta'
import CopyButton from './CopyButton'

// Painel do responsável, dentro da página secreta dele.
export default function OrganizerPanel({ token, data, reload }) {
  const { group, participants = [], reported = [] } = data
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [lostFor, setLostFor] = useState(null) // participante que perdeu o link
  const [linkFor, setLinkFor] = useState(null) // { name, url, kind: 'recovery' | 'reset' }

  const pending = participants.filter((p) => p.status === 'pending')
  const approved = participants.filter((p) => p.status === 'approved')
  const url = groupUrl(group.join_code)
  const invite =
    `Bora fazer o amigo secreto da ${group.name}? Entra pelo link e coloca teu tamanho: ${url}`

  async function run(fn) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      await reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function makeRecovery(p) {
    setError(null)
    try {
      const code = await createRecoveryLink(token, p.id)
      setLinkFor({ name: p.name, url: recoveryUrl(code), kind: 'recovery' })
      setLostFor(null)
    } catch (err) {
      setError(err.message)
    }
  }

  async function makeReset(p) {
    if (!confirm(`Trocar o link de ${p.name}? O link antigo para de funcionar e a página de ${p.name} vai avisar que o link foi trocado por você.`)) return
    setError(null)
    try {
      const t = await resetParticipantLink(token, p.id)
      setLinkFor({ name: p.name, url: personalUrl(t), kind: 'reset' })
      setLostFor(null)
    } catch (err) {
      setError(err.message)
    }
  }

  function handleDraw() {
    const extra = pending.length > 0 ? ` Quem ainda não foi aprovado (${pending.length}) fica de fora.` : ''
    if (!confirm(`Sortear agora com ${approved.length} pessoas? Depois não dá para desfazer.${extra}`)) return
    run(() => drawNow(token))
  }

  return (
    <section className="ss-section ss-panel">
      <div className="ss-kicker">Você é o responsável</div>
      <h2>Painel do grupo</h2>

      {error && <p className="ss-error">{error}</p>}

      {!group.drawn && (
        <div className="ss-box">
          <b>Link do grupo</b>
          <div className="ss-url">{url}</div>
          <div className="ss-actions-row">
            <a className="btn btn-primary" href={whatsappShareUrl(invite)} target="_blank" rel="noreferrer">
              Enviar no WhatsApp
            </a>
            <CopyButton text={url} />
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <div className="ss-block">
          <h3>Esperando aprovação ({pending.length})</h3>
          <div className="ss-list">
            {pending.map((p) => (
              <div key={p.id} className="ss-row">
                <span>
                  <b>{p.name}</b>
                  <span className="meta"> · {sizesText(p)}</span>
                </span>
                <span className="ss-row-actions">
                  <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => run(() => manageParticipant(token, p.id, 'remove'))}>
                    Recusar
                  </button>
                  <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => run(() => manageParticipant(token, p.id, 'approve'))}>
                    Aprovar
                  </button>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="ss-block">
        <h3>Participantes ({approved.length})</h3>
        <div className="ss-list">
          {approved.map((p) => (
            <div key={p.id} className="ss-row">
              <span>
                <b>{p.is_organizer ? `${p.name} (você)` : p.name}</b>
                <span className="meta"> · {p.has_wishlist || p.has_ideas ? 'lista de desejos pronta' : 'ainda sem lista'}
                  {p.has_email === false ? ' · sem e-mail' : ''}</span>
              </span>
              {!p.is_organizer && (
                <span className="ss-row-actions">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setLostFor(p); setLinkFor(null) }}>
                    Perdeu o link
                  </button>
                  {!group.drawn && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={busy}
                      onClick={() => confirm(`Tirar ${p.name} do grupo?`) && run(() => manageParticipant(token, p.id, 'remove'))}
                    >
                      Tirar
                    </button>
                  )}
                </span>
              )}
            </div>
          ))}
        </div>
        {lostFor && (
          <div className="ss-box" style={{ marginTop: 12 }}>
            <b>{lostFor.name} perdeu o link</b>
            <span className="meta">
              O link de recuperação só abre com o PIN que {lostFor.name} criou ao entrar. Você não
              consegue ver o que tem do outro lado.
            </span>
            <div className="ss-actions-row">
              <button type="button" className="btn btn-primary" onClick={() => makeRecovery(lostFor)}>
                Gerar link de recuperação
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setLostFor(null)}>Cancelar</button>
            </div>
            <span className="meta ss-small">
              Esqueceu o PIN também?{' '}
              <button type="button" className="link-btn" onClick={() => makeReset(lostFor)}>
                Trocar o link de {lostFor.name}
              </button>{' '}
              (a página da pessoa avisa que foi trocado por você).
            </span>
          </div>
        )}
        {linkFor && (
          <div className="ss-box" style={{ marginTop: 12 }}>
            <b>{linkFor.kind === 'recovery' ? `Link de recuperação de ${linkFor.name}` : `Novo link de ${linkFor.name}`}</b>
            <span className="meta">
              {linkFor.kind === 'recovery'
                ? 'Mande para essa pessoa. Ela abre e digita o PIN dela para voltar à página.'
                : 'Mande só para essa pessoa. O link antigo já parou de funcionar.'}
            </span>
            <div className="ss-url">{linkFor.url}</div>
            <div className="ss-actions-row">
              <a
                className="btn btn-primary"
                href={whatsappShareUrl(
                  linkFor.kind === 'recovery'
                    ? `${linkFor.name}, aqui está o link para recuperar tua página do amigo secreto da ${group.name}. Abre e digita o teu PIN: ${linkFor.url}`
                    : `${linkFor.name}, este é o teu novo link do amigo secreto da ${group.name}: ${linkFor.url}`
                )}
                target="_blank"
                rel="noreferrer"
              >
                Enviar no WhatsApp
              </a>
              <CopyButton text={linkFor.url} />
              <button type="button" className="btn btn-secondary" onClick={() => setLinkFor(null)}>Fechar</button>
            </div>
          </div>
        )}
      </div>

      {!group.drawn && (
        <div className="ss-block">
          <button type="button" className="btn btn-primary ss-full" disabled={busy || approved.length < 3} onClick={handleDraw}>
            Sortear agora
          </button>
          <p className="meta" style={{ textAlign: 'center', marginTop: 8 }}>
            {approved.length < 3
              ? 'O sorteio precisa de pelo menos 3 pessoas aprovadas.'
              : group.draw_mode === 'auto' && group.draw_date
                ? `Se ninguém sortear antes, o sorteio acontece sozinho em ${formatDate(group.draw_date)}.`
                : 'Depois do sorteio, o link do grupo fecha para novas entradas.'}
          </p>
        </div>
      )}

      {group.drawn && (
        <div className="ss-block">
          <h3>Mensagens denunciadas</h3>
          {reported.length === 0 ? (
            <p className="meta">Nenhuma. Você pode ocultar uma mensagem sem ver quem mandou.</p>
          ) : (
            <div className="ss-list">
              {reported.map((m) => (
                <div key={m.id} className="ss-row">
                  <span>{m.body}</span>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => run(() => hideMessage(token, m.id))}>
                    Ocultar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function sizesText(p) {
  const parts = []
  if (p.tee_size) parts.push(`Camiseta ${p.tee_size}`)
  if (p.hoodie_size) parts.push(`Moletom ${p.hoodie_size}`)
  return parts.length ? parts.join(' · ') : 'sem tamanho'
}
