import { dataBrValida, type SolicitacaoStatus } from "@/lib/compras";
import type { DadosDfd } from "@/lib/repositorio/dfd";

/**
 * Documento de Formalizacao da Demanda: o pedido da secretaria, com o que a
 * Lei 14.133/2021 espera que ele diga antes de virar processo.
 *
 * O DFD nao e uma tabela nova. Ele e a solicitacao que a secretaria ja enviava,
 * agora com itens quantificados e os campos do documento — duplicar a demanda
 * criaria duas versoes da mesma verdade.
 */

/** Os valores sao os mesmos do enum demanda_prioridade no banco. */
export type Prioridade = "alta" | "media" | "baixa";

export const prioridadeLabels: Record<Prioridade, string> = {
  alta: "Alta",
  media: "Media",
  baixa: "Baixa",
};

export const prioridadeDescricoes: Record<Prioridade, string> = {
  alta: "Interrompe um servico essencial se nao for atendida no prazo.",
  media: "Necessaria para o funcionamento regular, com alguma folga de prazo.",
  baixa: "Melhoria ou reposicao programada, sem urgencia.",
};

export const prioridadesEmOrdem: Prioridade[] = ["alta", "media", "baixa"];

export function prioridadeTone(prioridade: Prioridade) {
  if (prioridade === "alta") return "yellow";
  if (prioridade === "media") return "blue";
  return "gray";
}

export type ItemDemanda = {
  id: number;
  item: number;
  descricao: string;
  unidade: string;
  quantidade: number;
  /** Como a secretaria chegou ao numero: e o inciso IV do art. 18 nascendo aqui. */
  memoria: string;
};

export type Dfd = {
  id: number;
  numero: string;
  objeto: string;
  justificativa: string;
  secretaria: string | null;
  secretariaNome: string;
  status: SolicitacaoStatus;
  prioridade: Prioridade;
  dataPretendida: string | null;
  previsaoPca: boolean;
  resultados: string;
  vinculacao: string;
  responsavel: string;
  /** Texto curto dizendo de onde os itens foram importados, quando foram. */
  origemItens: string;
  /** Numero do processo que nasceu desta demanda, quando ja nasceu. */
  processo: string | null;
  autor: string | null;
  criadoEm: string;
  itens: ItemDemanda[];
};

export function quantidadeTotal(dfd: Pick<Dfd, "itens">) {
  return dfd.itens.reduce((total, item) => total + Number(item.quantidade || 0), 0);
}

/**
 * O que ainda falta para a demanda sustentar um ETP. Nao trava o envio — uma
 * demanda urgente sem item detalhado ainda e uma demanda —, mas o Setor de
 * Compras precisa enxergar o buraco antes de abrir o processo.
 */
export function lacunasDoDfd(dfd: Dfd) {
  const faltas: string[] = [];
  if (!dfd.itens.length) faltas.push("nenhum item quantificado");
  else if (dfd.itens.some((item) => !item.quantidade)) faltas.push("item sem quantidade");
  if (dfd.itens.length && dfd.itens.every((item) => !item.memoria.trim())) faltas.push("sem memoria de calculo");
  if (!dfd.dataPretendida) faltas.push("sem data pretendida");
  if (!dfd.resultados.trim()) faltas.push("sem resultados pretendidos");
  return faltas;
}

/** De onde a secretaria pode puxar os itens de uma demanda anterior. */
export type TipoFonte = "dfd" | "processo" | "contrato";

export const tipoFonteLabels: Record<TipoFonte, string> = {
  dfd: "Demanda anterior",
  processo: "Processo anterior",
  contrato: "Consumo de contrato",
};

export const tipoFonteDescricoes: Record<TipoFonte, string> = {
  dfd: "Repete os itens de um DFD que a secretaria ja enviou.",
  processo: "Traz os itens de um processo, com a quantidade que esta secretaria lancou nele.",
  contrato: "Traz o que a secretaria realmente consumiu do contrato — a melhor base de calculo.",
};

export type FonteImportacao = {
  tipo: TipoFonte;
  /** Numero do DFD, do processo ou do contrato. */
  id: string;
  rotulo: string;
  detalhe: string;
  quando: string;
  itens: number;
};

export type ItemImportado = {
  descricao: string;
  unidade: string;
  quantidade: number;
  memoria: string;
};

