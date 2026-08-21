-- Fase 5: os dois documentos que abrem a contratacao na Lei 14.133/2021.
--
-- O DFD (Documento de Formalizacao da Demanda) ja existia pela metade: a
-- solicitacao da secretaria tinha objeto e justificativa, mas nao os itens nem
-- os campos que o documento exige. Em vez de criar uma tabela paralela, a
-- solicitacao vira o DFD — e a mesma demanda, e duplica-la faria duas versoes
-- da mesma verdade.
--
-- O ETP (Estudo Tecnico Preliminar, art. 18) nasce do processo, porque e la que
-- estao as quantidades consolidadas e a pesquisa de precos que ele precisa
-- citar. O que o portal ja sabe nao vira campo digitado: e derivado na leitura.

-- --------------------------------------------------------------------------
-- DFD
-- --------------------------------------------------------------------------
do $$ begin
  create type demanda_prioridade as enum ('alta', 'media', 'baixa');
exception when duplicate_object then null;
end $$;

alter table solicitacoes
  add column if not exists numero          text,
  add column if not exists prioridade      demanda_prioridade not null default 'media',
  add column if not exists data_pretendida date,
  add column if not exists previsao_pca    boolean not null default false,
  add column if not exists resultados      text not null default '',
  add column if not exists vinculacao      text not null default '',
  add column if not exists responsavel     text not null default '',
  -- De onde vieram os itens, quando a secretaria importou de uma demanda, de um
  -- processo ou do consumo de um contrato. E a memoria de calculo do ETP.
  add column if not exists origem_itens    text not null default '';

-- As demandas ja gravadas ganham numero na ordem em que foram criadas, por ano,
-- para nao existir DFD sem identificacao no documento emitido.
update solicitacoes s
set numero = n.numero
from (
  select id,
         lpad(row_number() over (partition by prefeitura_id, date_part('year', criado_em) order by criado_em, id)::text, 4, '0')
           || '/' || date_part('year', criado_em)::int as numero
  from solicitacoes
) n
where n.id = s.id and s.numero is null;

create unique index if not exists solicitacoes_numero_idx on solicitacoes (prefeitura_id, numero);

-- Quantidade em numeric pela mesma razao dos itens de contrato: genero
-- alimenticio se mede em kg e litro.
create table if not exists itens_solicitacao (
  id             serial        primary key,
  solicitacao_id integer       not null references solicitacoes (id) on delete cascade,
  numero_item    integer       not null,
  descricao      text          not null default '',
  unidade        text          not null default 'UN',
  quantidade     numeric(14,3) not null default 0 check (quantidade >= 0),
  -- Como a secretaria chegou a esse numero: consumo do contrato anterior,
  -- matricula, populacao atendida. E o inciso IV do art. 18.
  memoria        text          not null default '',
  unique (solicitacao_id, numero_item)
);

create index if not exists itens_solicitacao_idx on itens_solicitacao (solicitacao_id, numero_item);

-- --------------------------------------------------------------------------
-- ETP
-- --------------------------------------------------------------------------
do $$ begin
  create type etp_status as enum ('rascunho', 'concluido');
exception when duplicate_object then null;
end $$;

-- Um ETP por processo: o estudo e do objeto, e o objeto e o processo.
--
-- So os incisos discursivos viram coluna. Necessidade, quantidades, memoria de
-- calculo, levantamento de mercado e estimativa de valor sao derivados do DFD,
-- do lote e das cotacoes a cada leitura — enquanto o estudo e rascunho. Ao
-- concluir, o que foi derivado e congelado em `instantaneo`, porque um ETP
-- assinado nao pode mudar de conteudo quando alguem edita uma cotacao depois.
create table if not exists etps (
  id                serial      primary key,
  prefeitura_id     integer     not null references prefeituras (id) on delete cascade,
  processo_id       integer     not null unique references processos_compra (id) on delete cascade,
  requisitos        text        not null default '',
  solucao           text        not null default '',
  parcelamento      text        not null default '',
  resultados        text        not null default '',
  providencias      text        not null default '',
  correlatas        text        not null default '',
  impactos          text        not null default '',
  posicionamento    text        not null default '',
  previsao_pca      text        not null default '',
  -- Art. 18, par. 2: os incisos nao contemplados exigem justificativa.
  omissoes          text        not null default '',
  status            etp_status  not null default 'rascunho',
  instantaneo       jsonb,
  criado_por_id     integer     references usuarios (id) on delete set null,
  concluido_por_id  integer     references usuarios (id) on delete set null,
  concluido_em      timestamptz,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now(),
  constraint etp_concluido_tem_instantaneo check ((status = 'rascunho') = (instantaneo is null))
);

create index if not exists etps_prefeitura_idx on etps (prefeitura_id, status);
