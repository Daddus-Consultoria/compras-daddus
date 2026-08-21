import type { Contrato, ItemContrato } from "@/lib/contratos";
import { contratosDemo } from "@/lib/contratos";

/**
 * Execucao do contrato: a secretaria pede o fornecimento, o Setor de Compras
 * autoriza, e e a autorizacao que baixa o saldo.
 *
 * Nenhum numero de saldo e guardado. Saldo e sempre "o que foi contratado menos
 * o que foi autorizado", apurado na leitura — assim ele nao tem como divergir
 * dos pedidos que o formaram.
 */

/** Os valores sao os mesmos do enum pedido_status no banco. */
export type PedidoStatus = "pendente" | "autorizado" | "recusado" | "cancelado" | "estornado";

export const pedidoStatusLabels: Record<PedidoStatus, string> = {
  pendente: "Aguardando autorizacao",
  autorizado: "Autorizado",
  recusado: "Recusado",
  cancelado: "Cancelado",
  estornado: "Estornado",
};

export const pedidoStatusDescricoes: Record<PedidoStatus, string> = {
  pendente: "A secretaria pediu; o Setor de Compras ainda nao decidiu. Nao baixa saldo.",
  autorizado: "Fornecimento liberado. E o unico estado que consome saldo do contrato.",
  recusado: "O Setor de Compras negou o pedido, com motivo registrado.",
  cancelado: "Retirado antes da decisao, por quem pediu ou pelo Setor de Compras.",
  estornado: "Autorizacao desfeita; a quantidade volta ao saldo, com motivo registrado.",
};

export const pedidoStatusEmOrdem: PedidoStatus[] = ["pendente", "autorizado", "recusado", "cancelado", "estornado"];

export function pedidoTone(status: PedidoStatus) {
  if (status === "pendente") return "yellow";
  if (status === "autorizado") return "green";
  if (status === "estornado") return "blue";
  return "gray";
}

/** O saldo cai na autorizacao e volta no estorno; os demais estados nao o tocam. */
export function consomeSaldo(status: PedidoStatus) {
  return status === "autorizado";
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
  empenho: string;
  entregaPrevista: string | null;
  motivoDecisao: string;
  solicitante: string | null;
  criadoEm: string;
  decisor: string | null;
  decididoEm: string | null;
  itens: ItemPedido[];
};

export function valorDoPedido(pedido: Pick<Pedido, "itens">) {
  return pedido.itens.reduce((total, item) => total + Number(item.quantidade || 0) * Number(item.valorUnitario || 0), 0);
}

/**
 * O saldo de um item do contrato, aberto nas parcelas que o formam. "Em
 * analise" fica separado do saldo porque pedido pendente ainda nao consumiu
 * nada — mas tambem nao esta livre para outra secretaria pedir.
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

export type AcaoPedido = "autorizar" | "recusar" | "cancelar" | "estornar";

/**
 * Cada acao parte de um estado e leva a outro. Recusa e estorno exigem motivo
 * escrito — sao as duas que deixam a secretaria sem o fornecimento.
 */
export const acoesDoPedido: Record<AcaoPedido, {
  destino: PedidoStatus;
  origens: PedidoStatus[];
  exigeMotivo: boolean;
  label: string;
}> = {
  autorizar: { destino: "autorizado", origens: ["pendente"], exigeMotivo: false, label: "Autorizar" },
  recusar: { destino: "recusado", origens: ["pendente"], exigeMotivo: true, label: "Recusar" },
  cancelar: { destino: "cancelado", origens: ["pendente"], exigeMotivo: false, label: "Cancelar" },
  estornar: { destino: "estornado", origens: ["autorizado"], exigeMotivo: true, label: "Estornar" },
};

export function acoesPossiveis(status: PedidoStatus): AcaoPedido[] {
  return (Object.keys(acoesDoPedido) as AcaoPedido[]).filter((acao) => acoesDoPedido[acao].origens.includes(status));
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
    const emAnalise = parcelas.filter((parcela) => parcela.status === "pendente").reduce((total, parcela) => total + parcela.quantidade, 0);
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
    entregaPrevista: "12/09/2026",
    motivoDecisao: "",
    solicitante: "Helena Braga",
    criadoEm: "02/09/2026 09:20",
    decisor: "Marina Alves",
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
    status: "pendente",
    empenho: "",
    entregaPrevista: null,
    motivoDecisao: "",
    solicitante: "Paulo Nery",
    criadoEm: "08/09/2026 11:47",
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
