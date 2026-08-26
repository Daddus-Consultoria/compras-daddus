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
| `itens_solicitacao` | Itens do DFD, com quantidade e memoria de calculo |
| `etps` | Estudo tecnico preliminar de cada processo, com o instantaneo da conclusao |
| `tarefas_processo` | Agenda pessoal de cada usuario, com vinculo opcional a um processo |
| `ajustes_quantidade` | Cada correcao de quantidade feita pelo Setor de Compras, com motivo |
| `historico_status` | Toda mudanca de fase do processo, com quem moveu e quando |
| `tramites_cpl` | Recebimento, diligencia e retorno registrados pela comissao |
| `contratos` | Contrato devolvido pela CPL, com vigencia e valor somado dos itens |
| `itens_contrato` | Itens efetivamente contratados, com quantidade e preco unitario |
| `pedidos_fornecimento` | Pedidos das secretarias dentro do contrato, com a decisao do Setor de Compras |
| `itens_pedido` | Quantidade pedida de cada item do contrato |

A logo e servida por `GET /api/config-prefeitura/logo`, com um sufixo de versao
na URL para invalidar o cache do navegador quando ela e trocada.

## Rotas de API

Todas rodam no servidor; o navegador nunca recebe a `DATABASE_URL`.

| Rota | Metodo | Para que serve |
| --- | --- | --- |
| `/api/status` | GET | Diz se os dados vem do Postgres ou do fallback em memoria |
| `/api/config-prefeitura` | GET, PUT | Dados institucionais do municipio; o PUT aceita `multipart` com a logo |
| `/api/config-prefeitura/logo` | GET | Devolve os bytes da logo guardada |
| `/api/solicitacoes` | GET | Fila de demandas, no formato curto usado pela central |
| `/api/dfd` | GET, POST | Demandas formalizadas (DFD), com itens e memoria de calculo |
| `/api/dfd/[numero]` | GET, PATCH | Ficha da demanda; a edicao para quando ela vira processo |
| `/api/dfd/importar` | GET | Fontes e itens de um documento anterior, para nao redigitar |
| `/api/etp/[processo]` | GET, PATCH, POST | Estudo tecnico: ler, gravar incisos, concluir e reabrir |
| `/api/processos` | GET, POST | Processos com seus itens, quantidades e cotacoes; POST abre processo |
| `/api/processos/[numero]/lote` | PUT | Grava o lote inteiro numa transacao |
| `/api/processos/[numero]/status` | PATCH | Move o processo de fase e grava o historico |
| `/api/processos/[numero]/cotacoes` | POST, PATCH, DELETE | Cotacoes de um item do lote |
| `/api/processos/[numero]/cpl` | GET, POST | Tramitacao da comissao; o tramite e que move a fase |
| `/api/contratos` | GET, POST | Contratos da prefeitura; POST cadastra o que voltou da CPL |
| `/api/contratos/[numero]` | GET, PATCH, DELETE | Ficha do contrato e a lista de itens contratados |
| `/api/contratos/[numero]/saldo` | GET | Saldo por item: contratado, autorizado, em analise e o que sobra |
| `/api/pedidos` | GET, POST | Pedidos de fornecimento; o secretario so enxerga os da propria secretaria |
| `/api/pedidos/[id]` | GET, PATCH | Autorizar, recusar, cancelar ou estornar um pedido |
| `/api/agenda` | GET, POST, PATCH, DELETE | Agenda pessoal e a nota de acompanhamento |
| `/api/notificacoes` | GET, POST | Avisos derivados do estado atual e o que ja foi lido |

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
| `compras` | Uma prefeitura | Monta processos, itens e cotacoes; elabora o ETP; cadastra contratos; autoriza pedidos de fornecimento; exporta os PDFs |
| `cpl` | Uma prefeitura | Recebe o mapa de precos, baixa o DFD e o ETP para instruir a licitacao, registra a tramitacao e devolve o processo com o contrato |
| `secretario` | Uma secretaria | Formaliza a demanda (DFD), preenche a quantidade da propria secretaria e pede fornecimento nos contratos |
| `gestor` | Uma prefeitura | Acompanha processos, contratos e saldos em somente leitura |

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

