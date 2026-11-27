import { useEffect, useState } from 'react'
import { fetchSecretSantaEnabled } from './secretSanta'
import { brand } from '../brand'

// undefined = carregando. Cliente sem o módulo (brand.features.secretSanta) = sempre false.
export default function useSecretSantaEnabled() {
  const available = brand.features.secretSanta
  const [enabled, setEnabled] = useState(available ? undefined : false)
  useEffect(() => {
    if (!available) return
    fetchSecretSantaEnabled().then(setEnabled).catch(() => setEnabled(false))
  }, [available])
  return enabled
}
