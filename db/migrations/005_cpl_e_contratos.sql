-- Fase 3 do fluxo: a CPL passa a existir dentro do portal e o contrato que ela
-- devolve vira um cadastro proprio, com os itens efetivamente contratados.
--
-- Os enums sao recriados em vez de receberem `alter type ... add value` porque
-- o migrador roda cada arquivo dentro de uma transacao, e o Postgres nao deixa
-- usar um valor de enum criado na mesma transacao. Trocar o tipo inteiro custa
-- uma reescrita das colunas e resolve os dois problemas de uma vez.

-- --------------------------------------------------------------------------
-- Papel: a CPL entra como perfil proprio.
-- --------------------------------------------------------------------------
create type papel_usuario_novo as enum ('superadmin', 'admin', 'compras', 'cpl', 'secretario', 'gestor');

-- As checagens sao derrubadas antes da troca de tipo porque guardam literais
-- ligados ao enum antigo, e recriadas logo em seguida, identicas.
alter table usuarios drop constraint if exists usuario_escopo_do_papel;
alter table usuarios drop constraint if exists usuario_secretario_tem_secretaria;

alter table usuarios alter column papel type papel_usuario_novo using papel::text::papel_usuario_novo;

drop type papel_usuario;
alter type papel_usuario_novo rename to papel_usuario;

alter table usuarios add constraint usuario_escopo_do_papel check (
  (papel = 'superadmin' and prefeitura_id is null)
  or (papel <> 'superadmin' and prefeitura_id is not null)
);
alter table usuarios add constraint usuario_secretario_tem_secretaria check (
  papel <> 'secretario' or secretaria_id is not null
);

-- --------------------------------------------------------------------------
-- Fases do processo: da cotacao concluida ate o contrato encerrado.
-- "enviado_licitacao" e mantido — e o "mapa enviado a CPL" do fluxo — para nao
-- reescrever o historico ja gravado.
-- --------------------------------------------------------------------------
create type processo_status_novo as enum (
  'em_montagem',
  'coleta_quantidades',
  'em_cotacao',
  'cotacao_concluida',
  'mapa_elaborado',
  'enviado_licitacao',
  'em_cpl',
  'contrato_recebido',
  'contrato_ativo',
  'encerrado',
  'cancelado'
);

alter table processos_compra alter column status drop default;
alter table processos_compra alter column status type processo_status_novo using status::text::processo_status_novo;
alter table processos_compra alter column status set default 'em_montagem'::processo_status_novo;

alter table historico_status alter column de   type processo_status_novo using de::text::processo_status_novo;
alter table historico_status alter column para type processo_status_novo using para::text::processo_status_novo;

drop type processo_status;
alter type processo_status_novo rename to processo_status;

-- --------------------------------------------------------------------------
-- Tramitacao na CPL: cada passagem pela comissao fica registrada como evento,
-- e nao como um campo sobrescrito, para que o processo administrativo consiga
-- reconstruir a ordem dos fatos.
-- --------------------------------------------------------------------------
do $$ begin
  create type tramite_cpl_tipo as enum ('recebimento', 'diligencia', 'retorno');
exception when duplicate_object then null;
end $$;

create table if not exists tramites_cpl (
  id            serial           primary key,
  processo_id   integer          not null references processos_compra (id) on delete cascade,
  tipo          tramite_cpl_tipo not null,
  data_tramite  date             not null default current_date,
  documento     text             not null default '',
  observacao    text             not null default '',
  usuario_id    integer          references usuarios (id) on delete set null,
  criado_em     timestamptz      not null default now()
);

create index if not exists tramites_cpl_processo_idx on tramites_cpl (processo_id, criado_em desc);

-- --------------------------------------------------------------------------
-- Contrato devolvido pela CPL.
-- --------------------------------------------------------------------------
do $$ begin
  create type contrato_status as enum ('ativo', 'suspenso', 'encerrado', 'rescindido');
exception when duplicate_object then null;
end $$;

create table if not exists contratos (
  id              serial          primary key,
  prefeitura_id   integer         not null references prefeituras (id) on delete cascade,
  -- O processo que originou o contrato. Fica opcional porque contrato herdado
  -- de antes do portal nao tem processo aqui dentro.
  processo_id     integer         references processos_compra (id) on delete set null,
  numero          text            not null,
  fornecedor      text            not null,
  cnpj_fornecedor text            not null default '',
  objeto          text            not null default '',
  vigencia_inicio date,
  vigencia_fim    date,
  -- Somatorio dos itens contratados; recalculado a cada gravacao de itens e
  -- nunca digitado a mao, pela mesma razao que o saldo nao sera.
  valor_total     numeric(14,2)   not null default 0,
  documento       text            not null default '',
  status          contrato_status not null default 'ativo',
  criado_por_id   integer         references usuarios (id) on delete set null,
  criado_em       timestamptz     not null default now(),
  atualizado_em   timestamptz     not null default now(),
  unique (prefeitura_id, numero)
);

-- Quantidade e numeric (e nao integer) porque contrato de genero alimenticio
-- se mede em kg e litro, com fracao.
--
-- Nao ha coluna de quantidade utilizada nem de saldo: os dois sao derivados das
-- movimentacoes, que entram na Fase 4. Guardar o saldo aqui faria dele um
-- numero editavel, que e exatamente o que o fluxo quer evitar.
create table if not exists itens_contrato (
  id                    serial        primary key,
  contrato_id           integer       not null references contratos (id) on delete cascade,
  numero_item           integer       not null,
  -- De qual item do lote este item veio, quando o contrato nasceu de um processo.
  item_lote_id          integer       references itens_lote (id) on delete set null,
  descricao             text          not null default '',
  unidade               text          not null default 'UN',
  quantidade_contratada numeric(14,3) not null default 0 check (quantidade_contratada >= 0),
  valor_unitario        numeric(14,2) not null default 0 check (valor_unitario >= 0),
  unique (contrato_id, numero_item)
);

create index if not exists contratos_prefeitura_idx on contratos (prefeitura_id, numero);
create index if not exists contratos_processo_idx on contratos (processo_id);
create index if not exists itens_contrato_contrato_idx on itens_contrato (contrato_id, numero_item);