### Consulta automatica ao Painel de Precos

As duas primeiras fontes da tabela sao lidas na origem, sem redigitar. A API de
dados abertos do Compras.gov.br (`dadosabertos.compras.gov.br`) e publica e nao
pede chave, e devolve as compras ja realizadas para um item: preco praticado,
orgao comprador, fornecedor, data e unidade de fornecimento.

Duas restricoes da origem mandam no desenho:

1. **A consulta e por codigo, nunca por texto.** O Painel pesquisa por CATMAT
   (material) ou CATSER (servico). Por isso o item do lote tem a coluna
   **Catalogo**: sem o codigo, nao ha consulta.
2. **A origem nao busca por descricao.** Foi conferido que o parametro
   `descricaoItem` do catalogo devolve zero resultados mesmo para a descricao
   literal de um item. Por isso o catalogo e copiado para o Postgres local por
   `npm run catalogo` e pesquisado aqui, com indice de relevancia em portugues.

```bash
npm run catalogo            # CATMAT (~344 mil itens) e CATSER (~3 mil)
npm run catalogo -- servico # so um dos dois
```

A coleta e idempotente e pode ser repetida. Leva alguns minutos para o CATMAT.
**`npm run db:resetar` e `npm run verificar` apagam o catalogo junto com o resto
do schema** — depois deles, rode a coleta de novo.

O preco importado vira uma cotacao comum, com fonte `painel_precos`, o orgao
comprador na descricao e o id da compra no documento. Nada entra sozinho: cada
linha e importada por um clique, porque a IN 65 pede analise critica dos precos
e uma cesta montada de enfiada dilui quem responde pelo mapa. A tela marca o
preco publicado em **unidade diferente** da do lote — o mesmo copo descartavel
aparece a R$ 0,03 por UN e a R$ 2,95 por PCT, e somar os dois produz um valor de
referencia que nao existe. O sistema nao converte unidade.

CATMAT e CATSER **compartilham a numeracao** — o codigo 1171 e "ENSAIO E
ANALISES QUIMICAS" num catalogo e "CABRESTANTE DE EMBARCACAO" no outro. Por isso
o codigo anda sempre acompanhado do tipo, no banco e na API.

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
| Coleta de quantidades | Cada secretaria lanca a propria quantidade; compras ajusta com justificativa |
| Em cotacao | Compras lanca as cotacoes e pode ajustar quantidade com justificativa |
| Cotacao concluida | Precos levantados e metodo definido; falta gerar o mapa |
| Mapa elaborado | Mapa pronto, aguardando o envio a comissao |
| Mapa enviado a CPL | Somente leitura ate a comissao registrar o recebimento |
| Em processamento na CPL | A CPL conduz a licitacao e registra a tramitacao |
| Devolvido pela CPL | Havendo contratacao, falta cadastrar o contrato; nao havendo, cancelar ou devolver a comissao |
| Contrato ativo | Contrato cadastrado e em vigencia, gerando saldo para as secretarias |
| Encerrado | Contrato executado ou vencido; nao ha mais saldo a consumir |
| Cancelado | Somente leitura |

### Encerrar e cancelar

As duas fases finais dizem coisas opostas sobre a mesma compra — "encerrado" e
"nao ha mais saldo a consumir"; "cancelado" e "nao houve contratacao" — e
nenhuma combina com um contrato ainda ativo aceitando pedido. Por isso a mudanca
e recusada enquanto houver contrato ativo no processo, com a mensagem dizendo
qual e quanto saldo ele ainda tem. Quem decide o destino do saldo e o comprador,
encerrando o contrato antes.

A demanda acompanha o destino do processo que ela originou:

