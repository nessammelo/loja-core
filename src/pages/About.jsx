import { brand } from '../brand'

export default function About() {
  return (
    <div className="container" style={{ paddingBottom: 80, maxWidth: 640 }}>
      <div style={{ paddingTop: 40 }}>
        <h1>Sobre</h1>
        <div className="rule" />
      </div>
      {brand.about.map((p, i) => (
        <p key={i} style={{ color: 'var(--text-muted)', lineHeight: 1.7 }}>
          {p}
        </p>
      ))}
    </div>
  )
}
