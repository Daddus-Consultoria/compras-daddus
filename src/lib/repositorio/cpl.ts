import type { ProcessoStatus } from "@/lib/compras";
import { faseDoTramite, origemDoTramite, type Tramite, type TramiteTipo } from "@/lib/contratos";
import { consultar, emTransacao } from "@/lib/db";
import { dataBrParaIso } from "@/lib/compras";

export async function tramitesDoProcesso(prefeituraId: number, numero: string) {
  return consultar<Tramite>(
    `select t.id, t.tipo, to_char(t.data_tramite, 'DD/MM/YYYY') as data, t.documento, t.observacao,
            u.nome as usuario,
            to_char(t.criado_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') as quando
     from tramites_cpl t
     join processos_compra p on p.id = t.processo_id
     left join usuarios u on u.id = t.usuario_id
     where p.prefeitura_id = $1 and p.numero_processo = $2
     order by t.criado_em desc`,
    [prefeituraId, numero],
  );
}

export type DadosTramite = {
  tipo: TramiteTipo;
  data: string | null;
  documento: string;
  observacao: string;
};

/**
 * Registra o fato na CPL e, quando o fato move o processo, move junto na mesma
 * transacao. A fase nunca e escolhida a parte: ela e consequencia do que a
 * comissao registrou, e o historico guarda as duas coisas ligadas.
 */
export async function registrarTramite(prefeituraId: number, numero: string, usuarioId: number | null, dados: DadosTramite) {
  return emTransacao(async (executar) => {
    const [processo] = (await executar(
      "select id, status from processos_compra where prefeitura_id = $1 and numero_processo = $2 for update",
      [prefeituraId, numero],
    )) as Array<{ id: number; status: ProcessoStatus }>;
    if (!processo) return { erro: "processo-nao-encontrado" as const };

    const aceitas = origemDoTramite[dados.tipo];
    if (!aceitas.includes(processo.status)) {
      return { erro: "fase-incompativel" as const, status: processo.status };
    }

    await executar(
      `insert into tramites_cpl (processo_id, tipo, data_tramite, documento, observacao, usuario_id)
       values ($1, $2::tramite_cpl_tipo, coalesce($3::date, current_date), $4, $5, $6)`,
      [processo.id, dados.tipo, dataBrParaIso(dados.data), dados.documento, dados.observacao, usuarioId],
    );

    const destino = faseDoTramite[dados.tipo];
    if (destino) {
      await executar(
        "update processos_compra set status = $2::processo_status, atualizado_em = now() where id = $1",
        [processo.id, destino],
      );
      await executar(
        `insert into historico_status (processo_id, de, para, usuario_id, observacao)
         values ($1, $2::processo_status, $3::processo_status, $4, $5)`,
        [processo.id, processo.status, destino, usuarioId, dados.observacao],
      );
    }

    return { status: destino ?? processo.status };
  });
}
