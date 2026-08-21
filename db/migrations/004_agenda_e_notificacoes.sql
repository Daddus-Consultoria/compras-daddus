-- A agenda nasceu so no localStorage do navegador e a tabela de tarefas ficou
-- sem dono. Aqui ela vira a agenda pessoal de cada usuario, com prazo e
-- vinculo opcional a um processo.
alter table tarefas_processo
  add column if not exists usuario_id integer references usuarios (id) on delete cascade,
  add column if not exists criado_em  timestamptz not null default now();


create index if not exists tarefas_usuario_idx on tarefas_processo (usuario_id, concluida, data_prazo);

-- A nota de acompanhamento tambem morava no navegador: some ao trocar de
-- maquina e nao acompanha o usuario.
alter table usuarios add column if not exists nota_agenda text not null default '';

-- O conteudo das notificacoes e derivado dos dados (prazos, solicitacoes,
-- cotacoes faltantes); o banco guarda apenas o que cada um ja leu.
create table if not exists notificacoes_lidas (
  usuario_id integer     not null references usuarios (id) on delete cascade,
  chave      text        not null,
  lida_em    timestamptz not null default now(),
  primary key (usuario_id, chave)
);
