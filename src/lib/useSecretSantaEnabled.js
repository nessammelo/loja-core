import { useEffect, useState } from 'react'
import { fetchSecretSantaEnabled } from './secretSanta'

// undefined = carregando
export default function useSecretSantaEnabled() {
  const [enabled, setEnabled] = useState(undefined)
  useEffect(() => {
    fetchSecretSantaEnabled().then(setEnabled).catch(() => setEnabled(false))
  }, [])
  return enabled
}
