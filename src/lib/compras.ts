export type Secretaria = "educacao" | "saude" | "assistencia" | "administracao";

export type Cotacoes = {
  bnc: number;
  pncp: number;
  mercado: number;
};

export type LoteItem = {
  id: string;
  item: number;
  especificacao: string;
  unidade: string;
  quantidades: Record<Secretaria, number>;
  cotacoes: Cotacoes;
};

export type PrefeituraConfig = {
  estado: string;
  nome: string;
  cnpj: string;
  logoUrl: string;
  enderecoCompras: string;
};

/** Os valores sao os mesmos do enum processo_status no banco. */
export type ProcessoStatus = "em_montagem" | "coleta_quantidades" | "em_cotacao" | "enviado_licitacao" | "cancelado";

export const processoStatusLabels: Record<ProcessoStatus, string> = {
  em_montagem: "Em elaboracao",
  coleta_quantidades: "Coleta de quantidades",
  em_cotacao: "Em cotacao",
  enviado_licitacao: "Enviado para licitacao",
  cancelado: "Cancelado",
};

/** Os valores sao os mesmos do enum solicitacao_status no banco. */
export type SolicitacaoStatus = "pendente" | "em_cotacao" | "em_licitacao" | "concluido" | "recusado";

export const solicitacaoStatusLabels: Record<SolicitacaoStatus, string> = {
  pendente: "Pendente",
  em_cotacao: "Em cotacao",
  em_licitacao: "Em licitacao",
  concluido: "Concluido",
  recusado: "Recusado",
};

export type Processo = {
  id: string;
  objeto: string;
  prazoLimite: string;
  status: ProcessoStatus;
  solicitante: string;
  responsavel: string;
  atualizadoEm: string;
  itens: LoteItem[];
};

export const secretariaLabels: Record<Secretaria, string> = {
  educacao: "Educacao",
  saude: "Saude",
  assistencia: "Assist. Social",
  administracao: "Administracao",
};

export const secretariaKeys = Object.keys(secretariaLabels) as Secretaria[];

