import { Link } from 'react-router-dom'

export default function OrderConfirmation() {
  return (
    <div className="container empty-state">
      <h1>Pedido recebido</h1>
      <div
        className="rule"
        style={{ margin: '16px auto 20px' }}
      />
      <p style={{ marginBottom: 24 }}>
        Assim que confirmarmos o pagamento, seu pedido segue pra produção. Se o pagamento não for concluído em 24h, o pedido expira.
      </p>
      <Link to="/" className="btn btn-primary">
        Voltar pra loja
      </Link>
    </div>
  )
}
