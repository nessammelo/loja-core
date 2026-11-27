import { useEffect, useState } from 'react'
import { findUnoptimizedImages, optimizeExistingImages } from '../lib/imageOptimize'

const mb = (bytes) => (bytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })

// Admin > Produtos: reduz as fotos antigas (produtos + banners) que estão
// pesadas no Supabase. Roda no navegador; pode clicar de novo se parar no meio.
export default function OptimizeImagesPanel({ onDone }) {
  const [pending, setPending] = useState(null)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  function check() {
    findUnoptimizedImages()
      .then((r) => setPending(r.pending.length))
      .catch((e) => setError(e.message))
  }
  useEffect(check, [])

  async function run() {
    setRunning(true)
    setError(null)
    setResult(null)
    try {
      const r = await optimizeExistingImages(setProgress)
      setResult(r)
      onDone?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setRunning(false)
      setProgress(null)
      check()
    }
  }

  if (pending === null && !error) return null
  if (pending === 0 && !result && !error) return null

  return (
    <div className="optimize-panel">
      <strong>Fotos pesadas</strong>
      {!running && !result && pending > 0 && (
        <p className="meta">
          {pending} foto(s) de produto ou banner ainda estão no tamanho original e gastam a banda
          do Supabase. Otimizar deixa elas ~10× menores, sem mudar a aparência. Leva alguns minutos;
          deixe esta aba aberta.
        </p>
      )}
      {running && progress && (
        <p className="meta">
          Otimizando {progress.done} de {progress.total}
          {progress.current ? ` (${progress.current})` : ''}... economia até agora: {mb(progress.savedBytes)} MB
        </p>
      )}
      {result && (
        <p className="meta">
          Pronto: {result.optimized} foto(s) otimizadas, {mb(result.savedBytes)} MB a menos.
          {result.updatedProducts > 0 && ` ${result.updatedProducts} produto(s) atualizado(s).`}
          {result.updatedBanners > 0 && ` ${result.updatedBanners} banner(s) atualizado(s).`}
          {result.failed.length > 0 && ` ${result.failed.length} falha(s): ${result.failed.map((f) => f.name).join(', ')}.`}
        </p>
      )}
      {error && <p className="meta">Erro: {error}</p>}
      {!running && pending > 0 && (
        <button type="button" className="btn btn-primary" onClick={run}>
          {result ? 'Tentar as que faltaram' : 'Otimizar fotos antigas'}
        </button>
      )}
    </div>
  )
}
