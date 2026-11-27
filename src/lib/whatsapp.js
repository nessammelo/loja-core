import { brand, instagramHandle } from '../brand'

const NAME = brand.name
const EMOJI = brand.copy.emoji ? ` ${brand.copy.emoji}` : ''

function onlyDigits(str) {
  return (str || '').replace(/\D/g, '')
}

// Monta o número no formato que o WhatsApp espera (com código do país).
// Assume Brasil (55) quando o número não vem com código de país.
function formatPhoneForWhatsapp(phone) {
  const digits = onlyDigits(phone)
  if (!digits) return null
  if (digits.startsWith('55')) return digits
  return `55${digits}`
}

export function buildWhatsappLink(order, { origin = '' } = {}) {
  const phone = formatPhoneForWhatsapp(order.customers?.phone)
  if (!phone) return null

  const firstName = (order.customers?.name || '').split(' ')[0]
  const itemsText = order.order_items
    .map((i) => `- ${i.product_name} (${i.model_label}, ${i.size})`)
    .join('\n')

  let message = ''

  if (order.status === 'aguardando pagamento' && order.payment_method === 'whatsapp') {
    const total = Number(order.total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    const combinar = order.shipping_service === 'A combinar no WhatsApp'
    message =
      `Oi ${firstName}! Recebi seu pedido ${NAME} #${order.id.slice(0, 8)}${EMOJI}\n\n` +
      `${itemsText}\n\n` +
      `${combinar ? 'Subtotal' : 'Total'}: ${total}` +
      (combinar ? '\nMe passa seu CEP pra eu calcular o frete?' : '') +
      `\n\nVamos combinar o pagamento?`
  } else if (order.status === 'expirado') {
    const link = origin ? `${origin}/carrinho/recuperar/${order.id}` : ''
    message =
      `Oi ${firstName}! Vi que seu pedido ${NAME} não foi finalizado e o link de pagamento expirou${EMOJI}\n\n` +
      `${itemsText}\n\n` +
      (link ? `Deixei as mesmas peças separadas aqui, é só conferir e pagar com Pix ou cartão:\n${link}` : 'Quer que eu te mande um link novo?')
  } else if (order.status === 'cancelado') {
    message =
      `Oi ${firstName}! Passando pra avisar que seu pedido ${NAME} #${order.id.slice(0, 8)} foi cancelado.\n\n` +
      `${itemsText}\n\n` +
      (order.payment_status === 'approved' || order.payment_status === 'refunded'
        ? 'O valor pago é devolvido pelo Mercado Pago na mesma forma de pagamento. Qualquer dúvida, me chama aqui.'
        : 'Qualquer dúvida, me chama aqui.')
  } else if (order.status === 'entregue') {
    message =
      `Oi ${firstName}! Seu pedido ${NAME} foi entregue${EMOJI}\n\n` +
      `${itemsText}\n\n` +
      `Deu tudo certo com a peça?${instagramHandle ? ` Se curtiu, marca a gente nas fotos: ${instagramHandle}` : ''}`
  } else if (order.status === 'enviado' && order.tracking_code) {
    message =
      `Oi ${firstName}! Seu pedido ${NAME} já foi enviado${EMOJI}\n\n` +
      `${itemsText}\n\n` +
      `Transportadora: ${order.carrier || 'a confirmar'}\n` +
      `Rastreio: ${order.tracking_code}`
  } else if (order.status === 'repassado') {
    message =
      `Oi ${firstName}! Seu pedido ${NAME} já está em produção${EMOJI}\n\n` +
      `${itemsText}\n\n` +
      `Assim que for enviado, te aviso por aqui com o código de rastreio.`
  } else {
    message =
      `Oi ${firstName}! Passando pra confirmar seu pedido ${NAME}:\n\n${itemsText}`
  }

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
}
