// Descrição do produto: aceita texto puro (quebras de linha preservadas via CSS)
// ou HTML básico. O HTML é filtrado: só tags/atributos da lista abaixo passam.

const ALLOWED_TAGS = new Set([
  'P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'H2', 'H3', 'H4',
  'UL', 'OL', 'LI', 'A', 'BLOCKQUOTE', 'HR', 'SPAN', 'DIV',
])

export function looksLikeHtml(text) {
  return /<\/?[a-z][a-z0-9]*(\s[^>]*)?>/i.test(text || '')
}

export function sanitizeHtml(html) {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')

  function clean(node) {
    Array.from(node.childNodes).forEach((child) => {
      if (child.nodeType === 3) return // texto
      if (child.nodeType !== 1) {
        child.remove()
        return
      }
      if (!ALLOWED_TAGS.has(child.tagName)) {
        // tag não permitida: remove a tag mas mantém o texto de dentro
        // (script/style somem por inteiro)
        if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED'].includes(child.tagName)) {
          child.remove()
          return
        }
        clean(child)
        child.replaceWith(...Array.from(child.childNodes))
        return
      }
      Array.from(child.attributes).forEach((attr) => {
        const keep =
          child.tagName === 'A' && (attr.name === 'href' || attr.name === 'target')
        if (!keep) child.removeAttribute(attr.name)
      })
      if (child.tagName === 'A') {
        const href = child.getAttribute('href') || ''
        if (!/^(https?:|mailto:|\/)/i.test(href)) child.removeAttribute('href')
        child.setAttribute('rel', 'noopener noreferrer')
        child.setAttribute('target', '_blank')
      }
      clean(child)
    })
  }

  clean(doc.body)
  return doc.body.innerHTML
}
