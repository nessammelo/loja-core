// CPF: máscara e conferência dos dígitos verificadores.
// O servidor (create_customer_order) confere de novo.

const digitsOf = (v) => String(v ?? '').replace(/\D/g, '')

export function formatCpf(value) {
  const d = digitsOf(value).slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

export function isValidCpf(value) {
  const d = digitsOf(value)
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  const check = (len) => {
    let sum = 0
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i)
    const r = (sum * 10) % 11
    return r === 10 ? 0 : r
  }
  return check(9) === Number(d[9]) && check(10) === Number(d[10])
}

export const cpfDigits = digitsOf
