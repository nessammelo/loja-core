# loja-core: regras pro Claude

- Este repo é um core white label. Marca (nome, cor, logo, contato, texto de marca) NUNCA vai em `src/`, `netlify/` ou `supabase/`. Vai em `clients/<cliente>/brand.js` e `clients/<cliente>/public/`, lida por `src/brand.js`.
- Cliente novo: seguir `docs/NOVO-CLIENTE.md` e só criar/editar `clients/<cliente>/`. Se o cliente precisar de algo que a configuração não cobre, criar um campo novo em `src/brand.js` (com padrão que não muda os outros clientes) ou um módulo em `features` (desligado por padrão).
- Arquivos importados pelas Netlify Functions (`src/brand.js`, `src/lib/orderEmail.js`, `src/lib/amigoEmail.js`, `src/lib/crewRef.js`) usam imports com `.js` e não podem depender de `import.meta.env` nem do navegador.
- Cores no CSS só por variáveis (`--bg`, `--text`, `--accent`, `--primary`...). Nada de hex/rgba de marca em `src/index.css`.
- Testar com mais de um cliente: `CLIENT=edge npm run build` e `CLIENT=modelo npm run build`.
- Textos e comentários em português (pt-BR).
