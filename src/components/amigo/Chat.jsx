import { useState } from 'react'

// Conversa secreta. messages: [{ id, mine, body, reported }]
export default function Chat({ title, otherLabel, messages, onSend, onReport, placeholder }) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const inputId = `chat-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`

  async function handleSend(e) {
    e.preventDefault()
    if (!text.trim()) return
    setSending(true)
    setError(null)
    try {
      await onSend(text.trim())
      setText('')
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="ss-chat">
      <div className="ss-chat-title">{title}</div>
      {messages.length === 0 && <p className="meta">Nenhuma mensagem ainda.</p>}
      {messages.map((m) => (
        <div key={m.id} className={`ss-msg ${m.mine ? 'mine' : ''}`}>
          <div className="ss-bubble">{m.body}</div>
          <div className="ss-msg-meta">
            {m.mine ? 'Você' : otherLabel}
            {!m.mine && onReport && (
              m.reported ? (
                <span> · denunciada</span>
              ) : (
                <button type="button" className="link-btn" onClick={() => onReport(m.id)}>
                  Denunciar
                </button>
              )
            )}
          </div>
        </div>
      ))}
      <form className="ss-chat-form" onSubmit={handleSend}>
        <label className="sr-only" htmlFor={inputId}>{title}</label>
        <input
          id={inputId}
          value={text}
          maxLength={280}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
        />
        <button type="submit" className="btn btn-primary" disabled={sending || !text.trim()}>
          Enviar
        </button>
      </form>
      {error && <p className="ss-error">{error}</p>}
      <p className="meta ss-small">Até 280 caracteres, sem links.</p>
    </div>
  )
}
