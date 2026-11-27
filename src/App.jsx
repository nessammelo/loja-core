import { Routes, Route, Outlet, Navigate } from 'react-router-dom'
import Header from './components/Header'
import Footer from './components/Footer'
import Home from './pages/Home'
import ProductDetail from './pages/ProductDetail'
import Cart from './pages/Cart'
import Checkout from './pages/Checkout'
import OrderConfirmation from './pages/OrderConfirmation'
import RescueCart from './pages/RescueCart'
import About from './pages/About'
import Collection from './pages/Collection'
import AdminLayout from './pages/admin/AdminLayout'
import AdminOrders from './pages/admin/AdminOrders'
import AdminProducts from './pages/admin/AdminProducts'
import AdminProductForm from './pages/admin/AdminProductForm'
import AdminLogin from './pages/admin/AdminLogin'
import AdminBanners from './pages/admin/AdminBanners'
import AdminCoupons from './pages/admin/AdminCoupons'
import AdminCollections from './pages/admin/AdminCollections'
import AdminInfo from './pages/admin/AdminInfo'
import AdminAmigo from './pages/admin/AdminAmigo'
import AdminShipping from './pages/admin/AdminShipping'
import AdminReports from './pages/admin/AdminReports'
import AdminPayments from './pages/admin/AdminPayments'
import AmigoHome from './pages/amigo/AmigoHome'
import AmigoCriar from './pages/amigo/AmigoCriar'
import AmigoEntrar from './pages/amigo/AmigoEntrar'
import AmigoPagina from './pages/amigo/AmigoPagina'
import AmigoRecuperar from './pages/amigo/AmigoRecuperar'
import { brand } from './brand'

function StoreLayout() {
  return (
    <>
      <Header />
      <main>
        <Outlet />
      </main>
      <Footer />
    </>
  )
}

export default function App() {
  return (
    <Routes>
      <Route element={<StoreLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/produto/:id" element={<ProductDetail />} />
        <Route path="/carrinho" element={<Cart />} />
        <Route path="/carrinho/recuperar/:orderId" element={<RescueCart />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/pedido-confirmado" element={<OrderConfirmation />} />
        <Route path="/colecao/:slug" element={<Collection />} />
        <Route path="/sobre" element={<About />} />
        {brand.features.secretSanta && (
          <>
            <Route path="/amigo" element={<AmigoHome />} />
            <Route path="/amigo/criar" element={<AmigoCriar />} />
            <Route path="/amigo/g/:code" element={<AmigoEntrar />} />
            <Route path="/amigo/eu/:token" element={<AmigoPagina />} />
            <Route path="/amigo/recuperar/:code" element={<AmigoRecuperar />} />
          </>
        )}
      </Route>
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Navigate to="pedidos" replace />} />
        <Route path="pedidos" element={<AdminOrders />} />
        <Route path="relatorio" element={<AdminReports />} />
        <Route path="produtos" element={<AdminProducts />} />
        <Route path="produtos/novo" element={<AdminProductForm />} />
        <Route path="produtos/:productId" element={<AdminProductForm />} />
        <Route path="banners" element={<AdminBanners />} />
        <Route path="cupons" element={<AdminCoupons />} />
        <Route path="pagamento" element={<AdminPayments />} />
        <Route path="medidas" element={<AdminInfo />} />
        <Route path="colecoes" element={<AdminCollections />} />
        {brand.features.shipping === 'gubo' && <Route path="frete" element={<AdminShipping />} />}
        {brand.features.secretSanta && <Route path="amigo-secreto" element={<AdminAmigo />} />}
      </Route>
    </Routes>
  )
}