- **processo cancelado** — a necessidade continua existindo, entao o DFD volta
  para a fila, solta o vinculo e fica editavel de novo. E o caminho da licitacao
  fracassada: a secretaria ajusta o que precisa e o Setor de Compras abre outro
  processo a partir da mesma demanda;
- **processo encerrado** — a demanda foi atendida e fica concluida.

O Setor de Compras move o processo, e apenas para as fases vizinhas
(`transicoesDeStatus`). As duas fases da comissao sao excecao: quem as move e a
propria CPL, e nao por um seletor de fase — ver "CPL e contrato" abaixo. Toda
mudanca fica registrada em `historico_status`, com quem moveu, quando e a
observacao.

## Mapa de precos em PDF

O botao "Exportar PDF oficial" emite o mapa com a identidade do municipio:
brasao, nome, CNPJ e endereco do Setor de Compras no cabecalho. O documento traz
a composicao do lote com as quantidades por secretaria, o detalhamento de cada
cotacao (fonte, origem, documento, data, valor e situacao) e o bloco de
metodologia com o metodo adotado e a base legal.

Logo em PNG ou JPEG entra no cabecalho. SVG nao — o jsPDF nao rasteriza vetor,
entao nesse caso o documento sai sem brasao em vez de falhar.

## Ajuste de quantidade pelo Setor de Compras

Um erro de digitacao de uma secretaria nao deveria obrigar a devolver o processo
de fase. Entao o Setor de Compras corrige a quantidade de qualquer secretaria —
mas nunca em silencio.

Da fase de coleta em diante, alterar um numero lancado por outra secretaria
exige justificativa de ao menos 10 caracteres. A tela nao decide isso sozinha: o
servidor compara o que foi enviado com o que esta gravado, responde **422** com
a lista do que mudaria (`item 1/saude: 45 para 999`) e so grava quando o motivo
vem junto. Cancelar o pedido de motivo aborta o salvamento inteiro.

Cada ajuste vira uma linha em `ajustes_quantidade` com o valor anterior, o novo,
quem alterou, quando e por que. O historico aparece ao expandir o item e sai no
PDF, num bloco proprio.

Em **Em elaboracao** nao ha essa exigencia: o lote ainda e rascunho do proprio
Setor de Compras e o numero nao tem dono. A secretaria, por sua vez, nunca
alcanca coluna alheia — nem enviando justificativa.

## CPL e contrato

A comissao de licitacao existe dentro do portal, com mesa propria em
`/painel/cpl`: a fila do que ja saiu do Setor de Compras e ainda nao virou
contrato cadastrado.

A CPL nao escolhe fase numa lista. Ela registra o que aconteceu, e o fato move o
processo:

| Tramite | O que e | Para onde leva o processo |
| --- | --- | --- |
| Recebimento | A comissao confirma que recebeu o mapa e assume o processo | Em processamento na CPL |
| Diligencia | Pedido de esclarecimento ou correcao, sem devolver | Fica onde esta |
| Retorno | A comissao devolve o processo, com o contrato ou sem ele | Devolvido pela CPL |

Diligencia e retorno exigem observacao: sem o motivo escrito, o historico nao
explica por que o processo voltou.

O contrato devolvido vira cadastro proprio. Escolhido o processo de origem, os
itens do lote entram preenchidos com a quantidade consolidada e o preco de
referencia do metodo adotado — corrigir tres numeros e mais rapido que digitar
trinta. Cadastrar o contrato de um processo em "Devolvido pela CPL" leva ele para
"Contrato ativo", na mesma transacao: e o cadastro que atesta o fato.

O valor do contrato nunca e digitado. Ele e a soma dos itens, recalculada no
banco a cada gravacao.

## Execucao do contrato

Contrato ativo gera saldo, e saldo se consome com pedido de fornecimento. A
secretaria pede; o Setor de Compras autoriza. E a autorizacao que baixa o saldo,
do mesmo jeito que na prefeitura e o empenho que compromete a dotacao.

