// Marca da loja: tudo que muda de um cliente pro outro.
//
// O core NUNCA escreve nome, cor, logo, contato ou texto de marca direto no
// código. Ele lê daqui. Cada cliente tem seu arquivo em clients/<cliente>/brand.js
// e só precisa preencher o que for diferente dos padrões abaixo.
//
// Usado no navegador, no vite.config.js e nas Netlify Functions.
import clientBrand from './brand.generated.js'

const DEFAULTS = {
  // identificador curto, igual ao nome da pasta em clients/
  slug: 'modelo',
  // nome que aparece no site, nos e-mails e no WhatsApp
  name: 'Minha Loja',
  // frase curta do rodapé e da descrição do site
  tagline: '',
  // endereço do site no ar (sem barra no final). Na Netlify, a variável URL tem prioridade.
  siteUrl: '',
  // prefixo das chaves salvas no navegador (carrinho, CEP...). Não mudar depois que a loja estiver no ar.
  storagePrefix: 'loja',

  // arquivos em clients/<cliente>/public/
  logo: '/logo.png', // logo do topo e do rodapé
  logoEmail: null, // logo dos e-mails (PNG). Vazio = usa o logo
  logoEmailSize: [125, 75], // largura e altura do logo no e-mail
  favicon: '/favicon.png',

  contact: {
    instagram: '', // só o usuário, sem @
    whatsapp: '', // com DDD, só números (ex: 11999998888)
    email: '',
  },

  // parágrafos da página Sobre
  about: [],

  footerLinks: [
    // { label: 'Trocas e devoluções', href: '/trocas' },
  ],

  theme: {
    colors: {
      bg: '#ffffff',
      surface: '#f6f5f2',
      surface2: '#eeece7',
      border: '#dedbd3',
      text: '#1d1c1a',
      textMuted: '#6f6c64',
      accent: '#8a6d3b', // destaques e hover dos botões
      primary: null, // fundo do botão principal (vazio = cor do texto)
      onPrimary: null, // texto do botão principal (vazio = cor do fundo)
      danger: '#c93a39',
    },
    fonts: {
      display: "'Inter', sans-serif", // títulos
      body: "'Inter', sans-serif", // texto
      // link do Google Fonts com todas as fontes usadas (vazio = nenhuma)
      googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
    },
    headingTransform: 'none', // 'uppercase' deixa os títulos em caixa alta
    headingLetterSpacing: '0',
    radius: '4px', // arredondamento de botões e campos
  },

  // cores e fontes dos e-mails (e-mail não lê CSS do site)
  email: {
    from: '', // "Nome <pedidos@dominio.com.br>". Na Netlify, EMAIL_FROM tem prioridade.
    signature: '', // assinatura no fim do e-mail. Vazio = "Equipe <nome>"
    headerBg: '#ffffff',
    pageBg: '#f6f5f2',
    buttonBg: '#1d1c1a',
    buttonText: '#ffffff',
    displayFont: 'Georgia, serif',
    headlineTransform: 'none',
  },

  // textos de marca usados em e-mails, WhatsApp e no site
  copy: {
    emoji: '', // vai no fim das mensagens de WhatsApp (ex: '🖤')
    couponExample: 'BEMVINDA10', // exemplo no campo de cupom
    defaultProductionTime: '10 a 15 dias úteis',
    // e-mail "Recebemos seu pedido"
    orderThanks: 'Obrigado pela compra.',
    productionNote: 'Cada peça é produzida sob demanda, por isso existe um prazo de produção antes do envio.',
    // e-mail "Em produção"
    inProduction: 'Seu pedido entrou em produção. Cada peça é feita com cuidado.',
    // e-mail e WhatsApp "Entregue"
    deliveredWish: 'Esperamos que você goste muito.',
    deliveredShare: 'E se curtiu, marca a gente nas fotos.',
    // botão "Quero personalizado" na página do produto (features.customOrder). {produto} vira o nome da peça.
    customOrderLabel: 'Quero personalizado',
    customOrderMessage: 'Oi! Vi a peça {produto} no site e queria uma personalizada.',
    // nome do status entre "Novo" e "Enviado"
    statusInProgress: 'Em produção',
    markInProgress: 'Marcar em produção',
  },

  // módulos que cada cliente liga ou desliga
  features: {
    // Amigo secreto (páginas /amigo e admin). Só faz sentido com o SQL do amigo secreto rodado.
    secretSanta: false,
    // Links de parceiros (?ref=nome) e repasse por cupom. Lista vazia = desligado.
    partnerRefs: [],
    // Como o frete é calculado quando está no automático: 'fixed' (valor fixo), 'gubo' (API da Gubo)
    // ou 'melhorenvio' (Melhor Envio, chaves coladas no admin)
    shipping: 'fixed',
    // Modo inicial de pagamento e frete. A cliente troca em Admin > Pagamento e frete.
    //   paymentMode: 'whatsapp' (carrinho fecha no WhatsApp) | 'mercadopago' (checkout com Pix e cartão)
    //   shippingMode: 'whatsapp' (frete combinado na conversa) | 'auto' (calculado pelo CEP)
    paymentMode: 'whatsapp',
    shippingMode: 'whatsapp',
    // Frete 'melhorenvio': dias de produção somados ao prazo da transportadora
    // e medida usada quando o produto não tem peso/medidas cadastrados.
    productionDays: 0,
    defaultPackage: { weightG: 500, lengthCm: 25, widthCm: 20, heightCm: 10 },
    // Botão "Quero personalizado" na página do produto (abre o WhatsApp da loja)
    customOrder: false,
    // Motivos de cancelamento extras no admin
    cancelReasons: [],
  },
}

function isObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v)
}

function merge(base, over) {
  if (!isObject(over)) return base
  const out = { ...base }
  for (const [k, v] of Object.entries(over)) {
    out[k] = isObject(v) && isObject(base[k]) ? merge(base[k], v) : v
  }
  return out
}

export const brand = merge(DEFAULTS, clientBrand)

// atalhos usados em vários lugares
export const instagramUrl = brand.contact.instagram ? `https://instagram.com/${brand.contact.instagram}` : ''
export const instagramHandle = brand.contact.instagram ? `@${brand.contact.instagram}` : ''
export const emailSignature = brand.email.signature || `Equipe ${brand.name}`
export const storageKey = (name) => `${brand.storagePrefix}_${name}`
export const hasPartnerRefs = brand.features.partnerRefs.length > 0

// URL do site: variável URL da Netlify (functions) > siteUrl do cliente > endereço atual
export function siteUrl() {
  const env = globalThis.process?.env?.URL
  const win = typeof window !== 'undefined' ? window.location.origin : ''
  return (env || brand.siteUrl || win || '').replace(/\/$/, '')
}

export function emailLogoUrl(origin = siteUrl()) {
  return `${origin}${brand.logoEmail || brand.logo}`
}

export function whatsappStoreUrl(text = '') {
  const d = (brand.contact.whatsapp || '').replace(/\D/g, '')
  if (!d) return ''
  const phone = d.startsWith('55') ? d : `55${d}`
  return `https://wa.me/${phone}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}

// CSS do tema, injetado no <head> pelo vite.config.js (sem piscar a cor errada)
export function themeCss() {
  const c = brand.theme.colors
  const f = brand.theme.fonts
  const vars = {
    '--bg': c.bg,
    '--surface': c.surface,
    '--surface-2': c.surface2,
    '--border': c.border,
    '--text': c.text,
    '--text-muted': c.textMuted,
    '--accent': c.accent,
    '--primary': c.primary || c.text,
    '--on-primary': c.onPrimary || c.bg,
    '--danger': c.danger,
    '--font-display': f.display,
    '--font-body': f.body,
    '--heading-transform': brand.theme.headingTransform,
    '--heading-letter-spacing': brand.theme.headingLetterSpacing,
    '--radius': brand.theme.radius,
  }
  // html:root ganha do :root do index.css, que carrega depois
  return `html:root{${Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(';')}}`
}

export default brand
