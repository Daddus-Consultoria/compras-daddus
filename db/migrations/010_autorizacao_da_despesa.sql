-- Quem autoriza a despesa deixa de ser o Setor de Compras.
--
-- Ate aqui a autorizacao do pedido de fornecimento — o ato que baixa o saldo
-- do contrato — era do perfil `compras`. Isso inverte a hierarquia real da
-- prefeitura: quem autoriza despesa e o ordenador, o prefeito, quase sempre
-- delegado por decreto aos secretarios de pasta. O Setor de Compras instrui:
-- confere saldo, vigencia e preco. Nao ordena.
--
-- O pedido passa a ter tres atos, e nao um:
--
--   abrir (secretaria)  ->  conferir (compras)  ->  autorizar (ordenador)
--
-- O ordenador e o secretario da pasta ate o limite de alcada da prefeitura, e
-- o gabinete acima dele. Como a delegacao vem de decreto e cada municipio
-- delega diferente, tanto o limite quanto a exigencia de pessoas distintas
-- ficam na prefeitura, e nao no codigo.
--
-- Os enums sao recriados em vez de receberem `alter type ... add value` pelo
-- mesmo motivo de 005: o migrador roda cada arquivo dentro de uma transacao, e
-- o Postgres nao deixa usar um valor de enum criado na mesma transacao.

-- --------------------------------------------------------------------------
-- Papel: o gabinete entra como perfil proprio.
-- --------------------------------------------------------------------------
create type papel_usuario_novo as enum ('superadmin', 'admin', 'compras', 'cpl', 'secretario', 'gabinete', 'gestor');

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
-- Quem e ordenador. Nao e o papel que responde: dentro de uma secretaria ha
-- quem requisite e ha quem autorize, e as duas pessoas entram como
-- `secretario`. A flag e que separa uma da outra.
-- --------------------------------------------------------------------------
alter table usuarios add column if not exists ordenador boolean not null default false;

-- Todo secretario existente vira ordenador. Sem isso o portal sobe travado:
-- nenhum ordenador designado, nenhum pedido autorizavel, e a prefeitura
-- descobriria a mudanca por um botao que sumiu. Quem nao deve autorizar e
-- desmarcado depois, na tela de usuarios.
update usuarios set ordenador = true where papel = 'secretario';

alter table usuarios add constraint usuario_ordenador_do_papel check (
  not ordenador or papel in ('secretario', 'gabinete')
);
-- O gabinete responde pela prefeitura inteira; prende-lo a uma secretaria o
-- transformaria num secretario com outro nome.
alter table usuarios add constraint usuario_gabinete_sem_secretaria check (
  papel <> 'gabinete' or secretaria_id is null
);

-- --------------------------------------------------------------------------
-- Alcada: ate quanto o secretario autoriza sozinho.
--
-- `limite_autorizacao` nulo significa "sem teto" — o secretario autoriza
-- qualquer valor da propria pasta. E o padrao porque e o que o portal fazia
-- antes de existir alcada, so que com o ordenador certo no lugar do Compras.
-- --------------------------------------------------------------------------
alter table prefeituras add column if not exists limite_autorizacao numeric(14,2);
alter table prefeituras add column if not exists exige_ordenador_distinto boolean not null default true;

alter table prefeituras add constraint prefeitura_limite_positivo check (
  limite_autorizacao is null or limite_autorizacao > 0
);

-- --------------------------------------------------------------------------
-- O pedido ganha a conferencia entre a abertura e a decisao.
-- --------------------------------------------------------------------------
create type pedido_status_novo as enum ('pendente', 'conferido', 'autorizado', 'recusado', 'cancelado', 'estornado');

alter table pedidos_fornecimento drop constraint if exists pedido_decidido_tem_data;
alter table pedidos_fornecimento drop constraint if exists pedido_negado_tem_motivo;

alter table pedidos_fornecimento alter column status drop default;
alter table pedidos_fornecimento alter column status type pedido_status_novo using status::text::pedido_status_novo;
alter table pedidos_fornecimento alter column status set default 'pendente'::pedido_status_novo;

drop type pedido_status;
alter type pedido_status_novo rename to pedido_status;

alter table pedidos_fornecimento
  add column if not exists conferido_por_id integer references usuarios (id) on delete set null,
  add column if not exists conferido_em     timestamptz;

-- Decidido tem quando; pendente e conferido, nao — conferir nao e decidir.
alter table pedidos_fornecimento add constraint pedido_decidido_tem_data check (
  (status in ('pendente', 'conferido')) = (decidido_em is null)
);
alter table pedidos_fornecimento add constraint pedido_negado_tem_motivo check (
  status not in ('recusado', 'estornado') or motivo_decisao <> ''
);
-- Pedido conferido tem a data da conferencia. Os ja decididos antes desta
-- migracao nao tem, e nao passam por aqui: a regra vale so para quem esta
-- parado em `conferido`.
alter table pedidos_fornecimento add constraint pedido_conferido_tem_data check (
  status <> 'conferido' or conferido_em is not null
);

-- A fila do ordenador e "conferido, mais antigo primeiro": o indice existente
-- cobre (prefeitura, status, criado_em desc), que serve para a caixa de
-- entrada; este cobre a busca por secretaria dentro de um status.
create index if not exists pedidos_secretaria_status_idx
  on pedidos_fornecimento (secretaria_id, status, criado_em desc);
