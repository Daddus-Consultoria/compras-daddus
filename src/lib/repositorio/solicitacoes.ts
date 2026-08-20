import type { Secretaria, SolicitacaoStatus } from "@/lib/compras";
import { consultar, consultarUm } from "@/lib/db";

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

export async function listarSolicitacoes() {
  const linhas = await consultar<LinhaSolicitacao>(`${selecao} order by s.criado_em desc`);
  return linhas.map(paraSolicitacao);
}

export async function criarSolicitacao(dados: { objeto: string; justificativa: string; secretaria: string }) {
  const linha = await consultarUm<LinhaSolicitacao>(
    `with nova as (
       insert into solicitacoes (objeto, justificativa, secretaria_id)
       values ($1, $2, (select id from secretarias where chave = $3))
       returning id, objeto, justificativa, secretaria_id, status, criado_em
     )
     select nova.id, nova.objeto, nova.justificativa, sec.chave as secretaria, nova.status, nova.criado_em
     from nova left join secretarias sec on sec.id = nova.secretaria_id`,
    [dados.objeto, dados.justificativa, dados.secretaria],
  );
  return paraSolicitacao(linha as LinhaSolicitacao);
}
