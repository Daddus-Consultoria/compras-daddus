-- Conexao com as bases de preco publicas.
--
-- O art. 5 da IN SEGES/ME 65/2021 poe as bases publicas no topo da ordem de
-- preferencia da pesquisa de precos, e ate aqui elas eram digitadas a mao: a
-- pessoa abria o Painel de Precos noutra aba, achava o preco, e retranscrevia
-- valor, orgao e data no formulario de cotacao. Cada transcricao e uma chance
-- de errar um digito num numero que vai para dentro do mapa.
--
-- A API do Painel de Precos (dadosabertos.compras.gov.br, modulo-pesquisa-preco)
-- e publica e nao pede chave, mas consulta por CODIGO de catalogo — CATMAT para
-- material, CATSER para servico — e nao por texto. Dai as duas mudancas aqui:
-- o item do lote passa a poder apontar para um codigo, e o catalogo passa a ter
-- copia local.

-- A copia local do catalogo existe porque a API nao busca por texto. Foi
-- verificado: o parametro `descricaoItem` de modulo-material/4_consultarItemMaterial
-- devolve zero resultados mesmo com a descricao exata, e o endpoint de PDM nao
-- aceita nome. Sem copia local, achar o codigo de "papel sulfite A4" exigiria
-- percorrer 343.880 itens a cada busca.
--
-- E cache de fonte externa, entao nao ha chave estrangeira apontando para ca:
-- o catalogo pode estar vazio (coleta ainda nao rodou) sem que isso impeca o
-- lote de existir.
--
-- A chave e (codigo_item, tipo), e nao o codigo sozinho: CATMAT e CATSER
-- compartilham a numeracao. Verificado na origem — o codigo 1171 e
-- "ENSAIO E ANALISES QUIMICAS" no catalogo de servicos e "CABRESTANTE DE
-- EMBARCACAO" no de materiais. Com o codigo sozinho como chave, a coleta de
-- servicos sobrescreveria materiais em silencio, e o item do lote acabaria
-- consultando o preco de outra coisa.
create table if not exists catalogo_itens (
  codigo_item   integer     not null,
  tipo          text        not null check (tipo in ('material', 'servico')),
  descricao     text        not null,
  codigo_pdm    integer,
  nome_pdm      text,
  codigo_classe integer,
  nome_classe   text,
  codigo_grupo  integer,
  nome_grupo    text,
  ativo         boolean     not null default true,
  coletado_em   timestamptz not null default now(),
  primary key (codigo_item, tipo)
);

-- Busca por relevancia em portugues, como na Biblioteca: quem monta o lote
-- digita "papel sulfite" e precisa achar o item entre trezentos mil.
create index if not exists catalogo_itens_busca_idx
  on catalogo_itens using gin (to_tsvector('portuguese', descricao));

create index if not exists catalogo_itens_tipo_idx on catalogo_itens (tipo) where ativo;

-- O vinculo do item do lote com o catalogo.
--
-- A descricao vem junto, e nao so o codigo, de proposito: e o texto do catalogo
-- no momento em que alguem escolheu aquele item. O catalogo oficial muda —
-- item sai de linha, descricao e reescrita — e o processo precisa continuar
-- dizendo o que foi escolhido na epoca, sem depender de uma releitura futura.
alter table itens_lote add column if not exists codigo_catalogo integer;
alter table itens_lote add column if not exists catalogo_tipo text;
alter table itens_lote add column if not exists catalogo_descricao text;

alter table itens_lote drop constraint if exists itens_lote_catalogo_tipo_check;
alter table itens_lote add constraint itens_lote_catalogo_tipo_check
  check (catalogo_tipo is null or catalogo_tipo in ('material', 'servico'));