export const demoProcessos: Processo[] = [
  {
    id: "2026-0142",
    objeto: "Material de expediente para as secretarias",
    prazoLimite: "28/08/2026",
    status: "em_cotacao",
    solicitante: "Secretaria de Administracao",
    responsavel: "Marina Alves",
    atualizadoEm: "Hoje, 14:32",
    itens: [
      { id: "0142-1", item: 1, especificacao: "Papel sulfite A4, branco, 75 g/m2, pacote com 500 folhas", unidade: "PCT", quantidades: { educacao: 120, saude: 45, assistencia: 25, administracao: 30 }, cotacoes: { bnc: 28.9, pncp: 29.5, mercado: 31.2 } },
      { id: "0142-2", item: 2, especificacao: "Caneta esferografica azul, corpo cristal, ponta media", unidade: "CX", quantidades: { educacao: 40, saude: 18, assistencia: 12, administracao: 20 }, cotacoes: { bnc: 42.5, pncp: 44, mercado: 45.9 } },
      { id: "0142-3", item: 3, especificacao: "Pasta arquivo com aba elastica, polipropileno, oficio", unidade: "UN", quantidades: { educacao: 80, saude: 25, assistencia: 15, administracao: 20 }, cotacoes: { bnc: 8.4, pncp: 8.9, mercado: 9.5 } },
    ],
  },
  {
    id: "2026-0138",
    objeto: "Medicamentos e insumos hospitalares",
    prazoLimite: "02/09/2026",
    status: "enviado_licitacao",
    solicitante: "Secretaria de Saude",
    responsavel: "Marina Alves",
    atualizadoEm: "Ontem, 09:15",
    itens: [
      { id: "0138-1", item: 1, especificacao: "Dipirona sodica 500 mg, comprimido, caixa com 200 unidades", unidade: "CX", quantidades: { educacao: 0, saude: 180, assistencia: 40, administracao: 10 }, cotacoes: { bnc: 34.9, pncp: 36.2, mercado: 38.5 } },
      { id: "0138-2", item: 2, especificacao: "Luva de procedimento nao cirurgica, latex, tamanho M, caixa com 100", unidade: "CX", quantidades: { educacao: 0, saude: 320, assistencia: 60, administracao: 15 }, cotacoes: { bnc: 27.4, pncp: 28.9, mercado: 30.1 } },
      { id: "0138-3", item: 3, especificacao: "Seringa descartavel 5 ml com agulha 25 x 7 mm", unidade: "UN", quantidades: { educacao: 0, saude: 1500, assistencia: 200, administracao: 0 }, cotacoes: { bnc: 0.78, pncp: 0.82, mercado: 0.9 } },
      { id: "0138-4", item: 4, especificacao: "Alcool etilico hidratado 70%, frasco com 1 litro", unidade: "FR", quantidades: { educacao: 25, saude: 240, assistencia: 80, administracao: 20 }, cotacoes: { bnc: 8.2, pncp: 8.7, mercado: 9.4 } },
    ],
  },
  {
    id: "2026-0129",
    objeto: "Manutencao preventiva de veiculos",
    prazoLimite: "10/09/2026",
    status: "em_montagem",
    solicitante: "Secretaria de Educacao",
    responsavel: "Marina Alves",
    atualizadoEm: "18/08/2026, 16:40",
    itens: [
      { id: "0129-1", item: 1, especificacao: "Troca de oleo do motor com substituicao de filtro, veiculo leve", unidade: "SV", quantidades: { educacao: 18, saude: 8, assistencia: 5, administracao: 4 }, cotacoes: { bnc: 0, pncp: 0, mercado: 0 } },
      { id: "0129-2", item: 2, especificacao: "Alinhamento de direcao e balanceamento das quatro rodas, veiculo leve", unidade: "SV", quantidades: { educacao: 18, saude: 8, assistencia: 5, administracao: 4 }, cotacoes: { bnc: 0, pncp: 0, mercado: 0 } },
      { id: "0129-3", item: 3, especificacao: "Jogo de pastilhas de freio dianteiras para onibus escolar", unidade: "JG", quantidades: { educacao: 12, saude: 0, assistencia: 0, administracao: 0 }, cotacoes: { bnc: 0, pncp: 0, mercado: 0 } },
    ],
  },
];

export function findProcesso(id: string) {
  return demoProcessos.find((processo) => processo.id === id);
}

export function statusTone(status: ProcessoStatus) {
  if (status === "em_cotacao") return "blue";
  if (status === "enviado_licitacao" || status === "coleta_quantidades") return "yellow";
  return "gray";
}

export function itemTotalQuantity(item: LoteItem) {
  return Object.values(item.quantidades).reduce((total, quantity) => total + Number(quantity || 0), 0);
}

export function itemAverage(item: LoteItem) {
  const values = Object.values(item.cotacoes).filter((value) => value > 0);
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

export function quotesFilled(item: LoteItem) {
  return Object.values(item.cotacoes).filter((value) => value > 0).length;
}

export function loteTotal(items: LoteItem[]) {
  return items.reduce((total, item) => total + itemAverage(item) * itemTotalQuantity(item), 0);
}

export function nextItemNumber(items: LoteItem[]) {
  return items.reduce((maior, item) => Math.max(maior, item.item), 0) + 1;
}

/** Converte o texto de um campo numerico: vazio e lixo viram 0, negativo vira 0. */
export function toNumericValue(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export function money(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export type LoteRascunho = {
  itens: LoteItem[];
  notas: string;
};

/**
 * Rascunho local, valido apenas neste navegador. E uma ponte ate os processos
 * serem persistidos no Strapi, quando `salvarLote` vira uma chamada de API.
 */
export function loteStorageKey(processoId: string) {
  return `daddus-compras:lote:${processoId}`;
}

export function loadRascunho<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveRascunho<T>(key: string, value: T) {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
