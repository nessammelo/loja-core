import { useState } from 'react'

// copia um texto; se o navegador não deixar, mostra o texto pra copiar na mão
export default function CopyButton({ text, label = 'Copiar', className = 'btn btn-secondary' }) {
  const [done, setDone] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setDone(true)
      setTimeout(() => setDone(false), 2000)
    } catch {
      window.prompt('Copie o link:', text)
    }
  }

  return (
    <button type="button" className={className} onClick={copy}>
      {done ? 'Copiado' : label}
    </button>
  )
}
