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

export const secretariaLabels: Record<Secretaria, string> = {
  educacao: "Educacao",
  saude: "Saude",
  assistencia: "Assist. Social",
  administracao: "Administracao",
};

export const initialItems: LoteItem[] = [
  { id: "1", item: 1, especificacao: "Papel sulfite A4, branco, 75 g/m2, pacote com 500 folhas", unidade: "PCT", quantidades: { educacao: 120, saude: 45, assistencia: 25, administracao: 30 }, cotacoes: { bnc: 28.9, pncp: 29.5, mercado: 31.2 } },
  { id: "2", item: 2, especificacao: "Caneta esferografica azul, corpo cristal, ponta media", unidade: "CX", quantidades: { educacao: 40, saude: 18, assistencia: 12, administracao: 20 }, cotacoes: { bnc: 42.5, pncp: 44, mercado: 45.9 } },
  { id: "3", item: 3, especificacao: "Pasta arquivo com aba elastica, polipropileno, oficio", unidade: "UN", quantidades: { educacao: 80, saude: 25, assistencia: 15, administracao: 20 }, cotacoes: { bnc: 8.4, pncp: 8.9, mercado: 9.5 } },
];

export const demoProcesses = [
  { id: "2026-0142", object: "Material de expediente para as secretarias", deadline: "28/08/2026", status: "Em cotacao", requester: "Secretaria de Administracao" },
  { id: "2026-0138", object: "Medicamentos e insumos hospitalares", deadline: "02/09/2026", status: "Aguardando aprovacao", requester: "Secretaria de Saude" },
  { id: "2026-0129", object: "Manutencao preventiva de veiculos", deadline: "10/09/2026", status: "Em elaboracao", requester: "Secretaria de Educacao" },
];

export function itemTotalQuantity(item: LoteItem) {
  return Object.values(item.quantidades).reduce((total, quantity) => total + Number(quantity || 0), 0);
}

export function itemAverage(item: LoteItem) {
  const values = Object.values(item.cotacoes).filter((value) => value > 0);
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

export function money(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
