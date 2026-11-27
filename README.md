# loja-core

Core white label da loja (React + Vite, Supabase, Netlify, Mercado Pago).
Nasceu da loja da EDGE BJJ e serve vários clientes com o mesmo código.

## Como funciona

- `src/`, `netlify/`, `supabase/`: o **core**. Nenhuma marca escrita aqui.
- `clients/<cliente>/`: tudo que muda de um cliente pro outro.
  - `brand.js`: nome, textos, contatos, cores, fontes, e-mails e módulos ligados.
  - `public/`: logo, favicon e imagens da marca.
- `src/brand.js`: lê o cliente escolhido e completa com os padrões. É por ele que o core enxerga a marca.
- A variável `CLIENT` escolhe o cliente (na Netlify de cada cliente). Sem ela, usa `modelo`.

Clientes de exemplo:

- `clients/modelo`: loja em branco, ponto de partida pra um cliente novo.
- `clients/edge`: a loja da EDGE, com todos os módulos ligados.

## Rodar

```bash
npm install
CLIENT=modelo npm run dev
```

Crie um `.env.local` com `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.

## Cliente novo

Ver [docs/NOVO-CLIENTE.md](docs/NOVO-CLIENTE.md).
