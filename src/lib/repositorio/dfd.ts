import type { SolicitacaoStatus } from "@/lib/compras";
import type { Dfd, FonteImportacao, ItemDemanda, ItemImportado, Prioridade, TipoFonte } from "@/lib/dfd";
import { consultar, consultarUm, emTransacao } from "@/lib/db";
import { dataBrParaIso } from "@/lib/compras";

type LinhaDfd = Omit<Dfd, "itens"> & { itens: ItemDemanda[] };

// As datas saem formatadas do proprio Postgres, como no resto do portal.
const selecao = `
  select s.id, s.numero, s.objeto, s.justificativa,
         sec.chave as secretaria, coalesce(sec.nome, 'Sem secretaria') as "secretariaNome",
         s.status, s.prioridade,
         to_char(s.data_pretendida, 'DD/MM/YYYY') as "dataPretendida",
         s.previsao_pca as "previsaoPca", s.resultados, s.vinculacao, s.responsavel,
         s.origem_itens as "origemItens",
         p.numero_processo as processo,
         autor.nome as autor,
         to_char(s.criado_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') as "criadoEm",
         coalesce((select jsonb_agg(jsonb_build_object(
                     'id', i.id,
                     'item', i.numero_item,
                     'descricao', i.descricao,
                     'unidade', i.unidade,
                     'quantidade', i.quantidade,
                     'memoria', i.memoria)
                     order by i.numero_item)
                   from itens_solicitacao i where i.solicitacao_id = s.id), '[]'::jsonb) as itens
  from solicitacoes s
  left join secretarias sec on sec.id = s.secretaria_id
  left join processos_compra p on p.id = s.processo_id
  left join usuarios autor on autor.id = s.criado_por_id`;

function paraDfd(linha: LinhaDfd): Dfd {
  return {
    ...linha,
    numero: linha.numero ?? String(linha.id),
    itens: (linha.itens ?? []).map((item) => ({ ...item, quantidade: Number(item.quantidade) })),
  };
}

export async function listarDfds(prefeituraId: number, secretariaId: number | null = null) {
  const filtro = secretariaId === null ? "" : " and s.secretaria_id = $2";
  const valores = secretariaId === null ? [prefeituraId] : [prefeituraId, secretariaId];
  const linhas = await consultar<LinhaDfd>(
    `${selecao} where s.prefeitura_id = $1${filtro} order by s.criado_em desc`,
    valores,
  );
  return linhas.map(paraDfd);
}

export async function lerDfd(prefeituraId: number, numero: string) {
  const linha = await consultarUm<LinhaDfd>(`${selecao} where s.prefeitura_id = $1 and s.numero = $2`, [prefeituraId, numero]);
  return linha ? paraDfd(linha) : null;
}

/** A demanda que originou um processo, quando ele nasceu de uma. Base do ETP. */
export async function dfdDoProcesso(prefeituraId: number, numeroProcesso: string) {
  const linha = await consultarUm<LinhaDfd>(
    `${selecao} where s.prefeitura_id = $1 and p.numero_processo = $2 order by s.criado_em limit 1`,
    [prefeituraId, numeroProcesso],
  );
  return linha ? paraDfd(linha) : null;
}

export type DadosDfd = {
  objeto: string;
  justificativa: string;
  prioridade: Prioridade;
  dataPretendida: string | null;
  previsaoPca: boolean;
  resultados: string;
  vinculacao: string;
  responsavel: string;
  origemItens: string;
  itens: Array<{ item: number; descricao: string; unidade: string; quantidade: number; memoria: string }>;
};

