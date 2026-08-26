-- Quem ja lancou a quantidade, e quem ainda falta.
--
-- Ate aqui a pergunta so tinha resposta por inferencia: "lancou" era ter algum
-- item com quantidade > 0 (a convencao usada em secretarias.usoDaSecretaria e
-- em dfd.ts). A inferencia confunde duas situacoes diferentes — a secretaria
-- que entrou, olhou o lote e nao precisa de nenhum item aparece igualzinha a
-- que nunca abriu o processo. Na coleta de quantidades essa diferenca e a
-- unica coisa que importa: uma libera o processo para a cotacao, a outra o
-- prende.
--
-- Por isso o fim do lancamento passa a ser declarado, e nao deduzido. A linha
-- so existe depois que alguem da secretaria disse que terminou.
--
-- A chave e (processo, secretaria) e nao (processo, usuario): quem conclui e a
-- secretaria: se duas pessoas dela lancam, a conclusao e uma so. O usuario fica
-- registrado para saber quem assinou aquilo, nao para compor a chave.
create table if not exists lancamentos_quantidade (
  processo_id      integer     not null references processos_compra (id) on delete cascade,
  secretaria_id    integer     not null references secretarias (id) on delete cascade,
  concluido_por_id integer     references usuarios (id) on delete set null,
  concluido_em     timestamptz not null default now(),
  primary key (processo_id, secretaria_id)
);

create index if not exists lancamentos_quantidade_processo_idx
  on lancamentos_quantidade (processo_id);
