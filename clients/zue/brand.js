// Zue Handmade (Giuliana): bolsas de crochê feitas à mão.
// RASCUNHO do visual, tirado do Instagram da loja. O logo em public/ é
// PROVISÓRIO (fonte parecida com a do logo dela): trocar pelo arquivo oficial.
// Falta confirmar: WhatsApp, Instagram, e-mail, texto do Sobre e prazo de produção.
export default {
  slug: 'zue',
  name: 'Zue Handmade',
  tagline: 'Bolsas de crochê feitas à mão, peça por peça.',
  siteUrl: '',
  storagePrefix: 'zue',

  logo: '/logo.png',
  logoEmail: '/logo.png',
  logoEmailSize: [120, 105],
  favicon: '/favicon.png',

  contact: {
    instagram: '', // TODO: usuário do Instagram, sem @
    whatsapp: '', // TODO: com DDD, só números
    email: '',
  },

  about: [
    'Cada bolsa da Zue é feita à mão, ponto por ponto, com fios selecionados e acabamento caprichado.',
    'Também fazemos peças personalizadas: é só chamar no WhatsApp e contar o que você imaginou.',
  ],

  footerLinks: [],

  theme: {
    colors: {
      bg: '#f7f1e8', // creme claro
      surface: '#efe4d3',
      surface2: '#e6d7bf',
      border: '#ddccb0',
      text: '#2e241c',
      textMuted: '#7c6b5a',
      accent: '#b08a4e', // dourado
      primary: '#7a5235', // marrom do logo
      onPrimary: '#f7f1e8',
      danger: '#b3412f',
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
    from: '',
    signature: 'Giuliana · Zue Handmade',
    headerBg: '#efe4d3',
    pageBg: '#f7f1e8',
    buttonBg: '#7a5235',
    buttonText: '#f7f1e8',
    displayFont: "Georgia, 'Times New Roman', serif",
    headlineTransform: 'none',
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
    shipping: 'fixed',
    paymentMode: 'whatsapp',
    shippingMode: 'whatsapp',
    customOrder: true,
  },
}
