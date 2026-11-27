# Cliente novo: passo a passo

Regra de ouro: **um cliente novo nunca muda o core** (`src/`, `netlify/`, `supabase/`).
Tudo que é do cliente fica em `clients/<cliente>/`. Se algo do cliente não cabe
na configuração, a mudança vira um recurso novo do core (com padrão desligado),
pra servir pra todos.

## 1. Juntar as informações

Use o guia que vai pro cliente (lista de informações e contas). O mínimo:

- Nome da loja, frase curta (tagline) e texto do "Sobre"
- Logo (PNG sem fundo ou SVG) e favicon
- Cores (fundo, texto, destaque) e fontes, ou referências pra propor
- Instagram, WhatsApp e e-mail da loja
- Prazo de produção padrão
- Contas no nome do cliente: Supabase e Netlify (Mercado Pago e Melhor Envio podem vir depois)

## 2. Criar a pasta do cliente

```bash
cp -r clients/modelo clients/<cliente>
```

`<cliente>` é um nome curto, minúsculo, sem espaço (ex: `zue`).

Dentro de `clients/<cliente>/`:

| Arquivo | O que é |
| --- | --- |
| `brand.js` | nome, textos, contatos, cores, fontes, e-mail e módulos ligados |
| `public/` | logo, favicon e imagens da marca. Vai pra raiz do site (`public/logo.svg` vira `/logo.svg`) |

Preencha o `brand.js`. Tudo que ficar de fora usa o padrão de `src/brand.js`,
que também explica cada campo. Pontos de atenção:

- `storagePrefix`: nome curto e único. Não mude depois que a loja estiver no ar (zera os carrinhos salvos).
- `logoEmail`: e-mail não mostra SVG, então use um PNG. Ajuste `logoEmailSize` pra proporção do logo.
- `theme.colors`: `bg` é o fundo, `text` o texto, `accent` o destaque. `primary`/`onPrimary` são opcionais.
- `theme.fonts.googleFontsUrl`: um link do Google Fonts com todas as fontes usadas.
- `email.*`: o e-mail não lê o CSS do site, então as cores dele ficam aqui.
- `copy.*`: frases de marca dos e-mails e do WhatsApp.
- `contact.whatsapp`: obrigatório no modo WhatsApp (é pra onde vai o carrinho e o "Quero personalizado").
- `features`: deixe tudo desligado, a não ser que o cliente tenha pedido. `paymentMode` e `shippingMode` são só o modo inicial: a cliente troca no admin.

## 3. Testar no computador

```bash
CLIENT=<cliente> npm run dev
```

Confira: topo, rodapé, Sobre, página de produto, carrinho, login do admin e o
preview dos e-mails (Admin > Pedidos > E-mail).

## 4. Banco (Supabase do cliente)

1. No Supabase do cliente, abrir o SQL Editor.
2. Colar o arquivo `supabase/instalar.sql` inteiro e clicar em Run. Ele cria tudo de uma vez e só roda em projeto vazio.
3. Criar o usuário do admin em Authentication > Users.
4. Copiar a URL do projeto e as chaves (anon e service_role).

## 5. Site (Netlify do cliente)

1. Na conta Netlify do cliente: Add new site > Import from GitHub > `loja-core`.
2. Em Site configuration > Environment variables:

| Variável | Valor |
| --- | --- |
| `CLIENT` | `<cliente>` |
| `VITE_SUPABASE_URL` | URL do Supabase do cliente |
| `VITE_SUPABASE_ANON_KEY` | chave anon |
| `SUPABASE_SERVICE_ROLE_KEY` | chave service_role (só servidor) |
| `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO` | opcional, e-mails automáticos |

3. Deploy. Toda melhoria no core chega nesse site no próximo deploy.

O Mercado Pago não vai na Netlify: a própria cliente cola o Access Token em
Admin > Pagamento e frete. A chave é testada e fica guardada só no servidor
(tabela `store_secrets`, sem acesso público). Precisa do SQL
`supabase/add_modos_pagamento_frete.sql` (já incluído no `instalar.sql`).

## 6. Entregar

- Mandar o link e o acesso do admin pro cliente.
- Anotar na memória do projeto: cliente, slug, site, conta Netlify e Supabase.

## Módulos disponíveis (`features`)

| Módulo | O que liga | Precisa |
| --- | --- | --- |
| `secretSanta: true` | páginas /amigo, admin e rotina de e-mails do amigo secreto | SQLs do amigo secreto |
| `partnerRefs: ['nome']` | links ?ref=nome e repasse de parceiros por cupom | SQLs `add_ref_crew` e `add_custos_e_crew` |
| `shipping: 'gubo'` | frete pela API da Gubo e tela Admin > Frete | `GUBO_API_KEY` na Netlify |
| `shipping: 'fixed'` | frete fixo (padrão) | nada |
| `shipping: 'melhorenvio'` | frete pelo Melhor Envio, com peso e medidas no cadastro do produto; token e CEP de origem colados em Admin > Pagamento e frete | conta no Melhor Envio |
| `productionDays` / `defaultPackage` | dias de produção somados ao prazo do frete e medida padrão quando o produto não tem medidas | nada |
| `cancelReasons: [...]` | motivos extras de cancelamento | nada |
| `customOrder: true` | botão "Quero personalizado" no produto, abre o WhatsApp | `contact.whatsapp` |
| `paymentMode` | modo inicial de pagamento: `'whatsapp'` ou `'mercadopago'` | Mercado Pago conectado no admin |
| `shippingMode` | modo inicial de frete: `'whatsapp'` ou `'auto'` | nada |
