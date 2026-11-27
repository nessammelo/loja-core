import { Link } from 'react-router-dom'
import useSecretSantaEnabled from '../../lib/useSecretSantaEnabled'
import { christmasLastOrderDate, formatDate, savedGroups } from '../../lib/secretSanta'
import Unavailable from '../../components/amigo/Unavailable'

const STEPS = [
  ['Crie o grupo', 'Nome da academia, data do sorteio, data da troca e faixa de valor.'],
  ['Mande o link no grupo do WhatsApp', 'Cada um entra com nome e tamanho. Se quiser, você aprova quem entra.'],
  ['Sorteio', 'Automático na data marcada ou quando você clicar em sortear.'],
  ['Lista de desejos e mensagens secretas', 'Veja o que seu amigo quer, compre na loja e mande recados sem se identificar.'],
]

export default function AmigoHome() {
  const enabled = useSecretSantaEnabled()
  const mine = savedGroups()

  if (enabled === undefined) return <p className="meta container" style={{ paddingTop: 40 }}>Carregando...</p>
  if (!enabled) return <Unavailable />

  return (
    <div className="container ss-page">
      <section className="ss-hero">
        <div className="ss-kicker">Fim de ano</div>
        <h1 className="ss-title">Amigo secreto Edge</h1>
        <p className="ss-lead">
          Organize o amigo secreto da sua academia e acerte no presente: cada um monta a própria
          lista de desejos com o tamanho certo.
        </p>
        <div className="ss-actions">
          <Link to="/amigo/criar" className="btn btn-primary">Criar grupo</Link>
        </div>
      </section>

      {mine.length > 0 && (
        <section className="ss-section">
          <h2>Seus grupos</h2>
          <div className="ss-list">
            {mine.map((g) => (
              <Link key={g.token} to={`/amigo/eu/${g.token}`} className="ss-row ss-row-link">
                <span>
                  <b>{g.groupName}</b>
                  <span className="meta"> · {g.myName}</span>
                </span>
                <span aria-hidden="true">→</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="ss-section">
        <h2>Como funciona</h2>
        <ol className="ss-steps">
          {STEPS.map(([title, text], i) => (
            <li key={title}>
              <span className="ss-step-n">{String(i + 1).padStart(2, '0')}</span>
              <span>
                <b>{title}</b>
                <span className="meta">{text}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="ss-box">
        <b>Peça até {formatDate(christmasLastOrderDate())} para chegar antes do Natal</b>
        <span className="meta">
          Cada peça é produzida sob demanda. Entre produção e entrega são cerca de 12 dias, e a
          gente deixa uma folga para o movimento de fim de ano.
        </span>
      </section>
    </div>
  )
}
