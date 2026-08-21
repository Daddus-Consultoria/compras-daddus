import type { ProcessoStatus } from "@/lib/compras";

/**
 * Contrato devolvido pela CPL e os itens efetivamente contratados.
 *
 * Nao ha quantidade utilizada nem saldo aqui: os dois nascem das movimentacoes
 * (Fase 4). O que este modulo guarda e so o que foi contratado — a base de
 * calculo do saldo, nunca o saldo em si.
 */

/** Os valores sao os mesmos do enum contrato_status no banco. */
export type ContratoStatus = "ativo" | "suspenso" | "encerrado" | "rescindido";

export const contratoStatusLabels: Record<ContratoStatus, string> = {
  ativo: "Ativo",
  suspenso: "Suspenso",
  encerrado: "Encerrado",
  rescindido: "Rescindido",
};

export const contratoStatusEmOrdem: ContratoStatus[] = ["ativo", "suspenso", "encerrado", "rescindido"];

export function contratoTone(status: ContratoStatus) {
  if (status === "ativo") return "green";
  if (status === "suspenso") return "yellow";
  return "gray";
}

export type ItemContrato = {
  id: number;
  item: number;
  descricao: string;
  unidade: string;
  quantidadeContratada: number;
  valorUnitario: number;
};

export type Contrato = {
  id: number;
  numero: string;
  fornecedor: string;
  cnpjFornecedor: string;
  objeto: string;
  vigenciaInicio: string | null;
  vigenciaFim: string | null;
  valorTotal: number;
  documento: string;
  status: ContratoStatus;
  /** Numero do processo de origem, quando o contrato nasceu de um. */
  processo: string | null;
  atualizadoEm: string;
  itens: ItemContrato[];
};

export function totalDoItem(item: ItemContrato) {
  return Number(item.quantidadeContratada || 0) * Number(item.valorUnitario || 0);
}

/**
 * O valor do contrato e sempre a soma dos itens, e nao um numero digitado a
 * parte: e o que garante que o mapa, o contrato e o saldo falem do mesmo valor.
 */
export function totalDosItens(itens: ItemContrato[]) {
  return itens.reduce((total, item) => total + totalDoItem(item), 0);
}

/** "31/12/2026" -> quantos dias faltam. Negativo quer dizer vigencia vencida. */
export function diasParaVencer(vigenciaFim: string | null, hoje = new Date()) {
  if (!vigenciaFim) return null;
  const partes = vigenciaFim.split("/");
  if (partes.length !== 3) return null;
  const [dia, mes, ano] = partes.map(Number);
  const fim = new Date(ano, mes - 1, dia);
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((fim.getTime() - inicio.getTime()) / 86_400_000);
}

/** Vigencia a vencer em ate 30 dias merece aviso na lista. */
export function vigenciaCritica(contrato: Contrato) {
  if (contrato.status !== "ativo") return false;
  const dias = diasParaVencer(contrato.vigenciaFim);
  return dias !== null && dias <= 30;
}

/** Os valores sao os mesmos do enum tramite_cpl_tipo no banco. */
export type TramiteTipo = "recebimento" | "diligencia" | "retorno";

export const tramiteLabels: Record<TramiteTipo, string> = {
  recebimento: "Recebimento na CPL",
  diligencia: "Diligencia",
  retorno: "Retorno a compras",
};

export const tramiteDescricoes: Record<TramiteTipo, string> = {
  recebimento: "A comissao confirma que recebeu o mapa e assume o processo.",
  diligencia: "Pedido de esclarecimento ou correcao sem devolver o processo.",
  retorno: "A CPL devolve o processo ao Setor de Compras, com o contrato ou sem ele.",
};

export type Tramite = {
  id: number;
  tipo: TramiteTipo;
  data: string;
  documento: string;
  observacao: string;
  usuario: string | null;
  quando: string;
};

/**
 * Cada tipo de tramite arrasta o processo para uma fase. E a CPL registrando o
 * fato que move o processo, e nao alguem escolhendo a fase numa lista.
 */
export const faseDoTramite = {
  recebimento: "em_cpl",
  diligencia: null,
  retorno: "contrato_recebido",
} as const;

/** De qual fase cada tipo de tramite pode partir. */
export const origemDoTramite: Record<TramiteTipo, ProcessoStatus[]> = {
  recebimento: ["enviado_licitacao"],
  diligencia: ["em_cpl"],
  retorno: ["em_cpl"],
};

export function tramitesPermitidos(status: ProcessoStatus): TramiteTipo[] {
  return (Object.keys(origemDoTramite) as TramiteTipo[]).filter((tipo) => origemDoTramite[tipo].includes(status));
}

/** Usados apenas no modo de demonstracao, quando nao ha banco. */
export const contratosDemo: Contrato[] = [
  {
    id: 1,
    numero: "015/2026",
    fornecedor: "Norte Suprimentos LTDA",
    cnpjFornecedor: "11.222.333/0001-44",
    objeto: "Aquisicao de material de expediente para as secretarias",
    vigenciaInicio: "01/09/2026",
    vigenciaFim: "31/12/2026",
    valorTotal: 12_047.5,
    documento: "Contrato 015/2026 - DOM 02/09/2026",
    status: "ativo",
    processo: "2026-0142",
    atualizadoEm: "20/08/2026, 10:12",
    itens: [
      { id: 1, item: 1, descricao: "Papel sulfite A4, branco, 75 g/m2, pacote com 500 folhas", unidade: "PCT", quantidadeContratada: 220, valorUnitario: 29.2 },
      { id: 2, item: 2, descricao: "Caneta esferografica azul, corpo cristal, ponta media", unidade: "CX", quantidadeContratada: 90, valorUnitario: 44.13 },
      { id: 3, item: 3, descricao: "Pasta arquivo com aba elastica, polipropileno, oficio", unidade: "UN", quantidadeContratada: 140, valorUnitario: 8.93 },
    ],
  },
  {
    id: 2,
    numero: "011/2026",
    fornecedor: "Hospitalar Sul LTDA",
    cnpjFornecedor: "66.777.888/0001-99",
    objeto: "Registro de precos de insumos hospitalares",
    vigenciaInicio: "15/03/2026",
    vigenciaFim: "14/09/2026",
    valorTotal: 21_336.0,
    documento: "ARP 011/2026",
    status: "ativo",
    processo: null,
    atualizadoEm: "12/08/2026, 16:40",
    itens: [
      { id: 4, item: 1, descricao: "Luva de procedimento nao cirurgica, latex, tamanho M, caixa com 100", unidade: "CX", quantidadeContratada: 395, valorUnitario: 28.8 },
      { id: 5, item: 2, descricao: "Seringa descartavel 5 ml com agulha 25 x 7 mm", unidade: "UN", quantidadeContratada: 1700, valorUnitario: 0.8 },
      { id: 6, item: 3, descricao: "Alcool etilico hidratado 70%, frasco com 1 litro", unidade: "FR", quantidadeContratada: 365, valorUnitario: 8.7 },
    ],
  },
];

export function acharContratoDemo(numero: string) {
  return contratosDemo.find((contrato) => contrato.numero === numero) ?? null;
}
