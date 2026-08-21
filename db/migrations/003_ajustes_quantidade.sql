-- O Setor de Compras pode corrigir a quantidade lancada por uma secretaria,
-- mas nunca em silencio: cada ajuste guarda de quanto para quanto, quem fez e
-- por que. E o que preserva a autoria do numero original no processo.

create table if not exists ajustes_quantidade (
  id                  serial      primary key,
  item_id             integer     not null references itens_lote (id) on delete cascade,
  secretaria_id       integer     not null references secretarias (id) on delete cascade,
  quantidade_anterior integer     not null,
  quantidade_nova     integer     not null,
  justificativa       text        not null,
  usuario_id          integer     references usuarios (id) on delete set null,
  criado_em           timestamptz not null default now()
);

create index if not exists ajustes_quantidade_item_idx on ajustes_quantidade (item_id, criado_em desc);
