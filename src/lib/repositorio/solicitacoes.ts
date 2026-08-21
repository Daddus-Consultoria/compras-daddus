import type { Secretaria, SolicitacaoStatus } from "@/lib/compras";
import { consultar } from "@/lib/db";

export type Solicitacao = {
  id: string;
  objeto: string;
  justificativa: string;
  secretaria: Secretaria | null;
  status: SolicitacaoStatus;
  createdAt: string;
};

type LinhaSolicitacao = {
  id: number;
  objeto: string;
  justificativa: string;
  secretaria: Secretaria | null;
  status: SolicitacaoStatus;
  criado_em: Date;
};

const selecao = `select s.id, s.objeto, s.justificativa, sec.chave as secretaria, s.status, s.criado_em
                 from solicitacoes s left join secretarias sec on sec.id = s.secretaria_id`;

function paraSolicitacao(linha: LinhaSolicitacao): Solicitacao {
  return {
    id: String(linha.id),
    objeto: linha.objeto,
    justificativa: linha.justificativa,
    secretaria: linha.secretaria,
    status: linha.status,
    createdAt: linha.criado_em.toISOString(),
  };
}

export async function listarSolicitacoes(prefeituraId: number, secretariaId: number | null = null) {
  // Secretario enxerga apenas o que a propria secretaria enviou.
  const filtro = secretariaId === null ? "where s.prefeitura_id = $1" : "where s.prefeitura_id = $1 and s.secretaria_id = $2";
  const valores = secretariaId === null ? [prefeituraId] : [prefeituraId, secretariaId];
  const linhas = await consultar<LinhaSolicitacao>(`${selecao} ${filtro} order by s.criado_em desc`, valores);
  return linhas.map(paraSolicitacao);
}
