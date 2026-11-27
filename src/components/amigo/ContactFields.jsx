import { brand } from '../../brand'
import { formatPhone } from '../../lib/secretSanta'

// E-mail (sem "opcional" escrito, mas não obrigatório), aceite de novidades
// (sempre começa desmarcado) e, pra quem organiza, WhatsApp obrigatório.
export default function ContactFields({ idPrefix, value, onChange, withPhone = false, phoneRequired = false }) {
  const set = (key) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    onChange({ ...value, [key]: key === 'phone' ? formatPhone(v) : v })
  }
  return (
    <>
      {withPhone && (
        <div className="field">
          <label htmlFor={`${idPrefix}-phone`}>Seu WhatsApp</label>
          <input
            id={`${idPrefix}-phone`}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            required={phoneRequired}
            value={value.phone || ''}
            onChange={set('phone')}
            placeholder="(51) 99999-9999"
          />
          <span className="meta">Pra gente falar com você se algo der errado no grupo.</span>
        </div>
      )}
      <div className="field">
        <label htmlFor={`${idPrefix}-email`}>Seu e-mail</label>
        <input
          id={`${idPrefix}-email`}
          type="email"
          inputMode="email"
          autoComplete="email"
          maxLength={120}
          value={value.email || ''}
          onChange={set('email')}
          placeholder="voce@email.com"
        />
        <span className="meta">Pra te avisar quando sair o sorteio e quando chegar mensagem nova.</span>
      </div>
      <label className="ss-check">
        <input type="checkbox" checked={Boolean(value.optin)} onChange={set('optin')} />
        <span>Quero receber novidades e cupons da {brand.name}{withPhone ? ' por e-mail e WhatsApp' : ' por e-mail'}.</span>
      </label>
    </>
  )
}
