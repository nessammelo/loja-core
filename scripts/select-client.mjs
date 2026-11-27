// Escolhe qual cliente o build vai usar.
//
// Lê a variável CLIENT (na Netlify: Site configuration > Environment variables).
// Sem ela, usa o cliente "modelo" (loja em branco, boa pra testar o core).
//
// O que faz:
//   1. Confere se clients/<CLIENT>/brand.js existe.
//   2. Escreve src/brand.generated.js apontando pra esse brand.js. O site e as
//      Netlify Functions importam a marca por src/brand.js, que lê esse arquivo.
//   3. Junta public/ (arquivos comuns a todos) com clients/<CLIENT>/public/
//      (logo, favicon, imagens da marca) em .generated/public, que é a pasta
//      pública do Vite.
//
// Roda sozinho antes de "npm run dev" e "npm run build".
// Uso manual: CLIENT=zue node scripts/select-client.mjs

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const client = (process.env.CLIENT || 'modelo').trim()

if (!/^[a-z0-9-]+$/.test(client)) {
  console.error(`CLIENT inválido: "${client}". Use só letras minúsculas, números e hífen.`)
  process.exit(1)
}

const clientDir = join(root, 'clients', client)
if (!existsSync(join(clientDir, 'brand.js'))) {
  console.error(`Cliente "${client}" não encontrado: falta clients/${client}/brand.js`)
  process.exit(1)
}

writeFileSync(
  join(root, 'src', 'brand.generated.js'),
  `// Gerado por scripts/select-client.mjs. Não editar, não versionar.\nexport { default } from '../clients/${client}/brand.js'\n`
)

const out = join(root, '.generated', 'public')
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
if (existsSync(join(root, 'public'))) cpSync(join(root, 'public'), out, { recursive: true })
if (existsSync(join(clientDir, 'public'))) cpSync(join(clientDir, 'public'), out, { recursive: true })

console.log(`Cliente selecionado: ${client}`)
