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
SESSION_SECRET=<32+ bytes aleatorios: openssl rand -hex 32>
```

`SESSION_SECRET` assina o cookie de sessao. Trocar esse valor derruba todas as
sessoes abertas, o que serve como botao de emergencia.

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

## Rotas de API

Todas rodam no servidor; o navegador nunca recebe a `DATABASE_URL`.

| Rota | Metodo | Para que serve |
| --- | --- | --- |
| `/api/status` | GET | Diz se os dados vem do Postgres ou do fallback em memoria |
| `/api/config-prefeitura` | GET, PUT | Dados institucionais do municipio; o PUT aceita `multipart` com a logo |
| `/api/config-prefeitura/logo` | GET | Devolve os bytes da logo guardada |
| `/api/solicitacoes` | GET, POST | Pedidos abertos pelas secretarias |
| `/api/processos` | GET | Processos com seus itens, quantidades e cotacoes |
| `/api/processos/[numero]/lote` | PUT | Grava o lote inteiro numa transacao |

O `PUT` do lote recebe o estado desejado completo (`{ notas, itens }`) e
reconcilia por `numero_item`: itens ausentes sao removidos, os demais sao
inseridos ou atualizados. Assim a tela nao precisa administrar ids de itens
que ainda nao existem no banco. Qualquer item malformado rejeita o lote
inteiro, para nao gravar pela metade.

## Perfis de acesso

Toda pessoa entra com o proprio e-mail e enxerga apenas o fluxo do seu perfil.

| Perfil | Escopo | O que faz |
| --- | --- | --- |
| `superadmin` | Todas as prefeituras | Cria prefeituras e usuarios de qualquer municipio |
| `admin` | Uma prefeitura | Cria e desativa usuarios da propria prefeitura; edita os dados institucionais |
| `compras` | Uma prefeitura | Monta processos, itens e cotacoes; exporta o PDF; consulta os dados institucionais |
| `secretario` | Uma secretaria | Abre solicitacoes e preenche a quantidade apenas da propria secretaria |
| `gestor` | Uma prefeitura | Acompanha processos e solicitacoes em somente leitura |

### Isolamento

Cada prefeitura e um ambiente separado. O isolamento nao depende da interface:

- toda consulta filtra por `prefeitura_id`, inclusive o `UPDATE` que grava o lote,
  entao adivinhar o numero de um processo alheio devolve 404 e nao grava nada;
- o secretario nunca envia o lote inteiro: o servidor remonta a partir do que
  esta gravado e troca so a coluna da secretaria dele, ignorando o resto do que
  a tela mandar;
- desativar alguem tem efeito na requisicao seguinte, porque o usuario e relido
  a cada acesso em vez de ser confiado ao cookie.

### Primeiro acesso

O superadmin (ou o admin) cadastra a pessoa com uma senha inicial e a repassa.
No primeiro login o portal exige a troca antes de liberar qualquer tela. O mesmo
vale quando um administrador redefine a senha de outra pessoa.

Para criar o primeiro superadmin num banco novo, rode `npm run db:semear`: ele
imprime os acessos criados e a senha inicial uma unica vez. Defina `SENHA_SEED`
para escolher a senha; sem isso, uma e sorteada.

Em producao use `SEMEAR_DEMO=false npm run db:semear`, que cria apenas o
superadmin. Sem essa variavel o seed tambem insere uma prefeitura de exemplo
com tres processos, o que serve para desenvolvimento e demonstracao mas nao
para um banco real.

## Secretarias

Cada prefeitura cadastra quantas secretarias precisar, em Configuracao da
prefeitura. Uma prefeitura nova nasce com Educacao, Saude, Assistencia Social e
Administracao apenas para nao comecar vazia.

Cada secretaria vira uma coluna na planilha do lote e pode ter usuarios
proprios. O nome e editavel; a `chave`, nao — e ela que amarra as quantidades
ja lancadas, entao renomear "Meio Ambiente" para "Meio Ambiente e
Sustentabilidade" preserva todo o historico.

Secretarias criadas depois de um lote aparecem nele com quantidade zero, sem
invalidar o que ja estava gravado.

Para tirar uma secretaria de circulacao ha duas saidas:

- **Desativar** tira a secretaria do formulario de solicitacao e trava a coluna
  na planilha, mas preserva o que ja foi lancado. E o caminho normal.
- **Excluir** so funciona se ela nunca foi usada. Havendo quantidade, processo,
  solicitacao ou usuario ligado, a API recusa e diz exatamente o que prende.

## Pesquisa de precos

O modulo de cotacao segue a **IN SEGES/ME 65/2021** e o art. 23 da **Lei
14.133/2021**, que definem como o setor publico forma o preco de referencia.

### Fontes

Cada preco lancado registra de onde veio, quando foi obtido e o documento que o
comprova. As fontes seguem a ordem de preferencia do art. 5 da IN — bases
publicas primeiro, fornecedor por ultimo:

| Fonte | O que e |
| --- | --- |
| Painel de Precos | Painel de Precos do Governo Federal |
| PNCP | Portal Nacional de Contratacoes Publicas |
| Contratacao similar | Contrato de outro ente publico, dos ultimos 12 meses |
| Tabela de referencia | Tabelas oficiais (SINAPI, SICRO, CMED) |
| Sitio eletronico | Sitios especializados ou de dominio amplo |
| Midia especializada | Publicacoes do setor |
| Fornecedor | Pesquisa direta |

### Formacao do preco

O valor de referencia sai da **media**, da **mediana** ou do **menor preco** das
cotacoes consideradas (art. 6). Metodo diferente de media exige justificativa,
que entra no PDF.

O sistema nao exclui preco sozinho. Ele sinaliza:

- **menos de tres cotacoes**, que e a cesta minima recomendada pelo art. 6, par. 4;
- **dispersao acima de 25%** no coeficiente de variacao da cesta;
- **cotacoes que se afastam mais de 25% da mediana**, candidatas a analise.

Desconsiderar um preco exige justificativa escrita, como manda o art. 6, par. 1
(precos excessivamente elevados ou inexequiveis). O preco desconsiderado nao e
apagado: continua no mapa, riscado e com o motivo, porque e isso que sustenta a
decisao no processo administrativo.

## Fases do processo

Cada fase libera um tipo de edicao. E o que evita que secretaria e setor de
compras mexam na mesma coisa ao mesmo tempo.

| Fase | Quem edita o que |
| --- | --- |
| Em elaboracao | Compras monta os itens, especificacao e unidade |
| Coleta de quantidades | Cada secretaria lanca a propria quantidade |
| Em cotacao | Compras lanca as cotacoes; quantidades travadas |
| Enviado para licitacao | Somente leitura |
| Cancelado | Somente leitura |

Somente o Setor de Compras move o processo, e apenas para as fases vizinhas
(`transicoesDeStatus`). Toda mudanca fica registrada em `historico_status`, com
quem moveu, quando e a observacao.

## Mapa de precos em PDF

O botao "Exportar PDF oficial" emite o mapa com a identidade do municipio:
brasao, nome, CNPJ e endereco do Setor de Compras no cabecalho. O documento traz
a composicao do lote com as quantidades por secretaria, o detalhamento de cada
cotacao (fonte, origem, documento, data, valor e situacao) e o bloco de
metodologia com o metodo adotado e a base legal.

Logo em PNG ou JPEG entra no cabecalho. SVG nao — o jsPDF nao rasteriza vetor,
entao nesse caso o documento sai sem brasao em vez de falhar.
