import { SIZES } from '../../lib/secretSanta'

// escolha de tamanho em bolinhas; clicar de novo no escolhido desmarca
export default function SizePicker({ label, value, onChange }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="pill-group" role="group" aria-label={label}>
        {SIZES.map((s) => (
          <button
            key={s}
            type="button"
            className={`pill ss-size ${value === s ? 'active' : ''}`}
            aria-pressed={value === s}
            onClick={() => onChange(value === s ? '' : s)}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}
