import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { captureRefFromSearch } from '../lib/crewRef'

// Em qualquer página: se a URL tiver ?ref=nome da Crew, guarda por 30 dias.
export default function RefTracker() {
  const { search } = useLocation()
  useEffect(() => {
    if (search) captureRefFromSearch(search)
  }, [search])
  return null
}
