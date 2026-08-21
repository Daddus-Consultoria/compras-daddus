import type { CampoEtp, Etp, EtpStatus, InstantaneoEtp } from "@/lib/etp";
import { camposDoEtp } from "@/lib/etp";
import { consultar, consultarUm, emTransacao } from "@/lib/db";

type LinhaEtp = {
  processo: string;
  status: EtpStatus;
  previsao_pca: string;
  requisitos: string;
  solucao: string;
  parcelamento: string;
  resultados: string;
  providencias: string;
  correlatas: string;
  impactos: string;
  posicionamento: string;
  omissoes: string;
  instantaneo: InstantaneoEtp | null;
  autor: string | null;
  concluido_por: string | null;
  concluido_em: string | null;
  atualizado_em: string;
};

const selecao = `
  select p.numero_processo as processo, e.status,
         e.previsao_pca, e.requisitos, e.solucao, e.parcelamento, e.resultados,
         e.providencias, e.correlatas, e.impactos, e.posicionamento, e.omissoes,
         e.instantaneo,
         autor.nome as autor, concluinte.nome as concluido_por,
         to_char(e.concluido_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') as concluido_em,
         to_char(e.atualizado_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') as atualizado_em
  from etps e
  join processos_compra p on p.id = e.processo_id
  left join usuarios autor on autor.id = e.criado_por_id
  left join usuarios concluinte on concluinte.id = e.concluido_por_id`;

function paraEtp(linha: LinhaEtp): Etp {
  return {
    processo: linha.processo,
    status: linha.status,
    previsaoPca: linha.previsao_pca,
    requisitos: linha.requisitos,
    solucao: linha.solucao,
    parcelamento: linha.parcelamento,
    resultados: linha.resultados,
    providencias: linha.providencias,
    correlatas: linha.correlatas,
    impactos: linha.impactos,
    posicionamento: linha.posicionamento,
    omissoes: linha.omissoes,
    instantaneo: linha.instantaneo,
    autor: linha.autor,
    concluidoPor: linha.concluido_por,
    concluidoEm: linha.concluido_em,
    atualizadoEm: linha.atualizado_em,
  };
}

export async function lerEtp(prefeituraId: number, numeroProcesso: string) {
  const linha = await consultarUm<LinhaEtp>(
    `${selecao} where e.prefeitura_id = $1 and p.numero_processo = $2`,
    [prefeituraId, numeroProcesso],
  );
  return linha ? paraEtp(linha) : null;
}

/** Quais processos ja tem estudo, e em que situacao — para as listas e a mesa da CPL. */
export async function situacaoDosEtps(prefeituraId: number) {
  return consultar<{ processo: string; status: EtpStatus }>(
    `select p.numero_processo as processo, e.status
     from etps e join processos_compra p on p.id = e.processo_id
     where e.prefeitura_id = $1`,
    [prefeituraId],
  );
}

const colunas: Record<CampoEtp, string> = {
  previsaoPca: "previsao_pca",
  requisitos: "requisitos",
  solucao: "solucao",
  parcelamento: "parcelamento",
  resultados: "resultados",
  providencias: "providencias",
  correlatas: "correlatas",
  impactos: "impactos",
  posicionamento: "posicionamento",
};

/**
 * Grava os incisos discursivos, criando o estudo na primeira vez. Estudo
 * concluido nao aceita edicao: para mexer, reabre-se antes — e a reabertura
 * apaga o instantaneo, deixando claro que o documento voltou a ser rascunho.
 */
export async function salvarEtp(
  prefeituraId: number,
  numeroProcesso: string,
  usuarioId: number | null,
  campos: Partial<Record<CampoEtp | "omissoes", string>>,
) {
  return emTransacao(async (executar) => {
    const [processo] = (await executar(
      "select id from processos_compra where prefeitura_id = $1 and numero_processo = $2",
      [prefeituraId, numeroProcesso],
    )) as Array<{ id: number }>;
    if (!processo) return { erro: "processo-nao-encontrado" as const };

    const [existente] = (await executar(
      "select id, status from etps where prefeitura_id = $1 and processo_id = $2 for update",
      [prefeituraId, processo.id],
    )) as Array<{ id: number; status: EtpStatus }>;
    if (existente?.status === "concluido") return { erro: "ja-concluido" as const };

    if (!existente) {
      await executar(
        "insert into etps (prefeitura_id, processo_id, criado_por_id) values ($1, $2, $3)",
        [prefeituraId, processo.id, usuarioId],
      );
    }

    const nomes = [...camposDoEtp, "omissoes" as const].filter((campo) => campos[campo] !== undefined);
    if (nomes.length) {
      const atribuicoes = nomes.map((campo, indice) => {
        const coluna = campo === "omissoes" ? "omissoes" : colunas[campo];
        return `${coluna} = $${indice + 3}`;
      });
      await executar(
        `update etps set ${atribuicoes.join(", ")}, atualizado_em = now()
         where prefeitura_id = $1 and processo_id = $2`,
        [prefeituraId, processo.id, ...nomes.map((campo) => String(campos[campo] ?? ""))],
      );
    }
    return { ok: true as const };
  });
}

/**
 * Congela o que o portal apurou e fecha o estudo. Depois disso, editar uma
 * cotacao nao muda mais o ETP — que e exatamente o ponto de um documento
 * assinado e juntado ao processo.
 */
export async function concluirEtp(
  prefeituraId: number,
  numeroProcesso: string,
  usuarioId: number | null,
  instantaneo: InstantaneoEtp,
) {
  const linha = await consultarUm<{ id: number }>(
    `update etps e set status = 'concluido'::etp_status, instantaneo = $3::jsonb,
            concluido_por_id = $4, concluido_em = now(), atualizado_em = now()
     from processos_compra p
     where p.id = e.processo_id and e.prefeitura_id = $1 and p.numero_processo = $2 and e.status = 'rascunho'
     returning e.id`,
    [prefeituraId, numeroProcesso, JSON.stringify(instantaneo), usuarioId],
  );
  return Boolean(linha);
}

export async function reabrirEtp(prefeituraId: number, numeroProcesso: string) {
  const linha = await consultarUm<{ id: number }>(
    `update etps e set status = 'rascunho'::etp_status, instantaneo = null,
            concluido_por_id = null, concluido_em = null, atualizado_em = now()
     from processos_compra p
     where p.id = e.processo_id and e.prefeitura_id = $1 and p.numero_processo = $2 and e.status = 'concluido'
     returning e.id`,
    [prefeituraId, numeroProcesso],
  );
  return Boolean(linha);
}
