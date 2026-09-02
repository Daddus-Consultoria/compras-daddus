import type { Papel } from "@/lib/auth/papeis";
import type { Contrato, ItemContrato } from "@/lib/contratos";
import { contratosDemo } from "@/lib/contratos";

/**
 * Execucao do contrato, em quatro atos: a secretaria pede, o Setor de Compras
 * confere, a despesa e empenhada e so entao o ordenador autoriza. E a
 * autorizacao que baixa o saldo, porque autorizar despesa e ato do ordenador —
 * o Compras instrui. O empenho vem antes dela porque "e vedada a realizacao de
 * despesa sem previo empenho" (Lei 4.320/64, art. 60).
 *
 * Nenhum numero de saldo e guardado. Saldo e sempre "o que foi contratado menos
 * o que foi autorizado", apurado na leitura — assim ele nao tem como divergir
 * dos pedidos que o formaram.
 */

/** Os valores sao os mesmos do enum pedido_status no banco. */
export type PedidoStatus = "pendente" | "conferido" | "empenhado" | "autorizado" | "recusado" | "cancelado" | "estornado";

export const pedidoStatusLabels: Record<PedidoStatus, string> = {
  pendente: "Aguardando conferencia",
  conferido: "Aguardando empenho",
  empenhado: "Aguardando autorizacao",
  autorizado: "Autorizado",
  recusado: "Recusado",
  cancelado: "Cancelado",
  estornado: "Estornado",
};

export const pedidoStatusDescricoes: Record<PedidoStatus, string> = {
  pendente: "A secretaria pediu; o Setor de Compras ainda nao conferiu. Nao baixa saldo.",
  conferido: "Saldo e contrato conferidos; esperando o numero da nota de empenho. Nao baixa saldo, mas segura a quantidade.",
  empenhado: "Despesa empenhada; esperando o autorizo do ordenador. Nao baixa saldo do contrato, mas ja compromete o empenho.",
  autorizado: "Fornecimento liberado pelo ordenador. E o unico estado que consome saldo do contrato.",
  recusado: "O ordenador negou a despesa, com motivo registrado.",
  cancelado: "Retirado antes da autorizacao: pela secretaria que pediu, ou devolvido pelo Setor de Compras com motivo.",
  estornado: "Autorizacao desfeita; a quantidade volta ao saldo, com motivo registrado.",
};

export const pedidoStatusEmOrdem: PedidoStatus[] = ["pendente", "conferido", "empenhado", "autorizado", "recusado", "cancelado", "estornado"];

export function pedidoTone(status: PedidoStatus) {
  if (status === "autorizado") return "green";
  // Amarelo enquanto o pedido espera a instrucao (conferencia e empenho); azul
  // quando o que falta e uma decisao de autoridade. Estornado divide o azul por
  // falta de tom proprio, e o rotulo ao lado diz qual dos dois e.
  if (status === "pendente" || status === "conferido") return "yellow";
  if (status === "empenhado" || status === "estornado") return "blue";
  return "gray";
}

/** O saldo cai na autorizacao e volta no estorno; os demais estados nao o tocam. */
export function consomeSaldo(status: PedidoStatus) {
  return status === "autorizado";
}

/**
 * Estados que ainda podem virar autorizacao. A quantidade deles nao caiu do
 * saldo, mas tambem nao esta livre: se `conferido` ficasse de fora daqui, o
 * pedido perderia a reserva entre a conferencia e o autorizo, e duas
 * secretarias tomariam o mesmo saldo.
 */
export function reservaSaldo(status: PedidoStatus) {
  return status === "pendente" || status === "conferido" || status === "empenhado";
}

export type ItemPedido = {
  id: number;
  /** Item do contrato que esta sendo consumido. */
  itemContratoId: number;
  /** Numero do item dentro do contrato, para casar com o mapa e a nota. */
  item: number;
  descricao: string;
  unidade: string;
  quantidade: number;
  valorUnitario: number;
};

export type Pedido = {
  id: number;
  numero: string;
  contrato: string;
  fornecedor: string;
  /** Chave da secretaria que pediu; e por ela que o secretario ve so o que e seu. */
  secretaria: string;
  secretariaNome: string;
  justificativa: string;
  status: PedidoStatus;
  /** Numero da nota de empenho vinculada, vazio enquanto nao ha uma. */
  empenho: string;
  empenhoId: number | null;
  entregaPrevista: string | null;
  motivoDecisao: string;
  solicitante: string | null;
  /** Id de quem abriu: e por ele que a prefeitura exige ordenador diferente do solicitante. */
  criadoPorId: number | null;
  criadoEm: string;
  conferente: string | null;
  conferidoEm: string | null;
  decisor: string | null;
  decididoEm: string | null;
  itens: ItemPedido[];
};