| Situacao do pedido | O que significa | Mexe no saldo? |
| --- | --- | --- |
| Aguardando autorizacao | A secretaria pediu e o Setor de Compras ainda nao decidiu | Nao, mas reserva |
| Autorizado | Fornecimento liberado, com numero de empenho quando houver | Sim, baixa |
| Recusado | Negado, com motivo registrado | Nao |
| Cancelado | Retirado antes da decisao por quem pediu ou por compras | Nao |
| Estornado | Autorizacao desfeita, com motivo; a quantidade volta ao saldo | Sim, devolve |

Recusa e estorno exigem motivo de ao menos 10 caracteres, como o ajuste de
quantidade — sao os dois atos que deixam a secretaria sem o fornecimento.

### O saldo nao e um campo

Nao existe coluna de saldo nem de quantidade utilizada. Cada leitura apura:

- **contratada** — o que esta em `itens_contrato`;
- **autorizada** — a soma dos pedidos autorizados;
- **em analise** — a soma dos pendentes, que ainda nao consumiram nada mas nao
  estao livres para outra secretaria;
- **saldo** — contratada menos autorizada;
- **disponivel** — saldo menos o que esta em analise.

Guardar o saldo faria dele um numero editavel, e um numero editavel diverge dos
pedidos que o formaram. Corrigir saldo, aqui, e estornar o pedido que o consumiu.

### O que o sistema recusa

- pedido acima do **disponivel**, na abertura, com a lista do que faltou
  (`item 1: pedido 60 PCT, disponivel 40`);
- autorizacao acima do **saldo**, conferida de novo na hora de decidir e com o
  contrato travado — entre abrir o pedido e autorizar, o contrato pode ter
  mudado de itens;
- pedido em contrato que nao esteja ativo;
- secretario mexendo em pedido de outra secretaria, que para ele responde 404;
- **reduzir um item do contrato** abaixo do que ja foi autorizado, ou tira-lo da
  lista: a API diz quanto ja foi consumido e manda estornar antes;
- **excluir contrato** que tenha pedido registrado.

Duas autorizacoes do mesmo contrato nunca correm juntas: a linha do contrato e
travada antes de olhar o saldo, entao a segunda espera a primeira e recebe a
recusa com o saldo ja atualizado.

### Avisos

O sino reune o que exige acao e some sozinho quando o motivo acaba:

- Setor de Compras: pedidos aguardando autorizacao;
- secretaria: seus pedidos autorizados ou recusados na ultima semana;
- quem acompanha: contrato ativo com vigencia vencendo em ate 30 dias.

Na lista de contratos, quem passou de 90% do valor executado aparece destacado:
e a hora de decidir entre aditivo e novo processo, antes de faltar saldo.

## Demanda: o DFD

A compra comeca na secretaria que precisa dela. O que antes era um recado com
objeto e justificativa agora e o **Documento de Formalizacao da Demanda** que a
Lei 14.133/2021 pede (art. 12, VII): prioridade, data pretendida, previsao no
plano de contratacoes anual, resultados esperados, responsavel — e, sobretudo,
**itens com quantidade e memoria de calculo**.

A memoria de calculo e o que separa um pedido de um estudo: "120 pacotes" nao
diz nada; "consumo de 110 pacotes no contrato anterior, mais 9% de matricula
nova" sustenta o inciso IV do ETP.

O DFD e editavel enquanto nao vira processo. Depois disso ele e peca do processo
administrativo, e reescreve-lo mudaria a origem de um lote que ja esta em
cotacao.

### Importar de um relatorio anterior

Redigitar trinta itens e o que faz a secretaria desistir de detalhar a demanda.
Por isso os itens podem vir de um documento que ela ja tem:

| Fonte | O que traz |
| --- | --- |
| Demanda anterior | Os itens de um DFD que a secretaria ja enviou |
| Processo anterior | Os itens do lote, com a quantidade que **esta** secretaria lancou nele |
| Consumo de contrato | O que a secretaria de fato consumiu — soma dos pedidos autorizados |

