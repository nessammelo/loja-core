// Zue Handmade (Giuliana): bolsas de crochê feitas à mão.
// Logo oficial em public/ (preto, marrom e claro, todos do mesmo arquivo).
//
// Duas propostas de visual foram pra Giuliana escolher. Pra trocar, mude ESCOLHA:
//   'creme' = fundo creme, títulos em serifa marrom, rodapé creme
//   'claro' = fundo branco, títulos em caixa alta condensada preta, rodapé preto
// Falta confirmar: e-mail, texto do Sobre e prazo de produção.
const ESCOLHA = 'creme'

const VARIANTES = {
  creme: {
    logo: '/logo-marrom.png',
    logoFooter: '/logo-marrom.png',
    theme: {
      colors: {
        bg: '#f7f1e8',
        surface: '#efe4d3',
        surface2: '#e6d7bf',
        border: '#ddccb0',
        text: '#2e241c',
        textMuted: '#7c6b5a',
        accent: '#b08a4e',
        primary: '#7a5235',
        onPrimary: '#f7f1e8',
        danger: '#b3412f',
        footerBg: '#efe4d3',
        footerText: '#6b4a2f',
      },
      fonts: {
        display: "'Cormorant Garamond', Georgia, serif",
        body: "'Montserrat', sans-serif",
        googleFontsUrl:
          'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=Montserrat:wght@400;500;600&display=swap',
      },
      headingTransform: 'none',
      headingLetterSpacing: '0.01em',
      radius: '2px',
    },
    email: {
      headerBg: '#efe4d3',
      pageBg: '#f7f1e8',
      buttonBg: '#7a5235',
      buttonText: '#f7f1e8',
      displayFont: "Georgia, 'Times New Roman', serif",
      headlineTransform: 'none',
    },
  },
  claro: {
    logo: '/logo-preto.png',
    logoFooter: '/logo-claro.png',
    theme: {
      colors: {
        bg: '#ffffff',
        surface: '#f5f1ea',
        surface2: '#ebe5da',
        border: '#e2dbcf',
        text: '#111111',
        textMuted: '#6b665e',
        accent: '#b08a4e',
        primary: '#111111',
        onPrimary: '#ffffff',
        danger: '#b3412f',
        footerBg: '#111111',
        footerText: '#f7f1e8',
      },
      fonts: {
        display: "'Bebas Neue', 'Arial Narrow', sans-serif",
        body: "'Inter', sans-serif",
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600&display=swap',
      },
      headingTransform: 'uppercase',
      headingLetterSpacing: '0.02em',
      radius: '2px',
    },
    email: {
      headerBg: '#ffffff',
      pageBg: '#f5f1ea',
      buttonBg: '#111111',
      buttonText: '#ffffff',
      displayFont: "Impact, 'Arial Narrow Bold', Arial, sans-serif",
      headlineTransform: 'uppercase',
    },
  },
}

const V = VARIANTES[ESCOLHA]

export default {
  slug: 'zue',
  name: 'Zue Handmade',
  tagline: 'Bolsas de crochê feitas à mão, peça por peça.',
  siteUrl: '',
  storagePrefix: 'zue',

  logo: V.logo,
  logoFooter: V.logoFooter,
  logoEmail: V.logo,
  logoEmailSize: [180, 74],
  favicon: '/favicon.png',

  contact: {
    instagram: 'zueatelie',
    whatsapp: '11974017787',
    email: '',
  },

  about: [
    'Cada bolsa da Zue é feita à mão, ponto por ponto, com fios selecionados e acabamento caprichado.',
    'Também fazemos peças personalizadas: é só chamar no WhatsApp e contar o que você imaginou.',
  ],

  footerLinks: [],
  footerFollowLabel: 'Acompanhe a Zue',

  home: {
    // seção de coleções em cards na home (como nas propostas)
    collectionCards: true,
    collectionsTitle: 'Coleções',
  },

  theme: V.theme,

  email: {
    from: '',
    signature: 'Giuliana · Zue Handmade',
    ...V.email,
  },

  copy: {
    emoji: '🤎',
    couponExample: 'ZUE10',
    defaultProductionTime: '7 a 10 dias úteis', // TODO: confirmar com a Giuliana
    orderThanks: 'Obrigada por escolher uma peça Zue.',
    productionNote: 'Cada bolsa é feita à mão depois do pedido, por isso existe um prazo de produção antes do envio.',
    inProduction: 'Sua bolsa já está sendo feita, ponto por ponto.',
    deliveredWish: 'Esperamos que você ame a sua bolsa.',
    deliveredShare: 'Se puder, marca a gente nas fotos: a gente adora ver as peças por aí.',
    statusInProgress: 'Em produção',
    markInProgress: 'Marcar em produção',
    customOrderLabel: 'Quero personalizada',
    customOrderMessage: 'Oi! Vi a {produto} no site e queria uma personalizada.',
  },

  features: {
    secretSanta: false,
    partnerRefs: [],
    shipping: 'melhorenvio', // token e CEP de origem: Admin > Pagamento e frete
    productionDays: 7, // TODO: confirmar com a Giuliana
    paymentMode: 'whatsapp',
    shippingMode: 'whatsapp',
    customOrder: true,
  },
}
