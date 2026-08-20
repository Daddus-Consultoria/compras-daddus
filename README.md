# Compras Daddus

Sistema de gestao de compras da Daddus. Este e um repositorio independente do site institucional e deve ser conectado como um projeto separado nas plataformas de deploy.

## Desenvolvimento local

```bash
npm install
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000).

## Validacao

```bash
npm run lint
npm run build
```

## Deploy separado

O repositorio deste projeto deve ser publicado separadamente do repositorio `site-daddus`.

### Vercel

1. Crie um novo projeto na Vercel.
2. Importe o repositorio `compras-daddus`.
3. Mantenha a raiz do projeto como `/`.
4. Adicione o dominio `compras.daddusconsultoria.com` em **Settings > Domains**.
5. Configure no DNS o registro indicado pela Vercel.

O arquivo `vercel.json` fixa os comandos de instalacao e build do projeto.

### Railway

1. Crie um novo projeto no Railway.
2. Adicione um servico conectado ao repositorio `compras-daddus`.
3. Nao use o repositorio do site institucional nesse servico.
4. Configure as variaveis de ambiente do banco e da autenticacao quando esses modulos forem implementados.
5. Use o dominio gerado pelo Railway ou adicione `compras.daddusconsultoria.com` em **Settings > Networking > Custom Domain**.

O arquivo `railway.toml` define o build, o comando de inicializacao e o health check.

## GitHub: repositorio correto

O projeto Compras deve ter um repositorio proprio, separado de `Daddus-Consultoria/site-daddus`.

1. No GitHub, clique em **New repository**.
2. Use o nome `compras-daddus` e escolha a organizacao `Daddus-Consultoria`.
3. Nao marque a opcao de criar README, `.gitignore` ou licenca, pois este projeto ja possui esses arquivos.
4. No terminal, dentro desta pasta, conecte o repositorio e envie a branch principal:

```bash
cd /workspaces/compras-daddus
git remote add origin git@github.com:Daddus-Consultoria/compras-daddus.git
git add .
git commit -m "feat: cria modulo de compras municipal"
git branch -M main
git push -u origin main
```

Se preferir HTTPS, troque o remote por:

```bash
git remote add origin https://github.com/Daddus-Consultoria/compras-daddus.git
```

Na Vercel e no Railway, importe `Daddus-Consultoria/compras-daddus`. Nao importe `site-daddus` e nao configure Root Directory apontando para uma subpasta: a raiz do projeto ja e a raiz deste repositorio.

## Arquitetura planejada

- Frontend e rotas: Next.js com App Router
- Persistencia: PostgreSQL
- Autenticacao: Auth.js
- Deploy web: Vercel ou Railway, sempre como projeto independente
This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
