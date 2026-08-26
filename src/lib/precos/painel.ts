/**
 * Painel de Precos do Governo Federal, lido na origem.
 *
 * A API e a de dados abertos do Compras.gov.br (`dadosabertos.compras.gov.br`),
 * publica e sem chave. Ela e a fonte que o art. 5, I e II da IN SEGES/ME
 * 65/2021 poe no topo da ordem de preferencia da pesquisa de precos — e ate
 * aqui era consultada a mao, noutra aba, com o valor retranscrito no formulario.
 *
 * Duas caracteristicas da API mandam no desenho daqui:
 *
 * 1. Ela consulta por CODIGO (CATMAT para material, CATSER para servico), nunca
 *    por texto. Por isso o item do lote precisa estar amarrado a um codigo, e
 *    por isso existe a copia local do catalogo (ver db/migrations/009).
 * 2. Ela devolve compras ja realizadas, com orgao, data, fornecedor e o preco
 *    efetivamente praticado. Nao e cotacao de fornecedor: e preco publicado.
 *
 * Nada aqui calcula nem arredonda. O que a origem publicou vira cotacao como
 * esta; a analise critica (excluir inexequivel ou excessivo) continua sendo de
 * quem conduz o processo, com a justificativa que o mapa ja registra.
 */

const BASE = "https://dadosabertos.compras.gov.br";

/** Teto por consulta. O Painel devolve centenas de compras para item comum, e a tela nao serve para ler todas. */
const MAXIMO = 50;

export type TipoCatalogo = "material" | "servico";

export type PrecoPublico = {
  /** Identificador da compra e do item dentro dela, no proprio Painel. Vai para o campo `documento` da cotacao. */
  documento: string;
  valorUnitario: number;
  /** Data do resultado da compra, no formato DD/MM/AAAA. */
  dataCotacao: string;
  orgao: string;
  municipio: string | null;
  estado: string | null;
  fornecedor: string | null;
  marca: string | null;
  unidadeFornecimento: string | null;
  quantidade: number | null;
  descricaoItem: string;
};

type LinhaPainel = Record<string, unknown>;

const texto = (valor: unknown) => {
  const limpo = String(valor ?? "").trim();
  return limpo && limpo !== "null" ? limpo : null;
};

const numero = (valor: unknown) => {
  const convertido = Number(valor);
  return Number.isFinite(convertido) ? convertido : null;
};

/** ISO (2026-07-21) para o DD/MM/AAAA que o resto do sistema usa. */
const dataBr = (valor: unknown) => {
  const iso = String(valor ?? "").slice(0, 10);
  const partes = iso.split("-");
  if (partes.length !== 3) return null;
  const [ano, mes, dia] = partes;
  return `${dia}/${mes}/${ano}`;
};

/**
 * Identificador da linha: a compra MAIS o item dentro dela.
 *
 * Material ja publica os dois juntos em `idCompraItem` (o
 * `0200010590063202500004` termina no item 4). Servico nao publica esse campo,
 * e cair so no `idCompra` colapsava a lista: numa consulta ao CATSER 25542, 50
 * precos publicados viravam 7 documentos. Como o `documento` e a chave que diz
 * o que ja foi importado, importar um preco marcava como importados todos os
 * outros da mesma compra — o mapa ficava sem 43 dos 50 precos que a origem
 * publicou, sem nada na tela dizendo por que.
 */
const documentoDaCompra = (linha: LinhaPainel) => {
  const compraComItem = texto(linha.idCompraItem);
  if (compraComItem) return compraComItem;

  const compra = texto(linha.idCompra);
  if (!compra) return "";

  const item = texto(linha.numeroItemCompra);
  return item ? `${compra}-${item}` : compra;
};