export function valorDoPedido(pedido: Pick<Pedido, "itens">) {
  return pedido.itens.reduce((total, item) => total + Number(item.quantidade || 0) * Number(item.valorUnitario || 0), 0);
}

/**
 * Quem autoriza a despesa.
 *
 * O ordenador e o secretario da pasta ate o limite de alcada da prefeitura, e
 * o gabinete acima dele — a delegacao de ordenacao vem de decreto, e o decreto
 * costuma delegar ate um valor. `limite` nulo e "sem teto": o secretario
 * autoriza qualquer valor da propria pasta.
 *
 * O gabinete autoriza em qualquer faixa; a alcada e piso de autoridade, nao
 * faixa exclusiva.
 */
export type Alcada = "secretaria" | "gabinete";

export function alcadaDoPedido(valor: number, limite: number | null): Alcada {
  if (limite === null) return "secretaria";
  return valor > limite ? "gabinete" : "secretaria";
}

/** So o necessario da sessao: a regra nao precisa saber o resto de quem esta logado. */
export type QuemDecide = {
  id: number;
  papel: Papel;
  ordenador: boolean;
  secretariaChave: string | null;
};

export type RegrasDeAutorizacao = {
  /** Teto do secretario, em reais. Nulo = sem teto. */
  limite: number | null;
  /** Quando ligada, quem abriu o pedido nao o autoriza. */
  exigeOrdenadorDistinto: boolean;
};

export type Impedimento = "nao-e-ordenador" | "outra-secretaria" | "acima-da-alcada" | "mesma-pessoa";

export const impedimentoLabels: Record<Impedimento, string> = {
  "nao-e-ordenador": "Autorizar a despesa cabe ao ordenador designado — o secretario da pasta ou o gabinete.",
  "outra-secretaria": "O secretario autoriza a despesa da propria pasta.",
  "acima-da-alcada": "O valor passa da alcada do secretario: este pedido e do gabinete.",
  "mesma-pessoa": "Quem abriu o pedido nao o autoriza. Outro ordenador da pasta, ou o gabinete, decide.",
};

/**
 * Por que esta pessoa nao pode autorizar este pedido — ou `null` quando pode.
 * Devolve o motivo, e nao um booleano, porque a tela e a API precisam dizer
 * qual das quatro travas pegou.
 */
export function impedimentoParaAutorizar(
  quem: QuemDecide,
  pedido: Pick<Pedido, "secretaria" | "criadoPorId" | "itens">,
  regras: RegrasDeAutorizacao,
): Impedimento | null {
  if (!quem.ordenador || (quem.papel !== "secretario" && quem.papel !== "gabinete")) return "nao-e-ordenador";
  if (quem.papel === "secretario") {
    if (quem.secretariaChave !== pedido.secretaria) return "outra-secretaria";
    if (alcadaDoPedido(valorDoPedido(pedido), regras.limite) === "gabinete") return "acima-da-alcada";
  }
  // Id 0 e a sessao de demonstracao, que nao abriu coisa nenhuma.
  if (regras.exigeOrdenadorDistinto && quem.id > 0 && pedido.criadoPorId === quem.id) return "mesma-pessoa";
  return null;
}

export function podeAutorizar(quem: QuemDecide, pedido: Pick<Pedido, "secretaria" | "criadoPorId" | "itens">, regras: RegrasDeAutorizacao) {
  return impedimentoParaAutorizar(quem, pedido, regras) === null;
}

/**
 * O saldo de um item do contrato, aberto nas parcelas que o formam. "Em
 * analise" fica separado do saldo porque pedido ainda nao autorizado nao
 * consumiu nada — mas tambem nao esta livre para outra secretaria pedir.
 */
export type SaldoItem = {
  itemContratoId: number;
  item: number;
  descricao: string;
  unidade: string;
  valorUnitario: number;
  contratada: number;
  autorizada: number;
  emAnalise: number;
  /** Contratado menos autorizado: o que ainda pode ser entregue. */
  saldo: number;
  /** Saldo menos o que ja esta em analise: o que um pedido novo pode tomar. */
  disponivel: number;
};

export type AcaoPedido =
  | "conferir"
  | "empenhar"
  | "corrigir-empenho"
  | "devolver"
  | "autorizar"
  | "recusar"
  | "cancelar"
  | "estornar";

