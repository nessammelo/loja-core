import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchAllProductsAdmin, deleteProduct, setProductActive } from '../../lib/catalog'
import OptimizeImagesPanel from '../../components/OptimizeImagesPanel'

export default function AdminProducts() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  function load() {
    setLoading(true)
    fetchAllProductsAdmin()
      .then(setProducts)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  async function handleDelete(p) {
    if (!confirm(`Apagar "${p.name}"? Isso remove o produto e as variantes.`)) return
    await deleteProduct(p.dbId)
    load()
  }

  async function handleToggle(p) {
    try {
      await setProductActive(p.dbId, !p.active)
      setProducts((list) => list.map((x) => (x.dbId === p.dbId ? { ...x, active: !p.active } : x)))
    } catch (e) {
      alert(`Não deu para salvar: ${e.message}`)
    }
  }

  if (loading) return <p className="meta">Carregando produtos...</p>
  if (error) return <p className="meta">Erro ao carregar produtos: {error}</p>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Produtos</h2>
        <Link to="/admin/produtos/novo" className="btn btn-primary">
          Novo produto
        </Link>
      </div>
      <div className="rule" />
      <OptimizeImagesPanel onDone={load} />
      <p className="meta" style={{ marginBottom: 16 }}>
        Oculto = some da home e das coleções, mas não é apagado e o link direto continua funcionando.
      </p>
      {products.length === 0 ? (
        <p className="meta">Nenhum produto cadastrado ainda.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Foto</th>
              <th>Produto</th>
              <th>Modelos</th>
              <th>Cores</th>
              <th>Preço</th>
              <th>Na loja</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.dbId} style={p.active ? undefined : { opacity: 0.55 }}>
                <td>
                  {p.image ? (
                    <img src={p.image} alt={p.name} loading="lazy" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 4 }} />
                  ) : (
                    <span className="meta">sem foto</span>
                  )}
                </td>
                <td>{p.name}</td>
                <td>{p.models.map((m) => m.label).join(', ')}</td>
                <td>{p.colors.join(', ')}</td>
                <td>
                  {p.priceFrom ? 'a partir de ' : ''}
                  {p.price.toLocaleString('pt-BR', {
                    style: 'currency',
                    currency: 'BRL',
                  })}
                </td>
                <td>
                  <label className="ss-inline-toggle">
                    <input
                      type="checkbox"
                      className="ss-switch"
                      checked={p.active}
                      onChange={() => handleToggle(p)}
                      aria-label={`Mostrar ${p.name} na loja`}
                    />
                    <span className="meta">{p.active ? 'Visível' : 'Oculto'}</span>
                  </label>
                </td>
                <td style={{ display: 'flex', gap: 8 }}>
                  <Link to={`/admin/produtos/${p.dbId}`} className="btn btn-secondary">
                    Editar
                  </Link>
                  <button className="btn btn-secondary" onClick={() => handleDelete(p)}>
                    Apagar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
