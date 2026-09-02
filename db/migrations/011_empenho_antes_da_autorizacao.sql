-- O empenho passa a vir antes da autorizacao, e deixa de ser um campo de texto.
--
-- Ate aqui `pedidos_fornecimento.empenho` era texto livre, opcional, gravado no
-- mesmo ato da autorizacao e sobrescrito sem deixar rastro. Tres problemas num
-- campo so: dava para autorizar despesa sem empenho nenhum, dava para repetir o
-- numero de outra nota, e a correcao de um numero errado nao ficava registrada.
--
-- A Lei 4.320/64 poe o empenho antes: "e vedada a realizacao de despesa sem
-- previo empenho" (art. 60). Entao o pedido ganha um estado a mais, entre a
-- conferencia e o autorizo:
--
--   pendente -> conferido -> empenhado -> autorizado
--
-- Quem emite a nota de empenho e a Financa, fora do portal; o Setor de Compras
-- registra o numero emitido e amarra o pedido a ele. O empenho vira cadastro
-- proprio porque uma nota estimativa cobre varios fornecimentos do mesmo
-- contrato: o codigo continua unico, o que se repete e o vinculo. E, como o
-- saldo do contrato, o saldo do empenho nao e guardado — e o valor menos o que
-- os pedidos vivos tomaram dele, apurado na leitura.

-- --------------------------------------------------------------------------
-- O empenho como cadastro.
--
-- Preso ao contrato porque nota de empenho se emite contra uma despesa: sem
-- isso, o empenho de um contrato pagaria o fornecimento de outro.
-- --------------------------------------------------------------------------
create table if not exists empenhos (
  id                serial        primary key,
  prefeitura_id     integer       not null references prefeituras (id) on delete cascade,
  -- Restrict pelo mesmo motivo do pedido: contrato com empenho nao some sem
  -- alguem decidir o que fazer com o que ja foi comprometido.
  contrato_id       integer       not null references contratos (id) on delete restrict,
  numero            text          not null,
  data_emissao      date,
  valor             numeric(14,2) not null check (valor > 0),
  observacao        text          not null default '',
  registrado_por_id integer       references usuarios (id) on delete set null,
  registrado_em     timestamptz   not null default now(),
  -- O numero da nota e unico no municipio: dois empenhos com o mesmo codigo
  -- sao um erro de digitacao ou uma nota contada duas vezes.
  unique (prefeitura_id, numero),
  constraint empenho_numero_preenchido check (numero <> '')
);

-- Toda alteracao de empenho exige justificativa escrita, e ela fica aqui. Um
-- numero de nota corrigido sem motivo registrado e indistinguivel de um numero
-- trocado para encobrir outra coisa.
create table if not exists empenho_alteracoes (
  id              serial      primary key,
  empenho_id      integer     not null references empenhos (id) on delete cascade,
  -- Preenchido quando o que mudou foi o vinculo de um pedido, e nao o cadastro.
  pedido_id       integer     references pedidos_fornecimento (id) on delete cascade,
  descricao       text        not null,
  motivo          text        not null,
  alterado_por_id integer     references usuarios (id) on delete set null,
  alterado_em     timestamptz not null default now(),
  constraint alteracao_tem_motivo check (motivo <> '')
);

create index if not exists empenhos_contrato_idx on empenhos (contrato_id, numero);
create index if not exists empenho_alteracoes_empenho_idx on empenho_alteracoes (empenho_id, alterado_em desc);

-- --------------------------------------------------------------------------
-- O estado novo do pedido.
-- --------------------------------------------------------------------------
create type pedido_status_novo as enum (
  'pendente', 'conferido', 'empenhado', 'autorizado', 'recusado', 'cancelado', 'estornado'
);

alter table pedidos_fornecimento drop constraint if exists pedido_decidido_tem_data;
alter table pedidos_fornecimento drop constraint if exists pedido_negado_tem_motivo;
alter table pedidos_fornecimento drop constraint if exists pedido_conferido_tem_data;

alter table pedidos_fornecimento alter column status drop default;
alter table pedidos_fornecimento alter column status type pedido_status_novo using status::text::pedido_status_novo;
alter table pedidos_fornecimento alter column status set default 'pendente'::pedido_status_novo;

drop type pedido_status;
alter type pedido_status_novo rename to pedido_status;

alter table pedidos_fornecimento
  add column if not exists empenho_id integer references empenhos (id) on delete restrict;

-- --------------------------------------------------------------------------
-- O que ja estava escrito no campo de texto vira cadastro.
--
-- O valor do empenho migrado e a soma dos pedidos que o citavam: e a unica
-- informacao que existe: o campo antigo nao guardava valor. Fica com
-- observacao dizendo de onde veio, para ninguem confundir com nota conferida.
-- --------------------------------------------------------------------------
insert into empenhos (prefeitura_id, contrato_id, numero, valor, observacao, registrado_em)
select p.prefeitura_id,
       min(p.contrato_id),
       p.empenho,
       sum(coalesce(v.total, 0)),
       'Migrado do campo de texto do pedido; valor deduzido dos pedidos que o citavam.',
       min(p.criado_em)
from pedidos_fornecimento p
left join lateral (
  select sum(ip.quantidade * ic.valor_unitario) as total
  from itens_pedido ip
  join itens_contrato ic on ic.id = ip.item_contrato_id
  where ip.pedido_id = p.id
) v on true
where p.empenho <> ''
group by p.prefeitura_id, p.empenho
-- Pedido sem item nao gera valor, e empenho de valor zero a tabela recusa.
having sum(coalesce(v.total, 0)) > 0;

update pedidos_fornecimento p
set empenho_id = e.id
from empenhos e
where e.prefeitura_id = p.prefeitura_id and e.numero = p.empenho and p.empenho <> '';

alter table pedidos_fornecimento drop column if exists empenho;

-- --------------------------------------------------------------------------
-- As checagens de volta, com o estado novo.
--
-- Nao ha check exigindo empenho no autorizado: os pedidos autorizados antes
-- desta regra nao tem numero, e inventar um seria publicar como nota de
-- empenho algo que ninguem emitiu. A exigencia vale dai para a frente, na
-- rota — e o estado `empenhado`, que so nasce depois desta migracao, a carrega
-- no banco.
-- --------------------------------------------------------------------------
alter table pedidos_fornecimento add constraint pedido_decidido_tem_data check (
  (status in ('pendente', 'conferido', 'empenhado')) = (decidido_em is null)
);
alter table pedidos_fornecimento add constraint pedido_negado_tem_motivo check (
  status not in ('recusado', 'estornado') or motivo_decisao <> ''
);
alter table pedidos_fornecimento add constraint pedido_conferido_tem_data check (
  status not in ('conferido', 'empenhado') or conferido_em is not null
);
alter table pedidos_fornecimento add constraint pedido_empenhado_tem_empenho check (
  status <> 'empenhado' or empenho_id is not null
);

create index if not exists pedidos_empenho_idx on pedidos_fornecimento (empenho_id, status);