/**
 * Cada acao parte de um estado e leva a outro. Recusa, devolucao e estorno
 * exigem motivo escrito — sao as tres que deixam a secretaria sem o
 * fornecimento que pediu.
 *
 * Devolver e recusar terminam parecido e sao coisas diferentes: devolver e o
 * "refaca" do Setor de Compras, sobre a instrucao do pedido; recusar e o "nao"
 * do ordenador, sobre a despesa. Por isso a devolucao cai em `cancelado`, que
 * e o estado de quem saiu de circulacao sem decisao sobre a despesa.
 */
export const acoesDoPedido: Record<AcaoPedido, {
  /** Nulo quando o ato nao move o pedido de estado, so corrige um dado dele. */
  destino: PedidoStatus | null;
  origens: PedidoStatus[];
  exigeMotivo: boolean;
  label: string;
}> = {
  conferir: { destino: "conferido", origens: ["pendente"], exigeMotivo: false, label: "Conferir" },
  empenhar: { destino: "empenhado", origens: ["conferido"], exigeMotivo: false, label: "Empenhar" },
  "corrigir-empenho": { destino: null, origens: ["empenhado", "autorizado"], exigeMotivo: true, label: "Trocar o empenho" },
  devolver: { destino: "cancelado", origens: ["pendente", "conferido"], exigeMotivo: true, label: "Devolver" },
  autorizar: { destino: "autorizado", origens: ["empenhado"], exigeMotivo: false, label: "Autorizar" },
  recusar: { destino: "recusado", origens: ["empenhado"], exigeMotivo: true, label: "Recusar" },
  // Depois de empenhada, a despesa so sai por decisao registrada: cancelar
  // deixaria a nota sem consumo sem ninguem ter dito por que.
  cancelar: { destino: "cancelado", origens: ["pendente", "conferido"], exigeMotivo: false, label: "Cancelar" },
  estornar: { destino: "estornado", origens: ["autorizado"], exigeMotivo: true, label: "Estornar" },
};

/**
 * Instruir nao e decidir: conferir, empenhar e corrigir o empenho preparam a
 * despesa e nao carimbam `decidido_em`. Quem decide e o ordenador.
 */
export function ehDecisao(acao: AcaoPedido) {
  return acao !== "conferir" && acao !== "empenhar" && acao !== "corrigir-empenho";
}

/** Atos que mexem no vinculo com a nota de empenho. */
export function mexeNoEmpenho(acao: AcaoPedido) {
  return acao === "empenhar" || acao === "corrigir-empenho";
}

/**
 * O que esta pessoa pode fazer com este pedido. Cada ato tem um dono: conferir
 * e devolver sao do Compras, autorizar, recusar e estornar sao do ordenador, e
 * cancelar e a retirada de quem pediu.
 */
export type ContextoDeAcao = {
  confere: boolean;
  /** Registra o numero da nota emitida pela Financa. Hoje, o mesmo Compras. */
  empenha: boolean;
  autoriza: boolean;
  daPropriaSecretaria: boolean;
};

const donoDaAcao: Record<AcaoPedido, (contexto: ContextoDeAcao) => boolean> = {
  conferir: (contexto) => contexto.confere,
  empenhar: (contexto) => contexto.empenha,
  "corrigir-empenho": (contexto) => contexto.empenha,
  devolver: (contexto) => contexto.confere,
  autorizar: (contexto) => contexto.autoriza,
  recusar: (contexto) => contexto.autoriza,
  estornar: (contexto) => contexto.autoriza,
  cancelar: (contexto) => contexto.daPropriaSecretaria,
};

export function acoesPossiveis(status: PedidoStatus, contexto: ContextoDeAcao): AcaoPedido[] {
  return (Object.keys(acoesDoPedido) as AcaoPedido[]).filter(
    (acao) => acoesDoPedido[acao].origens.includes(status) && donoDaAcao[acao](contexto),
  );
}

export function podeFazer(acao: AcaoPedido, contexto: ContextoDeAcao) {
  return donoDaAcao[acao](contexto);
}

/** So contrato em vigencia recebe pedido; suspenso, encerrado e rescindido, nao. */
export function contratoAceitaPedido(contrato: Pick<Contrato, "status">) {
  return contrato.status === "ativo";
}

export function totalContratado(itens: SaldoItem[]) {
  return itens.reduce((total, item) => total + item.contratada * item.valorUnitario, 0);
}

export function totalExecutado(itens: SaldoItem[]) {
  return itens.reduce((total, item) => total + item.autorizada * item.valorUnitario, 0);
}

export function totalDoSaldo(itens: SaldoItem[]) {
  return itens.reduce((total, item) => total + item.saldo * item.valorUnitario, 0);
}

