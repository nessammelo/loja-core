import { GIFT_IDEAS_MAX } from '../../lib/secretSanta'

// campo livre para presentes que não são da loja
export default function GiftIdeasField({ id, value, onChange, label = 'Outras ideias de presente' }) {
  return (
    <div className="field">
      <label htmlFor={id}>
        {label} <span className="meta">(opcional)</span>
      </label>
      <textarea
        id={id}
        rows={3}
        maxLength={GIFT_IDEAS_MAX}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Ex: chocolate amargo, livro, garrafinha, faixa de jiu-jitsu..."
      />
      <span className="meta">
        Coisas que não são da loja e você gostaria de ganhar. Só quem te tirar vê.
      </span>
    </div>
  )
}
