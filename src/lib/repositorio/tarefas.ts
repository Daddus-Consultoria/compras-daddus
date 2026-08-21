import { consultar, consultarUm } from "@/lib/db";

export type Tarefa = {
  id: number;
  descricao: string;
  /** "DD/MM/AAAA" ou vazio quando a tarefa nao tem prazo. */
  dataPrazo: string;
  concluida: boolean;
  comentarios: string;
  /** Numero do processo vinculado, quando a tarefa nasceu de um. */
  processo: string | null;
};

type LinhaTarefa = {
  id: number;
  descricao: string;
  data_prazo: string | null;
  concluida: boolean;
  comentarios: string;
  processo: string | null;
};

const selecao = `select t.id, t.descricao, to_char(t.data_prazo, 'DD/MM/YYYY') as data_prazo,
                        t.concluida, t.comentarios, p.numero_processo as processo
                 from tarefas_processo t
                 left join processos_compra p on p.id = t.processo_id`;

function paraTarefa(linha: LinhaTarefa): Tarefa {
  return {
    id: linha.id,
    descricao: linha.descricao,
    dataPrazo: linha.data_prazo ?? "",
    concluida: linha.concluida,
    comentarios: linha.comentarios,
    processo: linha.processo,
  };
}

/** "12/08/2026" -> "2026-08-12"; qualquer outra coisa vira nulo. */
function paraDataIso(valor: string | null) {
  if (!valor) return null;
  const partes = valor.split("/");
  if (partes.length !== 3) return null;
  const [dia, mes, ano] = partes;
  return `${ano}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}`;
}

/**
 * Resolve o processo pelo numero dentro da propria prefeitura: e o que impede
 * vincular uma tarefa a um processo de outro municipio.
 */
async function idDoProcesso(prefeituraId: number | null, numero: string | null) {
  if (!numero || prefeituraId === null) return null;
  const linha = await consultarUm<{ id: number }>(
    "select id from processos_compra where prefeitura_id = $1 and numero_processo = $2",
    [prefeituraId, numero],
  );
  return linha?.id ?? null;
}

export async function listarTarefas(usuarioId: number) {
  // Pendentes primeiro, e dentro de cada grupo o prazo mais proximo na frente.
  const linhas = await consultar<LinhaTarefa>(
    `${selecao} where t.usuario_id = $1
     order by t.concluida, t.data_prazo nulls last, t.criado_em`,
    [usuarioId],
  );
  return linhas.map(paraTarefa);
}

export async function criarTarefa(dados: {
  usuarioId: number;
  prefeituraId: number | null;
  descricao: string;
  dataPrazo: string | null;
  processo: string | null;
  comentarios: string;
}) {
  const processoId = await idDoProcesso(dados.prefeituraId, dados.processo);
  const linha = await consultarUm<{ id: number }>(
    `insert into tarefas_processo (usuario_id, processo_id, descricao, data_prazo, comentarios)
     values ($1, $2, $3, $4, $5) returning id`,
    [dados.usuarioId, processoId, dados.descricao, paraDataIso(dados.dataPrazo), dados.comentarios],
  );
  const criada = await consultarUm<LinhaTarefa>(`${selecao} where t.id = $1`, [linha!.id]);
  return paraTarefa(criada as LinhaTarefa);
}

export async function atualizarTarefa(
  usuarioId: number,
  id: number,
  dados: { descricao?: string; dataPrazo?: string | null; concluida?: boolean; comentarios?: string },
) {
  const linha = await consultarUm<{ id: number }>(
    `update tarefas_processo set
       descricao   = coalesce($3, descricao),
       data_prazo  = case when $4::boolean then $5::date else data_prazo end,
       concluida   = coalesce($6, concluida),
       comentarios = coalesce($7, comentarios)
     where id = $1 and usuario_id = $2
     returning id`,
    [
      id,
      usuarioId,
      dados.descricao ?? null,
      dados.dataPrazo !== undefined,
      dados.dataPrazo ? paraDataIso(dados.dataPrazo) : null,
      dados.concluida ?? null,
      dados.comentarios ?? null,
    ],
  );
  return Boolean(linha);
}

export async function removerTarefa(usuarioId: number, id: number) {
  const linha = await consultarUm<{ id: number }>(
    "delete from tarefas_processo where id = $1 and usuario_id = $2 returning id",
    [id, usuarioId],
  );
  return Boolean(linha);
}

export async function lerNotaAgenda(usuarioId: number) {
  const linha = await consultarUm<{ nota_agenda: string }>("select nota_agenda from usuarios where id = $1", [usuarioId]);
  return linha?.nota_agenda ?? "";
}

export async function salvarNotaAgenda(usuarioId: number, nota: string) {
  const linha = await consultarUm<{ id: number }>(
    "update usuarios set nota_agenda = $2 where id = $1 returning id",
    [usuarioId, nota],
  );
  return Boolean(linha);
}