const paraPreco = (linha: LinhaPainel): PrecoPublico | null => {
  const valorUnitario = numero(linha.precoUnitario);
  const dataCotacao = dataBr(linha.dataResultado ?? linha.dataCompra);

  // Sem preco ou sem data a linha nao vira cotacao: as duas coisas sao exigidas
  // no formulario, e inventar qualquer uma delas seria publicar dado que a
  // origem nao publicou.
  if (valorUnitario === null || valorUnitario <= 0 || !dataCotacao) return null;

  const orgao = texto(linha.nomeOrgao) ?? texto(linha.nomeUasg);
  if (!orgao) return null;

  return {
    documento: documentoDaCompra(linha),
    valorUnitario,
    dataCotacao,
    orgao,
    municipio: texto(linha.municipio),
    estado: texto(linha.estado),
    fornecedor: texto(linha.nomeFornecedor),
    marca: texto(linha.marca),
    // Os dois modulos da mesma API nomeiam a unidade de formas diferentes, e
    // foi conferido linha a linha: material publica `siglaUnidadeFornecimento`
    // (`siglaUnidadeMedida` vem nula em todas as linhas), servico publica
    // `siglaUnidadeMedida` (o par `...Fornecimento` nem existe na resposta).
    // Ler so o primeiro par deixava toda cotacao de servico sem unidade — e
    // unidade ausente e lida como "confere" pela tela, que assim engolia calada
    // o preco publicado noutra unidade que o aviso existe para pegar.
    unidadeFornecimento:
      texto(linha.siglaUnidadeFornecimento) ??
      texto(linha.siglaUnidadeMedida) ??
      texto(linha.nomeUnidadeFornecimento) ??
      texto(linha.nomeUnidadeMedida),
    quantidade: numero(linha.quantidade),
    descricaoItem: texto(linha.descricaoItem) ?? texto(linha.descricaoDetalhadaItem) ?? "",
  };
};

/**
 * A descricao que vai para a cotacao.
 *
 * O campo `descricao` de uma cotacao e "de onde veio o preco". Para o Painel, a
 * resposta util e quem comprou e onde — "UNESP Araraquara/SP" diz mais sobre a
 * comparabilidade do preco do que o numero da compra.
 */
export const origemDoPreco = (preco: PrecoPublico) => {
  const lugar = [preco.municipio, preco.estado].filter(Boolean).join("/");
  return lugar ? `${preco.orgao} (${lugar})` : preco.orgao;
};

export type ConsultaPrecos = {
  codigo: number;
  tipo: TipoCatalogo;
  /** Recorta por UF, quando a comparacao regional importa. */
  estado?: string | null;
  /** Janela da compra. Sem ela, a API devolve historico antigo demais para servir de referencia. */
  desde?: string | null;
  ate?: string | null;
};

/**
 * Consulta os precos praticados para um codigo de catalogo.
 *
 * Devolve lista vazia — e nao excecao — quando a origem nao tem nada para o
 * codigo: item novo ou pouco comprado e situacao normal, nao erro. Falha de
 * rede, essa sim, sobe: a tela precisa distinguir "nao ha preco publicado" de
 * "nao consegui perguntar".
 */
export async function consultarPrecosPublicos(consulta: ConsultaPrecos): Promise<PrecoPublico[]> {
  const rota = consulta.tipo === "material"
    ? "/modulo-pesquisa-preco/1_consultarMaterial"
    : "/modulo-pesquisa-preco/3_consultarServico";

  const parametros = new URLSearchParams({
    pagina: "1",
    tamanhoPagina: String(MAXIMO),
  });

  // Material e servico nomeiam o parametro do codigo de forma diferente:
  // conferido no swagger da propria API.
  if (consulta.tipo === "material") {
    parametros.set("tipo", "codigoItemCatalogo");
    parametros.set("codigo", String(consulta.codigo));
  } else {
    parametros.set("codigoItemCatalogo", String(consulta.codigo));
  }

  if (consulta.estado) parametros.set("estado", consulta.estado);
  if (consulta.desde) parametros.set("dataCompraInicio", consulta.desde);
  if (consulta.ate) parametros.set("dataCompraFim", consulta.ate);

  const resposta = await fetch(`${BASE}${rota}?${parametros}`, {
    signal: AbortSignal.timeout(30_000),
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!resposta.ok) {
    throw new Error(`O Painel de Precos respondeu ${resposta.status}.`);
  }

  const corpo = (await resposta.json()) as { resultado?: LinhaPainel[] };
  const precos = (corpo.resultado ?? []).map(paraPreco).filter((preco): preco is PrecoPublico => preco !== null);

  // Do menor para o maior: quem le um mapa procura a ponta de baixo primeiro, e
  // e nela que mora o preco inexequivel que precisa ser olhado com desconfianca.
  return precos.sort((a, b) => a.valorUnitario - b.valorUnitario);
}
