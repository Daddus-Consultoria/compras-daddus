-- Estrutura inicial do portal de compras.
-- Tudo abaixo de `prefeituras` pertence a exatamente uma prefeitura: e ela que
-- isola os dados de um municipio dos demais.

create table if not exists prefeituras (
  id               serial      primary key,
  slug             text        not null unique,
  nome             text        not null,
  estado           text        not null default '',
  cnpj             text        not null default '',
  endereco_compras text        not null default '',
  logo_mime        text,
  logo_dados       bytea,
  ativa            boolean     not null default true,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);

create table if not exists secretarias (
  id            serial  primary key,
  prefeitura_id integer not null references prefeituras (id) on delete cascade,
  chave         text    not null,
  nome          text    not null,
  ordem         integer not null default 0,
  ativa         boolean not null default true,
  unique (prefeitura_id, chave)
);

do $$ begin
  create type papel_usuario as enum ('superadmin', 'admin', 'compras', 'secretario', 'gestor');
exception when duplicate_object then null;
end $$;

-- O superadmin e da Daddus e nao pertence a nenhuma prefeitura; todos os
-- demais pertencem a uma. Secretario precisa, ainda, de uma secretaria.
create table if not exists usuarios (
  id                   serial        primary key,
  email                text          not null unique,
  senha_hash           text          not null,
  nome                 text          not null,
  papel                papel_usuario not null,
  prefeitura_id        integer       references prefeituras (id) on delete cascade,
  secretaria_id        integer       references secretarias (id) on delete set null,
  ativo                boolean       not null default true,
  precisa_trocar_senha boolean       not null default true,
  ultimo_acesso        timestamptz,
  criado_em            timestamptz   not null default now(),
  constraint usuario_escopo_do_papel check (
    (papel = 'superadmin' and prefeitura_id is null)
    or (papel <> 'superadmin' and prefeitura_id is not null)
  ),
  constraint usuario_secretario_tem_secretaria check (
    papel <> 'secretario' or secretaria_id is not null
  )
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
  id                        serial          primary key,
  prefeitura_id             integer         not null references prefeituras (id) on delete cascade,
  numero_processo           text            not null,
  objeto                    text            not null,
  prazo_limite              date,
  status                    processo_status not null default 'em_montagem',
  secretaria_solicitante_id integer         references secretarias (id) on delete set null,
  responsavel               text            not null default '',
  notas_processo            text            not null default '',
  criado_em                 timestamptz     not null default now(),
  atualizado_em             timestamptz     not null default now(),
  unique (prefeitura_id, numero_processo)
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

-- Quantidade por item e por secretaria em linhas separadas: e o que permite
-- saber quem preencheu o que e recusar edicao alheia.
create table if not exists item_quantidades (
  item_id           integer     not null references itens_lote (id) on delete cascade,
  secretaria_id     integer     not null references secretarias (id) on delete restrict,
  quantidade        integer     not null default 0 check (quantidade >= 0),
  atualizado_por_id integer     references usuarios (id) on delete set null,
  atualizado_em     timestamptz not null default now(),
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
  prefeitura_id    integer            not null references prefeituras (id) on delete cascade,
  objeto           text               not null,
  justificativa    text               not null,
  secretaria_id    integer            references secretarias (id) on delete set null,
  criado_por_id    integer            references usuarios (id) on delete set null,
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

create index if not exists usuarios_prefeitura_idx on usuarios (prefeitura_id);
create index if not exists processos_prefeitura_idx on processos_compra (prefeitura_id);
create index if not exists itens_lote_processo_idx on itens_lote (processo_id);
create index if not exists cotacoes_item_idx on cotacoes (item_id);
create index if not exists solicitacoes_prefeitura_idx on solicitacoes (prefeitura_id, criado_em desc);
