import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { brand, themeCss } from './src/brand.js'

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

// Coloca a marca do cliente no index.html: título, descrição, favicon, fontes e cores.
function brandHtml() {
  return {
    name: 'brand-html',
    transformIndexHtml(html) {
      const fonts = brand.theme.fonts.googleFontsUrl
      const head = [
        `<title>${esc(brand.name)}</title>`,
        brand.tagline && `<meta name="description" content="${esc(brand.tagline)}" />`,
        `<link rel="icon" href="${esc(brand.favicon)}" />`,
        `<meta name="theme-color" content="${esc(brand.theme.colors.bg)}" />`,
        fonts && '<link rel="preconnect" href="https://fonts.googleapis.com" />',
        fonts && '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />',
        fonts && `<link rel="stylesheet" href="${esc(fonts)}" />`,
        `<style id="brand-theme">${themeCss()}</style>`,
      ]
        .filter(Boolean)
        .join('\n    ')
      return html.replace('<!-- brand -->', head)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), brandHtml()],
  // public/ comum + public/ do cliente, montada por scripts/select-client.mjs
  publicDir: '.generated/public',
})
