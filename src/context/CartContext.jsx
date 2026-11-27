import { createContext, useContext, useEffect, useMemo, useState } from 'react'

const CartContext = createContext(null)
const CART_KEY = 'edge_cart_v1'
const CEP_KEY = 'edge_cep_v1'

export function CartProvider({ children }) {
  // guarda o carrinho no aparelho: no celular o navegador recarrega a aba
  // com frequência e o cliente não pode perder o que já escolheu.
  const [items, setItems] = useState(() => {
    try {
      const saved = localStorage.getItem(CART_KEY)
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })

  // CEP do frete, digitado no carrinho ou no checkout
  const [cep, setCep] = useState(() => {
    try {
      return localStorage.getItem(CEP_KEY) || ''
    } catch {
      return ''
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(CEP_KEY, cep)
    } catch {
      // sem armazenamento disponível: segue só em memória
    }
  }, [cep])

  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(items))
    } catch {
      // sem armazenamento disponível: segue só em memória
    }
  }, [items])

  function addItem(item) {
    setItems((prev) => {
      const existing = prev.find(
        (i) =>
          i.productId === item.productId &&
          i.modelId === item.modelId &&
          i.size === item.size &&
          i.color === item.color
      )
      if (existing) {
        return prev.map((i) =>
          i === existing ? { ...i, qty: i.qty + item.qty } : i
        )
      }
      return [...prev, item]
    })
  }

  function removeItem(index) {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  function clearCart() {
    setItems([])
  }

  const subtotal = useMemo(
    () => items.reduce((sum, i) => sum + i.price * i.qty, 0),
    [items]
  )

  const count = useMemo(() => items.reduce((sum, i) => sum + i.qty, 0), [items])

  return (
    <CartContext.Provider
      value={{ items, addItem, removeItem, clearCart, subtotal, count, cep, setCep }}
    >
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart precisa estar dentro de CartProvider')
  return ctx
}
