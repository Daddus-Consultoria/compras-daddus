import type { PedidoStatus } from "@/lib/pedidos";

/**
 * A nota de empenho, como cadastro.
 *
 * A Financa emite a nota fora do portal; o Setor de Compras registra o numero
 * emitido e amarra o pedido a ele. O empenho existe como cadastro, e nao como
 * campo do pedido, porque uma nota estimativa cobre varios fornecimentos do
 * mesmo contrato — o codigo continua unico no municipio, o que se repete e o
 * vinculo.
 *
 * Como no saldo do contrato, nenhum numero de saldo e guardado: o saldo do
 * empenho e o valor menos o que os pedidos vivos tomaram dele, apurado na
 * leitura. Guardar faria dele um numero editavel, que e o que o fluxo evita.
 */
export type Empenho = {
  id: number;
  numero: string;
  contrato: string;
  dataEmissao: string | null;
  valor: number;
  observacao: string;
  registradoPor: string | null;
  registradoEm: string;
  /** Quanto os pedidos vivos ja tomaram dele. */
  comprometido: number;
  /** Valor menos comprometido: o que ainda cabe num pedido novo. */
  saldo: number;
  /** Quantos pedidos o citam hoje, em qualquer situacao. */
  pedidos: number;
};

/**
 * Estados que tomam valor do empenho. `empenhado` reserva e `autorizado`
 * consome; recusa, cancelamento e estorno devolvem — a nota fica sem consumo e
 * a anulacao dela e ato da Financa, fora do portal.
 */
export function comprometeEmpenho(status: PedidoStatus) {
  return status === "empenhado" || status === "autorizado";
}

/** Empenho sem saldo continua na lista, mas nao recebe pedido novo. */
export function empenhoEsgotado(empenho: Pick<Empenho, "saldo">) {
  return empenho.saldo <= 0;
}

/**
 * Nota que ficou sem consumo nenhum depois de ter tido: e o caso que pede
 * anulacao na Financa. Empenho recem-cadastrado tambem tem zero comprometido,
 * entao a contagem de pedidos e que separa um do outro.
 */
export function empenhoOcioso(empenho: Pick<Empenho, "comprometido" | "pedidos">) {
  return empenho.pedidos > 0 && empenho.comprometido === 0;
}

export type DadosEmpenho = {
  contrato: string;
  numero: string;
  valor: number;
  dataEmissao: string | null;
  observacao: string;
};

/** Usados apenas no modo de demonstracao, quando nao ha banco. */
export const empenhosDemo: Empenho[] = [
  {
    id: 1,
    numero: "2026NE000431",
    contrato: "015/2026",
    dataEmissao: "02/09/2026",
    valor: 5000,
    observacao: "Empenho estimativo do material de expediente.",
    registradoPor: "Marina Alves",
    registradoEm: "02/09/2026 10:40",
    comprometido: 3439.25,
    saldo: 1560.75,
    pedidos: 1,
  },
];