A terceira e a melhor base de calculo, e ja chega escrita: "Consumo autorizado
desta secretaria no contrato 020/2025: 110 PCT." O recorte e sempre a secretaria
da sessao — importar de um relatorio anterior nao vira porta para ler o consumo
da secretaria vizinha.

Quando o Setor de Compras gera o processo a partir do DFD, **o lote ja nasce com
os itens da demanda** e com a quantidade da secretaria lancada na coluna dela. O
comprador corrige a especificacao; nao redigita a demanda inteira.

## Estudo Tecnico Preliminar

O ETP (art. 18 da Lei 14.133/2021) fica em `/painel/compras/etp/[processo]`.
Cinco dos treze incisos o portal responde sozinho, porque os dados ja estao la:

| Inciso | De onde sai |
| --- | --- |
| I — Descricao da necessidade | Justificativa, prioridade e prazo do DFD |
| IV — Quantidades e memoria de calculo | Quantidades por secretaria no lote, mais a memoria de cada item do DFD |
| V — Levantamento de mercado | Fontes consultadas na pesquisa de precos, contadas e ordenadas |
| VI — Estimativa do valor | Metodo adotado (media, mediana ou menor), com os precos unitarios |
| VIII e XIII | Sugestao de texto, que o comprador aceita ou reescreve |

Os demais sao decisao de quem compra e continuam sendo digitados. Os
obrigatorios do art. 18, par. 2 (I, IV, VI, VIII e XIII) travam a conclusao se
faltarem; os incisos deixados em branco exigem a justificativa das omissoes,
como a propria lei manda.

### Rascunho vive, concluido congela

Enquanto o estudo e rascunho, os incisos derivados sao recalculados a cada
leitura: mexeu na cotacao, o ETP acompanha. **Ao concluir, o que foi apurado e
congelado num instantaneo** — um estudo assinado nao pode mudar de conteudo
porque alguem editou uma cotacao na semana seguinte. Reabrir descarta o
instantaneo e devolve o documento ao calculo vivo, deixando claro que ele voltou
a ser minuta.

### Quem le, quem baixa

O ETP e elaborado pelo Setor de Compras. A CPL, o gestor, a administracao e a
secretaria de origem leem e baixam o PDF — e a mesa da CPL lista, para cada
processo, o DFD de origem e a situacao do estudo, que e o que ela junta a
licitacao. O sino avisa o comprador quando um processo caminha para a comissao
sem ETP concluido.

O PDF de minuta sai carimbado como minuta, com aviso no corpo do documento e no
rodape de todas as paginas, para ninguem juntar rascunho ao processo por engano.

## Roteiro de verificacao

`scripts/fluxo.sh` percorre um ciclo inteiro contra um Postgres real, do banco
vazio ao saldo do contrato, conferindo o codigo HTTP de cada etapa:

```bash
npm run dev            # noutro terminal
npm run verificar      # zera o banco, semeia o superadmin e roda o ciclo
```

O roteiro cria a prefeitura e os seis perfis, formaliza a demanda, gera o
processo com os itens do DFD, coleta quantidade de outra secretaria, lanca as
cotacoes, conclui o ETP, tramita na CPL, cadastra o contrato, executa um pedido
de fornecimento, encerra tudo e ainda cobre dois caminhos alternativos: o
segundo ciclo anual importando o consumo do contrato e a licitacao fracassada,
com a demanda voltando para a fila.

Ele tambem exercita o que **nao** pode: secretaria autorizando o proprio pedido,
compras registrando tramite da comissao, gestor formalizando demanda, pedido em
contrato encerrado, encerramento com contrato ativo. Sao 90 etapas; qualquer uma
fora do esperado aparece no resumo do fim.

**O roteiro zera o banco apontado por `DATABASE_URL`.** Use so no banco local —
`PULAR_RESET=1 npm run verificar` roda sobre o que ja existe, sem apagar nada.
