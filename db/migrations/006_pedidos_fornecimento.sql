-- Fase 4 do fluxo: a execucao do contrato. Ate aqui o portal sabia o que fora
-- contratado, mas nao o que ja tinha sido consumido — o saldo vivia na planilha
-- de alguem.
--
-- A secretaria pede o fornecimento dentro do contrato e o Setor de Compras
-- autoriza; e a autorizacao que baixa o saldo, do mesmo jeito que na prefeitura
-- e o empenho que compromete a dotacao. Continua sem coluna de saldo: ele e a
-- diferenca entre o contratado e o que foi autorizado, calculada a cada leitura.
-- Guardar o saldo faria dele um numero editavel, que e o que o fluxo evita.

do $$ begin
  create type pedido_status as enum ('pendente', 'autorizado', 'recusado', 'cancelado', 'estornado');
exception when duplicate_object then null;
end $$;

create table if not exists pedidos_fornecimento (
  id              serial        primary key,
  prefeitura_id   integer       not null references prefeituras (id) on delete cascade,
  -- Restrict, e nao cascade: contrato com pedido nao some sem alguem decidir o
  -- que fazer com o que ja foi autorizado. A API recusa e diz o que prende.
  contrato_id     integer       not null references contratos (id) on delete restrict,
  secretaria_id   integer       not null references secretarias (id) on delete restrict,
  numero          text          not null,
  justificativa   text          not null default '',
  status          pedido_status not null default 'pendente',
  -- Numero do empenho, quando a prefeitura empenha na autorizacao.
  empenho         text          not null default '',
  entrega_prevista date,
  -- Motivo da recusa ou do estorno; exigido pelo check abaixo.
  motivo_decisao  text          not null default '',
  criado_por_id   integer       references usuarios (id) on delete set null,
  criado_em       timestamptz   not null default now(),
  decidido_por_id integer       references usuarios (id) on delete set null,
  decidido_em     timestamptz,
  unique (prefeitura_id, numero),
  -- Pedido decidido tem quando; pedido pendente, nao.
  constraint pedido_decidido_tem_data check ((status = 'pendente') = (decidido_em is null)),
  -- Recusar e estornar mudam o rumo do pedido: sem o motivo escrito o historico
  -- nao explica por que a secretaria ficou sem o fornecimento.
  constraint pedido_negado_tem_motivo check (status not in ('recusado', 'estornado') or motivo_decisao <> '')
);

-- A quantidade e numeric pela mesma razao do item do contrato: genero
-- alimenticio se mede em kg e litro. Zero nao e pedido, entao o check e > 0.
create table if not exists itens_pedido (
  id               serial        primary key,
  pedido_id        integer       not null references pedidos_fornecimento (id) on delete cascade,
  item_contrato_id integer       not null references itens_contrato (id) on delete restrict,
  quantidade       numeric(14,3) not null check (quantidade > 0),
  unique (pedido_id, item_contrato_id)
);

create index if not exists pedidos_prefeitura_idx on pedidos_fornecimento (prefeitura_id, status, criado_em desc);
create index if not exists pedidos_contrato_idx on pedidos_fornecimento (contrato_id, status);
create index if not exists pedidos_secretaria_idx on pedidos_fornecimento (secretaria_id, criado_em desc);
create index if not exists itens_pedido_item_idx on itens_pedido (item_contrato_id);