export async function criarDfd(
  prefeituraId: number,
  usuarioId: number | null,
  secretaria: string,
  dados: DadosDfd,
) {
  const ano = new Date().getFullYear();
  // Mesma numeracao dos pedidos: sequencial por prefeitura e ano, com o indice
  // decidindo a unicidade e uma nova tentativa quando duas demandas colidem.
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    try {
      return await emTransacao(async (executar) => {
        const [linhaSecretaria] = (await executar(
          "select id, ativa from secretarias where prefeitura_id = $1 and chave = $2",
          [prefeituraId, secretaria],
        )) as Array<{ id: number; ativa: boolean }>;
        if (!linhaSecretaria) return { erro: "secretaria-nao-encontrada" as const };
        if (!linhaSecretaria.ativa) return { erro: "secretaria-inativa" as const };

        const [{ proximo }] = (await executar(
          `select coalesce(max(substring(numero from '^\\d+')::int), 0) + 1 as proximo
           from solicitacoes where prefeitura_id = $1 and numero like $2`,
          [prefeituraId, `%/${ano}`],
        )) as Array<{ proximo: number }>;
        const numero = `${String(proximo).padStart(4, "0")}/${ano}`;

        const [criado] = (await executar(
          `insert into solicitacoes
             (prefeitura_id, numero, objeto, justificativa, secretaria_id, criado_por_id,
              prioridade, data_pretendida, previsao_pca, resultados, vinculacao, responsavel, origem_itens)
           values ($1, $2, $3, $4, $5, $6, $7::demanda_prioridade, $8::date, $9, $10, $11, $12, $13)
           returning id`,
          [
            prefeituraId, numero, dados.objeto, dados.justificativa, linhaSecretaria.id, usuarioId,
            dados.prioridade, dataBrParaIso(dados.dataPretendida), dados.previsaoPca,
            dados.resultados, dados.vinculacao, dados.responsavel, dados.origemItens,
          ],
        )) as Array<{ id: number }>;

        await gravarItens(executar, criado.id, dados.itens);
        return { id: criado.id, numero };
      });
    } catch (erro) {
      const codigo = (erro as { code?: string }).code;
      if (codigo === "23505" && tentativa < 2) continue;
      throw erro;
    }
  }
  return { erro: "numero-em-disputa" as const };
}

type Executar = (sql: string, valores?: unknown[]) => Promise<Record<string, unknown>[]>;

/** Reconcilia a lista de itens pelo numero, como o lote e o contrato ja fazem. */
async function gravarItens(executar: Executar, solicitacaoId: number, itens: DadosDfd["itens"]) {
  await executar("delete from itens_solicitacao where solicitacao_id = $1 and not (numero_item = any($2::int[]))", [
    solicitacaoId,
    itens.map((item) => item.item),
  ]);
  for (const item of itens) {
    await executar(
      `insert into itens_solicitacao (solicitacao_id, numero_item, descricao, unidade, quantidade, memoria)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (solicitacao_id, numero_item)
       do update set descricao = excluded.descricao, unidade = excluded.unidade,
                     quantidade = excluded.quantidade, memoria = excluded.memoria`,
      [solicitacaoId, item.item, item.descricao, item.unidade, item.quantidade, item.memoria],
    );
  }
}

/**
 * Edita a demanda enquanto ela nao virou processo. Depois disso o DFD e peca do
 * processo administrativo: mexer nele reescreveria a origem de um lote que ja
 * esta em cotacao.
 */
export async function atualizarDfd(prefeituraId: number, numero: string, dados: DadosDfd) {
  return emTransacao(async (executar) => {
    const [dfd] = (await executar(
      "select id, status, processo_id from solicitacoes where prefeitura_id = $1 and numero = $2 for update",
      [prefeituraId, numero],
    )) as Array<{ id: number; status: SolicitacaoStatus; processo_id: number | null }>;
    if (!dfd) return { erro: "nao-encontrado" as const };
    if (dfd.status !== "pendente" || dfd.processo_id) return { erro: "ja-em-processo" as const, status: dfd.status };

    await executar(
      `update solicitacoes set objeto = $2, justificativa = $3, prioridade = $4::demanda_prioridade,
              data_pretendida = $5::date, previsao_pca = $6, resultados = $7, vinculacao = $8,
              responsavel = $9, origem_itens = $10
       where id = $1`,
      [
        dfd.id, dados.objeto, dados.justificativa, dados.prioridade, dataBrParaIso(dados.dataPretendida),
        dados.previsaoPca, dados.resultados, dados.vinculacao, dados.responsavel, dados.origemItens,
      ],
    );
    await gravarItens(executar, dfd.id, dados.itens);
    return { ok: true as const };
  });
}

/**
 * De onde a secretaria pode puxar itens ja digitados: uma demanda anterior, um
 * processo em que ela lancou quantidade ou — a melhor base — o que ela de fato
 * consumiu de um contrato.
 */
