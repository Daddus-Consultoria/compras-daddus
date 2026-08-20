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

## Arquitetura

- Frontend e rotas: Next.js com App Router
- Persistencia: PostgreSQL, acessado pelo driver `pg` (sem ORM)
- Autenticacao: ainda nao implementada
- Deploy web: Vercel ou Railway, sempre como projeto independente

O navegador nunca fala com o banco. As telas chamam as rotas em `src/app/api/*`,
que rodam no servidor e sao as unicas donas da `DATABASE_URL`.

## Banco de dados

Configure a variavel privada, tanto no `.env.local` quanto no painel do provedor
de deploy. Qualquer Postgres serve (Neon, Supabase, Railway); use a string de
conexao com pooling quando o provedor oferecer.

```env
DATABASE_URL=postgres://usuario:senha@host:5432/banco?sslmode=require
```

Aplicar a estrutura e, se quiser, os dados de demonstracao:

```bash
npm run db:migrar   # aplica db/migrations/*.sql, uma vez cada
npm run db:semear   # secretarias, config do municipio e 3 processos de exemplo
npm run db:resetar  # apaga tudo e recria (nao use em producao)
```

Para desenvolver sem depender de um banco na nuvem:

```bash
docker run -d --name pg-compras -e POSTGRES_PASSWORD=compras -e POSTGRES_USER=compras \
  -e POSTGRES_DB=compras -p 5433:5432 postgres:16-alpine
```

Sem `DATABASE_URL` o app ainda sobe, porem guarda os dados apenas na memoria do
processo e mostra o aviso "Dados em memoria" na barra lateral. Isso serve para
demonstracao, nao para uso real: os dados somem a cada reinicio.

### Estrutura

| Tabela | Para que serve |
| --- | --- |
| `secretarias` | Secretarias do municipio; a `chave` identifica a coluna de quantidade |
| `config_prefeitura` | Linha unica com os dados institucionais e a logo (guardada como bytes) |
| `processos_compra` | Processo licitatorio, com numero, objeto, prazo e status |
| `itens_lote` | Itens de cada processo |
| `item_quantidades` | Quantidade por item e por secretaria, uma linha cada |
| `cotacoes` | Cotacoes do item, com `fonte` (BNC, PNCP, Mercado) e valor |
| `solicitacoes` | Pedidos abertos pelas secretarias |
| `tarefas_processo` | Tarefas internas ligadas a um processo |

A logo e servida por `GET /api/config-prefeitura/logo`, com um sufixo de versao
na URL para invalidar o cache do navegador quando ela e trocada.
