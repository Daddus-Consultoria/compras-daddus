-- Pesquisa de precos conforme a IN SEGES/ME 65/2021 e o art. 23 da Lei 14.133/2021.
--
-- A cotacao deixa de ser um trio fixo de colunas e passa a ser uma lista aberta
-- por item, cada uma com a fonte de onde veio, quando foi obtida e o documento
-- que a comprova. Precos destoantes nao sao apagados: ficam registrados como
-- desconsiderados, com justificativa, que e o que a norma exige.

do $$ begin
  create type fonte_cotacao as enum (
    'painel_precos',       -- Painel de Precos do Governo Federal
    'pncp',                -- Portal Nacional de Contratacoes Publicas
    'contrato_similar',    -- contratacoes similares de outros entes publicos
    'tabela_referencia',   -- tabelas oficiais (SINAPI, SICRO, CMED)
    'sitio_eletronico',    -- sitios especializados ou de dominio amplo
    'midia_especializada', -- publicacoes e revistas do setor
    'fornecedor'           -- pesquisa direta com fornecedores
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type metodo_preco as enum ('media', 'mediana', 'menor');
exception when duplicate_object then null;
end $$;

alter table cotacoes add column if not exists fonte_tipo fonte_cotacao;
alter table cotacoes add column if not exists descricao text not null default '';
alter table cotacoes add column if not exists documento text not null default '';
alter table cotacoes add column if not exists data_cotacao date;
alter table cotacoes add column if not exists desconsiderada boolean not null default false;
alter table cotacoes add column if not exists justificativa text not null default '';
alter table cotacoes add column if not exists criado_em timestamptz not null default now();

-- As tres fontes fixas viram registros comuns, preservando o que ja existia.
update cotacoes set fonte_tipo = case
    when fonte = 'PNCP' then 'pncp'::fonte_cotacao
    when fonte = 'BNC' then 'sitio_eletronico'::fonte_cotacao
    else 'fornecedor'::fonte_cotacao
  end,
  descricao = case when descricao = '' then fonte else descricao end
  where fonte_tipo is null;

alter table cotacoes alter column fonte_tipo set default 'fornecedor';
alter table cotacoes alter column fonte_tipo set not null;
alter table cotacoes drop column if exists fonte;
-- Varias cotacoes da mesma fonte passam a ser validas: sao fornecedores distintos.
alter table cotacoes drop constraint if exists cotacoes_item_id_fonte_key;

alter table processos_compra add column if not exists metodo_preco metodo_preco not null default 'media';
alter table processos_compra add column if not exists justificativa_metodo text not null default '';

-- Trilha de quem moveu o processo de fase, para o processo administrativo.
create table if not exists historico_status (
  id            serial          primary key,
  processo_id   integer         not null references processos_compra (id) on delete cascade,
  de            processo_status,
  para          processo_status not null,
  usuario_id    integer         references usuarios (id) on delete set null,
  observacao    text            not null default '',
  criado_em     timestamptz     not null default now()
);

create index if not exists historico_status_processo_idx on historico_status (processo_id, criado_em desc);
create index if not exists cotacoes_item_desconsiderada_idx on cotacoes (item_id, desconsiderada);