export async function fontesDeImportacao(prefeituraId: number, secretariaId: number) {
  const [demandas, processos, contratos] = await Promise.all([
    consultar<FonteImportacao>(
      `select 'dfd'::text as tipo, s.numero as id, s.objeto as rotulo,
              coalesce(nullif(s.responsavel, ''), 'Demanda da secretaria') as detalhe,
              to_char(s.criado_em, 'DD/MM/YYYY') as quando,
              (select count(*)::int from itens_solicitacao i where i.solicitacao_id = s.id) as itens
       from solicitacoes s
       where s.prefeitura_id = $1 and s.secretaria_id = $2 and s.numero is not null
         and exists (select 1 from itens_solicitacao i where i.solicitacao_id = s.id)
       order by s.criado_em desc limit 15`,
      [prefeituraId, secretariaId],
    ),
    consultar<FonteImportacao>(
      `select 'processo'::text as tipo, p.numero_processo as id, p.objeto as rotulo,
              'Quantidade lancada por esta secretaria' as detalhe,
              to_char(p.criado_em, 'DD/MM/YYYY') as quando,
              count(distinct il.id)::int as itens
       from processos_compra p
       join itens_lote il on il.processo_id = p.id
       join item_quantidades q on q.item_id = il.id and q.secretaria_id = $2 and q.quantidade > 0
       where p.prefeitura_id = $1
       group by p.id order by p.criado_em desc limit 15`,
      [prefeituraId, secretariaId],
    ),
    consultar<FonteImportacao>(
      `select 'contrato'::text as tipo, c.numero as id,
              c.fornecedor || ' — ' || coalesce(nullif(c.objeto, ''), 'sem objeto informado') as rotulo,
              'Consumo autorizado desta secretaria' as detalhe,
              to_char(c.criado_em, 'DD/MM/YYYY') as quando,
              count(distinct ic.id)::int as itens
       from contratos c
       join itens_contrato ic on ic.contrato_id = c.id
       join itens_pedido ip on ip.item_contrato_id = ic.id
       join pedidos_fornecimento pf on pf.id = ip.pedido_id
       where c.prefeitura_id = $1 and pf.secretaria_id = $2 and pf.status = 'autorizado'
       group by c.id order by c.criado_em desc limit 15`,
      [prefeituraId, secretariaId],
    ),
  ]);
  return [...demandas, ...processos, ...contratos];
}

export async function itensDaFonte(prefeituraId: number, secretariaId: number, tipo: TipoFonte, id: string) {
  if (tipo === "dfd") {
    return consultar<ItemImportado>(
      `select i.descricao, i.unidade, i.quantidade, i.memoria
       from itens_solicitacao i
       join solicitacoes s on s.id = i.solicitacao_id
       where s.prefeitura_id = $1 and s.secretaria_id = $2 and s.numero = $3
       order by i.numero_item`,
      [prefeituraId, secretariaId, id],
    ).then(numerar);
  }
  if (tipo === "processo") {
    return consultar<ItemImportado>(
      `select il.especificacao as descricao, il.unidade, q.quantidade,
              'Quantidade lancada por esta secretaria no processo PE ' || p.numero_processo || '.' as memoria
       from itens_lote il
       join processos_compra p on p.id = il.processo_id
       join item_quantidades q on q.item_id = il.id and q.secretaria_id = $2
       where p.prefeitura_id = $1 and p.numero_processo = $3 and q.quantidade > 0
       order by il.numero_item`,
      [prefeituraId, secretariaId, id],
    ).then(numerar);
  }
  return consultar<ItemImportado>(
    `select ic.descricao, ic.unidade, sum(ip.quantidade) as quantidade,
            'Consumo autorizado desta secretaria no contrato ' || c.numero || ': ' ||
              rtrim(trim(to_char(sum(ip.quantidade), 'FM999999990.999')), '.') || ' ' || ic.unidade || '.' as memoria
     from itens_contrato ic
     join contratos c on c.id = ic.contrato_id
     join itens_pedido ip on ip.item_contrato_id = ic.id
     join pedidos_fornecimento pf on pf.id = ip.pedido_id
     where c.prefeitura_id = $1 and pf.secretaria_id = $2 and c.numero = $3 and pf.status = 'autorizado'
     group by ic.id, c.numero
     order by ic.numero_item`,
    [prefeituraId, secretariaId, id],
  ).then(numerar);
}

function numerar(itens: ItemImportado[]) {
  return itens.map((item) => ({ ...item, quantidade: Number(item.quantidade) }));
}
