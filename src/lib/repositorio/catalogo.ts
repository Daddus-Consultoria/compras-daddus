import { consultar, consultarUm } from "@/lib/db";
import type { TipoCatalogo } from "@/lib/precos/painel";

/**
 * Busca no catalogo CATMAT/CATSER guardado localmente.
 *
 * A copia existe porque a API de origem nao busca por texto — nem exato: foi
 * conferido que `descricaoItem` devolve zero para "COPO DESCARTAVEL" mesmo
 * sendo a descricao literal de um item. Ver db/migrations/009.
 */

export type ItemCatalogo = {
  codigo: number;
  tipo: TipoCatalogo;
  descricao: string;
  classe: string | null;
  pdm: string | null;
};

type LinhaCatalogo = {
  codigo_item: number;
  tipo: TipoCatalogo;
  descricao: string;
  nome_classe: string | null;
  nome_pdm: string | null;
};

const paraItem = (linha: LinhaCatalogo): ItemCatalogo => ({
  codigo: linha.codigo_item,
  tipo: linha.tipo,
  descricao: linha.descricao,
  classe: linha.nome_classe,
  pdm: linha.nome_pdm,
});

/**
 * Duas buscas somadas, porque uma so nao acha o que a pessoa procura:
 *
 * - `websearch_to_tsquery` acha por palavra, com radical em portugues, e ignora
 *   a ordem — e o que atende quem digita "sulfite papel".
 * - o `ILIKE` acha o trecho literal, e e o que atende quem cola um pedaco da
 *   especificacao ou digita um prefixo curto ("papel su") que ainda nao formou
 *   palavra inteira.
 *
 * O `rank` poe o casamento por palavra na frente; o desempate e pelo codigo,
 * para a mesma busca devolver sempre a mesma ordem.
 */
export async function buscarNoCatalogo(
  termo: string,
  opcoes: { tipo?: TipoCatalogo | null; limite?: number } = {},
): Promise<ItemCatalogo[]> {
  const limpo = termo.trim();
  if (limpo.length < 3) return [];

  const limite = Math.min(Math.max(opcoes.limite ?? 20, 1), 50);
  const linhas = await consultar<LinhaCatalogo>(
    `select codigo_item, tipo, descricao, nome_classe, nome_pdm
       from catalogo_itens
      where ativo
        and ($2::text is null or tipo = $2)
        and (to_tsvector('portuguese', descricao) @@ websearch_to_tsquery('portuguese', $1)
             or descricao ilike '%' || $1 || '%')
      order by ts_rank(to_tsvector('portuguese', descricao),
                       websearch_to_tsquery('portuguese', $1)) desc,
               length(descricao),
               codigo_item
      limit $3`,
    [limpo, opcoes.tipo ?? null, limite],
  );

  return linhas.map(paraItem);
}

export async function lerItemDoCatalogo(codigo: number, tipo: TipoCatalogo) {
  const linha = await consultarUm<LinhaCatalogo>(
    `select codigo_item, tipo, descricao, nome_classe, nome_pdm
       from catalogo_itens where codigo_item = $1 and tipo = $2`,
    [codigo, tipo],
  );
  return linha ? paraItem(linha) : null;
}

/** Quantos itens ha e de quando e a coleta — a tela precisa saber se o catalogo esta vazio. */
export async function situacaoDoCatalogo() {
  const linha = await consultarUm<{ total: number; coletado_em: string | null }>(
    `select count(*)::int as total,
            to_char(max(coletado_em) at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') as coletado_em
       from catalogo_itens`,
  );
  return { total: linha?.total ?? 0, coletadoEm: linha?.coletado_em ?? null };
}