/** Quanto do contrato ja foi consumido, em porcentagem do valor. */
export function percentualExecutado(itens: SaldoItem[]) {
  const contratado = totalContratado(itens);
  if (!contratado) return 0;
  return totalExecutado(itens) / contratado;
}

/** Item sem saldo nenhum: continua na lista, mas nao aceita pedido novo. */
export function itemEsgotado(item: SaldoItem) {
  return item.saldo <= 0;
}

/**
 * Contrato que ja consumiu 90% do valor merece aviso: e a hora de decidir entre
 * aditivo e novo processo, antes de a secretaria ficar sem o fornecimento.
 */
export const limiteDeAlerta = 0.9;

export function saldoCritico(itens: SaldoItem[]) {
  return itens.length > 0 && percentualExecutado(itens) >= limiteDeAlerta;
}

/** Monta o saldo a partir dos itens do contrato e dos pedidos ja registrados. */
export function saldoDosItens(itens: ItemContrato[], pedidos: Pedido[]): SaldoItem[] {
  return itens.map((item) => {
    const parcelas = pedidos.flatMap((pedido) =>
      pedido.itens.filter((linha) => linha.itemContratoId === item.id).map((linha) => ({ status: pedido.status, quantidade: linha.quantidade })),
    );
    const autorizada = parcelas.filter((parcela) => consomeSaldo(parcela.status)).reduce((total, parcela) => total + parcela.quantidade, 0);
    const emAnalise = parcelas.filter((parcela) => reservaSaldo(parcela.status)).reduce((total, parcela) => total + parcela.quantidade, 0);
    const saldo = item.quantidadeContratada - autorizada;
    return {
      itemContratoId: item.id,
      item: item.item,
      descricao: item.descricao,
      unidade: item.unidade,
      valorUnitario: item.valorUnitario,
      contratada: item.quantidadeContratada,
      autorizada,
      emAnalise,
      saldo,
      disponivel: saldo - emAnalise,
    };
  });
}

/** Usados apenas no modo de demonstracao, quando nao ha banco. */
export const pedidosDemo: Pedido[] = [
  {
    id: 1,
    numero: "0001/2026",
    contrato: "015/2026",
    fornecedor: "Norte Suprimentos LTDA",
    secretaria: "educacao",
    secretariaNome: "Educacao",
    justificativa: "Reposicao do almoxarifado das escolas para o segundo semestre.",
    status: "autorizado",
    empenho: "2026NE000431",
    empenhoId: 1,
    entregaPrevista: "12/09/2026",
    motivoDecisao: "",
    solicitante: "Helena Braga",
    criadoPorId: 101,
    criadoEm: "02/09/2026 09:20",
    conferente: "Marina Alves",
    conferidoEm: "02/09/2026 11:12",
    decisor: "Rafael Nunes",
    decididoEm: "02/09/2026 15:04",
    itens: [
      { id: 1, itemContratoId: 1, item: 1, descricao: "Papel sulfite A4, branco, 75 g/m2, pacote com 500 folhas", unidade: "PCT", quantidade: 80, valorUnitario: 29.2 },
      { id: 2, itemContratoId: 2, item: 2, descricao: "Caneta esferografica azul, corpo cristal, ponta media", unidade: "CX", quantidade: 25, valorUnitario: 44.13 },
    ],
  },
  {
    id: 2,
    numero: "0002/2026",
    contrato: "015/2026",
    fornecedor: "Norte Suprimentos LTDA",
    secretaria: "saude",
    secretariaNome: "Saude",
    justificativa: "Material de expediente das unidades basicas de saude.",
    status: "empenhado",
    empenho: "2026NE000431",
    empenhoId: 1,
    entregaPrevista: null,
    motivoDecisao: "",
    solicitante: "Paulo Nery",
    criadoPorId: 102,
    criadoEm: "08/09/2026 11:47",
    conferente: "Marina Alves",
    conferidoEm: "08/09/2026 14:05",
    decisor: null,
    decididoEm: null,
    itens: [
      { id: 3, itemContratoId: 1, item: 1, descricao: "Papel sulfite A4, branco, 75 g/m2, pacote com 500 folhas", unidade: "PCT", quantidade: 40, valorUnitario: 29.2 },
      { id: 4, itemContratoId: 3, item: 3, descricao: "Pasta arquivo com aba elastica, polipropileno, oficio", unidade: "UN", quantidade: 30, valorUnitario: 8.93 },
    ],
  },
];

export function saldoDemo(numeroContrato: string): SaldoItem[] {
  const contrato = contratosDemo.find((opcao) => opcao.numero === numeroContrato);
  if (!contrato) return [];
  return saldoDosItens(contrato.itens, pedidosDemo.filter((pedido) => pedido.contrato === numeroContrato));
}
