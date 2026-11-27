import { NavLink, Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { brand } from '../../brand'

export default function AdminLayout() {
  const { session, loading, signOut } = useAuth()

  if (loading) return <p className="meta container">Carregando...</p>
  if (!session) return <Navigate to="/admin/login" replace />

  return (
    <div className="admin-shell">
      <nav className="admin-nav">
        <NavLink to="/admin/pedidos" className={({ isActive }) => (isActive ? 'active' : '')}>
          Pedidos
        </NavLink>
        <NavLink to="/admin/relatorio" className={({ isActive }) => (isActive ? 'active' : '')}>
          Relatório
        </NavLink>
        <NavLink to="/admin/produtos" className={({ isActive }) => (isActive ? 'active' : '')}>
          Produtos
        </NavLink>
        <NavLink to="/admin/banners" className={({ isActive }) => (isActive ? 'active' : '')}>
          Banners
        </NavLink>
        <NavLink to="/admin/colecoes" className={({ isActive }) => (isActive ? 'active' : '')}>
          Coleções
        </NavLink>
        <NavLink to="/admin/medidas" className={({ isActive }) => (isActive ? 'active' : '')}>
          Medidas e avisos
        </NavLink>
        <NavLink to="/admin/pagamento" className={({ isActive }) => (isActive ? 'active' : '')}>
          Pagamento e frete
        </NavLink>
        {brand.features.shipping === 'gubo' && (
          <NavLink to="/admin/frete" className={({ isActive }) => (isActive ? 'active' : '')}>
            Frete Gubo
          </NavLink>
        )}
        <NavLink to="/admin/cupons" className={({ isActive }) => (isActive ? 'active' : '')}>
          Cupons
        </NavLink>
        {brand.features.secretSanta && (
          <NavLink to="/admin/amigo-secreto" className={({ isActive }) => (isActive ? 'active' : '')}>
            Amigo secreto
          </NavLink>
        )}
        <button
          className="btn btn-secondary"
          style={{ margin: '16px 24px' }}
          onClick={signOut}
        >
          Sair
        </button>
      </nav>
      <div className="admin-content">
        <Outlet />
      </div>
    </div>
  )
}
