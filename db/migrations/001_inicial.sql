-- Estrutura inicial do portal de compras.
-- Os nomes de tipos e enums seguem a modelagem definida para o backend.

create table if not exists secretarias (
  id    serial primary key,
  chave text    not null unique,
  nome  text    not null,
  ordem integer not null default 0
);

-- Linha unica: a configuracao institucional do municipio.
create table if not exists config_prefeitura (
  id               integer     primary key default 1,
  estado           text        not null default '',
  nome             text        not null default '',
  cnpj             text        not null default '',
  endereco_compras text        not null default '',
  logo_mime        text,
  logo_dados       bytea,
  atualizado_em    timestamptz not null default now(),
  constraint config_prefeitura_linha_unica check (id = 1)
);

do $$ begin
  create type processo_status as enum ('em_montagem', 'coleta_quantidades', 'em_cotacao', 'enviado_licitacao', 'cancelado');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type solicitacao_status as enum ('pendente', 'em_cotacao', 'em_licitacao', 'concluido', 'recusado');
exception when duplicate_object then null;
end $$;

create table if not exists processos_compra (
  id              serial          primary key,
  numero_processo text            not null unique,
  objeto          text            not null,
  prazo_limite    date,
  status          processo_status not null default 'em_montagem',
  secretaria_solicitante_id integer references secretarias (id) on delete set null,
  responsavel     text            not null default '',
  notas_processo  text            not null default '',
  criado_em       timestamptz     not null default now(),
  atualizado_em   timestamptz     not null default now()
);

create table if not exists itens_lote (
  id            serial      primary key,
  processo_id   integer     not null references processos_compra (id) on delete cascade,
  numero_item   integer     not null,
  especificacao text        not null default '',
  unidade       text        not null default 'UN',
  criado_em     timestamptz not null default now(),
  unique (processo_id, numero_item)
);

-- Quantidade por secretaria em linhas separadas: e o que permite,
-- mais adiante, saber quem preencheu o que e bloquear edicao alheia.
create table if not exists item_quantidades (
  item_id       integer     not null references itens_lote (id) on delete cascade,
  secretaria_id integer     not null references secretarias (id) on delete restrict,
  quantidade    integer     not null default 0 check (quantidade >= 0),
  atualizado_em timestamptz not null default now(),
  primary key (item_id, secretaria_id)
);

create table if not exists cotacoes (
  id             serial        primary key,
  item_id        integer       not null references itens_lote (id) on delete cascade,
  fonte          text          not null,
  valor_unitario numeric(14,2) not null default 0 check (valor_unitario >= 0),
  unique (item_id, fonte)
);

create table if not exists solicitacoes (
  id               serial             primary key,
  objeto           text               not null,
  justificativa    text               not null,
  secretaria_id    integer            references secretarias (id) on delete set null,
  status           solicitacao_status not null default 'pendente',
  processo_id      integer            references processos_compra (id) on delete set null,
  termo_referencia text,
  criado_em        timestamptz        not null default now()
);

create table if not exists tarefas_processo (
  id          serial  primary key,
  processo_id integer references processos_compra (id) on delete cascade,
  descricao   text    not null,
  data_prazo  date,
  concluida   boolean not null default false,
  comentarios text    not null default ''
);

create index if not exists itens_lote_processo_idx on itens_lote (processo_id);
create index if not exists cotacoes_item_idx on cotacoes (item_id);
create index if not exists solicitacoes_criado_em_idx on solicitacoes (criado_em desc);
