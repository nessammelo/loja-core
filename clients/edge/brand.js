// EDGE BJJ: a loja original. Serve de referência de um cliente completo
// (tema escuro, amigo secreto, links da crew e frete pela Gubo).
export default {
  slug: 'edge',
  name: 'EDGE',
  tagline: 'Camisetas minimalistas com essência do Jiu-Jitsu.',
  siteUrl: 'https://edgebjj.com.br',
  storagePrefix: 'edge', // mantém o carrinho de quem já tinha itens salvos

  logo: '/assets/logo-edge.png',
  favicon: '/assets/favicon.png',

  contact: {
    instagram: 'edge.bjj',
    whatsapp: '',
    email: '',
  },

  about: [
    'EDGE nasceu da essência do jiu-jitsu: atitude, técnica e alma no detalhe. Camisetas minimalistas pra quem vive o tatame.',
  ],

  footerLinks: [
    { label: 'Trocas e devoluções', href: '#' },
    { label: 'Política de privacidade', href: '#' },
    { label: 'Termos de uso', href: '#' },
  ],

  theme: {
    colors: {
      bg: '#0a0a0a',
      surface: '#141412',
      surface2: '#1c1c19',
      border: '#2a2a26',
      text: '#f5f3ee',
      textMuted: '#8f8d84',
      accent: '#cbb489',
      danger: '#e24b4a',
    },
    fonts: {
      display: "'Bebas Neue', sans-serif",
      body: "'Inter', sans-serif",
      googleFontsUrl:
        'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&display=swap',
    },
    headingTransform: 'uppercase',
    headingLetterSpacing: '0.02em',
    radius: '4px',
  },

  email: {
    from: 'EDGE <pedidos@edgebjj.com.br>',
    signature: 'Equipe EDGE',
    headerBg: '#000000',
    pageBg: '#f5f3ee',
    buttonBg: '#0a0a0a',
    buttonText: '#f5f3ee',
    displayFont: "Impact, 'Arial Narrow Bold', 'Arial Black', Arial, sans-serif",
    headlineTransform: 'uppercase',
  },

  copy: {
    emoji: '🖤',
    couponExample: 'EDGE10',
    defaultProductionTime: '10 a 15 dias úteis',
    orderThanks: 'Obrigado por vestir a EDGE.',
    productionNote: 'Cada peça é produzida sob demanda, por isso existe um prazo de produção antes do envio.',
    inProduction:
      'Seu pedido entrou em produção. Cada peça é feita sob demanda, com cuidado, e não há pressa que compense a técnica.',
    deliveredWish: 'Esperamos que a peça acompanhe você em cada treino.',
    deliveredShare: 'E se curtiu, marca a gente nas fotos: queremos ver a EDGE no tatame.',
    statusInProgress: 'Repassado pra Gubo',
    markInProgress: 'Marcar repassado',
  },

  features: {
    secretSanta: true,
    partnerRefs: ['pablo', 'luhan', 'monstrinha'],
    shipping: 'gubo',
    paymentMode: 'mercadopago',
    shippingMode: 'auto',
    cancelReasons: ['Peça indisponível na Gubo'],
  },
}