/** Usados apenas no modo de demonstracao, quando nao ha banco. */
export const dfdsDemo: Dfd[] = [
  {
    id: 1,
    numero: "0001/2026",
    objeto: "Material de expediente para as escolas da rede municipal",
    justificativa:
      "O estoque do almoxarifado central atende ate o fim do primeiro semestre. Sem a reposicao, as 12 escolas da rede ficam sem material de secretaria e de sala de aula no retorno as aulas.",
    secretaria: "educacao",
    secretariaNome: "Educacao",
    status: "em_cotacao",
    prioridade: "alta",
    dataPretendida: "01/09/2026",
    previsaoPca: true,
    resultados: "Doze escolas abastecidas por doze meses, sem compra emergencial no meio do ano letivo.",
    vinculacao: "",
    responsavel: "Helena Braga, diretora administrativa",
    origemItens: "Importado do consumo do contrato 011/2025 em 14/08/2026.",
    processo: "2026-0142",
    autor: "Helena Braga",
    criadoEm: "14/08/2026 09:12",
    itens: [
      { id: 1, item: 1, descricao: "Papel sulfite A4, branco, 75 g/m2, pacote com 500 folhas", unidade: "PCT", quantidade: 120, memoria: "Consumo de 110 PCT no contrato anterior, mais 9% pelo crescimento da matricula." },
      { id: 2, item: 2, descricao: "Caneta esferografica azul, corpo cristal, ponta media", unidade: "CX", quantidade: 40, memoria: "Uma caixa por sala de aula por bimestre, nas 12 escolas." },
    ],
  },
];

export function acharDfdDemo(numero: string) {
  return dfdsDemo.find((dfd) => dfd.numero === numero) ?? null;
}

/**
 * Mesma checagem para criar e para editar. O DFD aceita ficar incompleto — uma
 * demanda urgente sem memoria de calculo ainda e uma demanda —, mas o que
 * estiver preenchido precisa fazer sentido.
 */
export function validarDemanda(corpo: Record<string, unknown>): DadosDfd | { error: string } {
  const objeto = String(corpo.objeto ?? "").trim();
  const justificativa = String(corpo.justificativa ?? "").trim();
  if (!objeto) return { error: "Informe o objeto da demanda." };
  if (justificativa.length < 20) {
    return { error: "A justificativa precisa explicar a necessidade em pelo menos 20 caracteres." };
  }

  const prioridade = String(corpo.prioridade ?? "media") as Prioridade;
  if (!(prioridade in prioridadeLabels)) return { error: `Prioridade invalida: ${prioridade}.` };

  const dataPretendida = corpo.dataPretendida ? String(corpo.dataPretendida).trim() : "";
  if (dataPretendida && !dataBrValida(dataPretendida)) {
    return { error: `Data pretendida invalida: ${dataPretendida}. Use uma data real, no formato DD/MM/AAAA.` };
  }

  const brutos = Array.isArray(corpo.itens) ? (corpo.itens as Array<Record<string, unknown>>) : [];
  const itens: DadosDfd["itens"] = [];
  const numeros = new Set<number>();
  for (const bruto of brutos) {
    const item = Number(bruto?.item);
    const quantidade = Number(bruto?.quantidade);
    const descricao = String(bruto?.descricao ?? "").trim();
    if (!Number.isInteger(item) || item < 1) return { error: "Cada item precisa de um numero inteiro positivo." };
    if (numeros.has(item)) return { error: `O item ${item} aparece duas vezes.` };
    if (!descricao) return { error: `O item ${item} esta sem descricao.` };
    if (!Number.isFinite(quantidade) || quantidade < 0) return { error: `Quantidade invalida no item ${item}.` };
    numeros.add(item);
    itens.push({
      item,
      descricao,
      unidade: String(bruto?.unidade ?? "UN").trim() || "UN",
      quantidade,
      memoria: String(bruto?.memoria ?? "").trim(),
    });
  }

  return {
    objeto,
    justificativa,
    prioridade,
    dataPretendida: dataPretendida || null,
    previsaoPca: corpo.previsaoPca === true,
    resultados: String(corpo.resultados ?? "").trim(),
    vinculacao: String(corpo.vinculacao ?? "").trim(),
    responsavel: String(corpo.responsavel ?? "").trim(),
    origemItens: String(corpo.origemItens ?? "").trim(),
    itens,
  };
}
