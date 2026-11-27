// Cliente modelo: loja em branco, com os padrões do core.
// Pra um cliente novo, copie esta pasta (clients/modelo -> clients/<cliente>)
// e preencha. Tudo que não estiver aqui usa o padrão de src/brand.js.
export default {
  slug: 'modelo',
  name: 'Loja Modelo',
  tagline: 'Peças feitas à mão, sob encomenda.',
  siteUrl: '',
  storagePrefix: 'modelo',

  logo: '/logo.svg',
  logoEmail: '/logo-email.png',
  logoEmailSize: [200, 50],
  favicon: '/favicon.svg',

  contact: {
    instagram: '',
    whatsapp: '',
    email: '',
  },

  about: [
    'Escreva aqui a história da loja: quem faz, como faz e o que torna as peças especiais.',
  ],

  footerLinks: [],

  theme: {
    colors: {
      bg: '#ffffff',
      surface: '#f6f5f2',
      surface2: '#eeece7',
      border: '#dedbd3',
      text: '#1d1c1a',
      textMuted: '#6f6c64',
      accent: '#8a6d3b',
      danger: '#c93a39',
    },
    fonts: {
      display: "'Inter', sans-serif",
      body: "'Inter', sans-serif",
      googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
    },
    headingTransform: 'none',
    radius: '6px',
  },

  email: {
    from: '',
    signature: '',
  },

  copy: {
    emoji: '',
    couponExample: 'BEMVINDA10',
  },

  features: {
    secretSanta: false,
    partnerRefs: [],
    shipping: 'fixed',
    paymentMode: 'whatsapp',
    shippingMode: 'whatsapp',
  },
}
