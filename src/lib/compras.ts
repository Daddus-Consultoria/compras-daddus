import type { Papel } from "@/lib/auth/papeis";

/**
 * A chave de uma secretaria da prefeitura. Nao e mais uma lista fechada: cada
 * municipio cadastra as suas, entao o conjunto vem do banco.
 */
export type Secretaria = string;

export type SecretariaInfo = {
  id: number;
  chave: string;
  nome: string;
  ordem: number;
  ativa: boolean;
};

/**
 * Fontes admitidas na pesquisa de precos, na ordem de preferencia do art. 5 da
 * IN SEGES/ME 65/2021: bases publicas primeiro, fornecedor por ultimo.
 */
export type FonteCotacao =
  | "painel_precos"
  | "pncp"
  | "contrato_similar"
  | "tabela_referencia"
  | "sitio_eletronico"
  | "midia_especializada"
  | "fornecedor";

export const fonteLabels: Record<FonteCotacao, string> = {
  painel_precos: "Painel de Precos",
  pncp: "PNCP",
  contrato_similar: "Contratacao similar",
  tabela_referencia: "Tabela de referencia",
  sitio_eletronico: "Sitio eletronico",
  midia_especializada: "Midia especializada",
  fornecedor: "Fornecedor",
};

export const fonteDescricoes: Record<FonteCotacao, string> = {
  painel_precos: "Painel de Precos do Governo Federal",
  pncp: "Portal Nacional de Contratacoes Publicas",
  contrato_similar: "Contratacao similar de outro ente publico, dos ultimos 12 meses",
  tabela_referencia: "Tabela oficial de referencia (SINAPI, SICRO, CMED)",
  sitio_eletronico: "Sitio eletronico especializado ou de dominio amplo",
  midia_especializada: "Publicacao ou midia especializada do setor",
  fornecedor: "Pesquisa direta com fornecedor",
};

export const fontesEmOrdem: FonteCotacao[] = [
  "painel_precos", "pncp", "contrato_similar", "tabela_referencia",
  "sitio_eletronico", "midia_especializada", "fornecedor",
];

export type Cotacao = {
  id: number;
  fonte: FonteCotacao;
  /** Fornecedor, orgao ou nome da fonte consultada. */
  descricao: string;
  /** Link, numero do contrato, CNPJ — o que comprova a cotacao. */
  documento: string;
  valorUnitario: number;
  dataCotacao: string | null;
  desconsiderada: boolean;
  justificativa: string;
};

/** Art. 6 da IN 65/2021: media, mediana ou menor dos valores obtidos. */
export type MetodoPreco = "media" | "mediana" | "menor";

export const metodoLabels: Record<MetodoPreco, string> = {
  media: "Media das cotacoes",
  mediana: "Mediana das cotacoes",
  menor: "Menor preco obtido",
};

/**
 * O item do lote amarrado ao catalogo oficial (CATMAT/CATSER).
 *
 * E o que torna possivel consultar preco publicado: a API do Painel de Precos
 * consulta por codigo, nunca por texto. A descricao vem junto e fica gravada —
 * e o texto do catalogo no momento da escolha, e o processo precisa continuar
 * dizendo o que foi escolhido mesmo que o catalogo oficial mude depois.
 */
export type VinculoCatalogo = {
  codigo: number;
  tipo: "material" | "servico";
  descricao: string;
};

export type LoteItem = {
  id: string;
  item: number;
  especificacao: string;
  unidade: string;
  quantidades: Record<string, number>;
  cotacoes: Cotacao[];
  ajustes?: AjusteQuantidade[];
  catalogo?: VinculoCatalogo | null;
};

/** Diferencas entre o que esta gravado e o que a tela quer gravar. */
export function diferencasDeQuantidade(gravados: LoteItem[], enviados: LoteItem[], chaves: string[]) {
  const porNumero = new Map(gravados.map((item) => [item.item, item]));
  const mudancas: Array<{ item: number; secretaria: string; anterior: number; nova: number }> = [];
  for (const enviado of enviados) {
    const gravado = porNumero.get(enviado.item);
    if (!gravado) continue;
    for (const chave of chaves) {
      const anterior = Number(gravado.quantidades[chave] ?? 0);
      const nova = Number(enviado.quantidades?.[chave] ?? 0);
      if (anterior !== nova) mudancas.push({ item: enviado.item, secretaria: chave, anterior, nova });
    }
  }
  return mudancas;
}

/**
 * Confere formato e existencia da data: "31/02/2026" tem o formato certo e nao
 * existe. Sem a segunda checagem, a data so seria recusada la no Postgres, e o
 * usuario receberia um erro de banco em vez de "prazo invalido".
 */
export function dataBrValida(valor: string) {
  const partes = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(valor);
  if (!partes) return false;
  const [, dia, mes, ano] = partes.map(Number);
  const data = new Date(ano, mes - 1, dia);
  return data.getFullYear() === ano && data.getMonth() === mes - 1 && data.getDate() === dia;
}

/**
 * As duas pontas da mesma data.
 *
 * O portal fala "DD/MM/AAAA" de ponta a ponta: e o que a API valida, o que a
 * tela mostra, o que o CSV entrega e o que a contagem de prazo le. O Postgres e
 * o campo de data do navegador falam ISO. A traducao mora aqui, e nao em cada
 * formulario, para nao virar uma familia de conversores levemente diferentes.
 */

/** "12/08/2026" -> "2026-08-12"; qualquer outra coisa vira nulo. */
export function dataBrParaIso(valor: string | null) {
  if (!valor) return null;
  const partes = valor.split("/");
  if (partes.length !== 3) return null;
  const [dia, mes, ano] = partes;
  return `${ano}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}`;
}

/** "2026-08-12" -> "12/08/2026"; qualquer outra coisa vira vazio. */
export function dataIsoParaBr(valor: string) {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  return partes ? `${partes[3]}/${partes[2]}/${partes[1]}` : "";
}

/**
 * Poe a pontuacao do CNPJ nos digitos que ja foram escritos, sem esperar os
 * catorze. O campo e guardado pontuado porque e assim que ele aparece no
 * contrato, na tela e no PDF; a mascara existe para que o mesmo CNPJ nao seja
 * gravado de quatro jeitos diferentes conforme quem digitou.
 */
export function formatarCnpj(valor: string) {
  const digitos = valor.replace(/\D/g, "").slice(0, 14);
  return digitos
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

export type PrefeituraConfig = {
  estado: string;
  nome: string;
  cnpj: string;
  logoUrl: string;
  enderecoCompras: string;
};

/**
 * Regras de autorizacao da despesa, decididas por prefeitura porque a
 * delegacao de ordenacao vem de decreto e cada municipio delega diferente.
 * Ficam fora de PrefeituraConfig de proposito: aquilo e o cabecalho dos
 * documentos, isto e regra de fluxo.
 */
export type RegrasAutorizacao = {
  /** Teto do secretario para autorizar, em reais. Nulo = sem teto. */
  limiteAutorizacao: number | null;
  /** Quando ligada, quem abre o pedido nao o autoriza. */
  exigeOrdenadorDistinto: boolean;
};

/** Os valores sao os mesmos do enum processo_status no banco. */
export type ProcessoStatus =
  | "em_montagem"
  | "coleta_quantidades"
  | "em_cotacao"
  | "cotacao_concluida"
  | "mapa_elaborado"
  | "enviado_licitacao"
  | "em_cpl"
  | "contrato_recebido"
  | "contrato_ativo"
  | "encerrado"
  | "cancelado";

export const processoStatusLabels: Record<ProcessoStatus, string> = {
  em_montagem: "Em elaboracao",
  coleta_quantidades: "Coleta de quantidades",
  em_cotacao: "Em cotacao",
  cotacao_concluida: "Cotacao concluida",
  mapa_elaborado: "Mapa elaborado",
  enviado_licitacao: "Mapa enviado a CPL",
  em_cpl: "Em processamento na CPL",
  contrato_recebido: "Devolvido pela CPL",
  contrato_ativo: "Contrato ativo",
  encerrado: "Encerrado",
  cancelado: "Cancelado",
};

/** A ordem em que as fases aparecem em filtros e linhas do tempo. */
export const fasesEmOrdem: ProcessoStatus[] = [
  "em_montagem", "coleta_quantidades", "em_cotacao", "cotacao_concluida", "mapa_elaborado",
  "enviado_licitacao", "em_cpl", "contrato_recebido", "contrato_ativo", "encerrado", "cancelado",
];

/** Os valores sao os mesmos do enum solicitacao_status no banco. */
export type SolicitacaoStatus = "pendente" | "em_cotacao" | "em_licitacao" | "concluido" | "recusado";

export const solicitacaoStatusLabels: Record<SolicitacaoStatus, string> = {
  pendente: "Pendente",
  em_cotacao: "Em cotacao",
  em_licitacao: "Em licitacao",
  concluido: "Concluido",
  recusado: "Recusado",
};

/**
 * Uma secretaria declarando que terminou de lancar as quantidades dela neste
 * processo. Ver db/migrations/008: o fim do lancamento e declarado, e nao
 * deduzido de haver algum numero maior que zero.
 */
export type LancamentoSecretaria = {
  secretaria: Secretaria;
  concluidoPor: string | null;
  concluidoEm: string;
};

export type Processo = {
  id: string;
  objeto: string;
  prazoLimite: string;
  status: ProcessoStatus;
  metodoPreco: MetodoPreco;
  justificativaMetodo: string;
  secretariaSolicitante: Secretaria | null;
  responsavel: string;
  atualizadoEm: string;
  notas: string;
  itens: LoteItem[];
  lancamentos: LancamentoSecretaria[];
};

/**
 * Divide as secretarias entre as que ja concluiram o lancamento e as que ainda
 * devem, para a coleta de quantidades.
 *
 * Secretaria desativada fica de fora das duas listas: ela nao lanca mais nada,
 * entao cobra-la seria prender o processo num pendente que ninguem pode
 * resolver. O historico dela continua no lote, no numero que ja estava gravado.
 */
export function situacaoDoLancamento(
  processo: Pick<Processo, "lancamentos">,
  secretarias: SecretariaInfo[],
) {
  const porChave = new Map(processo.lancamentos.map((lancamento) => [lancamento.secretaria, lancamento]));
  const ativas = secretarias.filter((secretaria) => secretaria.ativa);

  return {
    concluidas: ativas.filter((secretaria) => porChave.has(secretaria.chave)),
    pendentes: ativas.filter((secretaria) => !porChave.has(secretaria.chave)),
    lancamentoDe: (chave: Secretaria) => porChave.get(chave) ?? null,
    total: ativas.length,
  };
}

/** Secretarias com que uma prefeitura nova comeca; depois ela edita a vontade. */
export const secretariasPadrao = [
  { chave: "educacao", nome: "Educacao" },
  { chave: "saude", nome: "Saude" },
  { chave: "assistencia", nome: "Assist. Social" },
  { chave: "administracao", nome: "Administracao" },
];

/** Usada apenas no modo de demonstracao, quando nao ha banco. */
export const secretariasDemo: SecretariaInfo[] = secretariasPadrao.map((secretaria, indice) => ({
  id: indice + 1,
  chave: secretaria.chave,
  nome: secretaria.nome,
  ordem: indice + 1,
  ativa: true,
}));

export function nomeCurtoSecretaria(secretarias: SecretariaInfo[], chave: Secretaria | null) {
  if (!chave) return "-";
  return secretarias.find((secretaria) => secretaria.chave === chave)?.nome ?? chave;
}

export function nomeSecretaria(secretarias: SecretariaInfo[], chave: Secretaria | null) {
  if (!chave) return "Sem secretaria definida";
  const encontrada = secretarias.find((secretaria) => secretaria.chave === chave);
  return encontrada ? `Secretaria de ${encontrada.nome}` : `Secretaria de ${chave}`;
}

/** Gera a chave a partir do nome digitado: "Meio Ambiente" vira "meio-ambiente". */
export function chaveDaSecretaria(nome: string) {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export const demoProcessos: Processo[] = [
  {
    id: "2026-0142",
    objeto: "Material de expediente para as secretarias",
    prazoLimite: "28/08/2026",
    status: "em_cotacao",
    metodoPreco: "media",
    justificativaMetodo: "",
    secretariaSolicitante: "administracao",
    responsavel: "Marina Alves",
    atualizadoEm: "Hoje, 14:32",
    notas: "",
    lancamentos: [
      { secretaria: "educacao", concluidoPor: "Rita Campos", concluidoEm: "14/08/2026 16:20" },
      { secretaria: "saude", concluidoPor: "Paulo Nunes", concluidoEm: "14/08/2026 16:20" },
      { secretaria: "assistencia", concluidoPor: "Ines Prado", concluidoEm: "14/08/2026 16:20" },
      { secretaria: "administracao", concluidoPor: "Marina Alves", concluidoEm: "14/08/2026 16:20" },
    ],
    itens: [
      {
        id: "0142-1", item: 1, especificacao: "Papel sulfite A4, branco, 75 g/m2, pacote com 500 folhas", unidade: "PCT",
        quantidades: { educacao: 120, saude: 45, assistencia: 25, administracao: 30 },
        cotacoes: [
          { id: 1, fonte: "painel_precos", descricao: "Painel de Precos - compras federais", documento: "Item 15125 / ARP 12-2026", valorUnitario: 28.9, dataCotacao: "2026-08-04", desconsiderada: false, justificativa: "" },
          { id: 2, fonte: "pncp", descricao: "Prefeitura de Ribeirao Preto", documento: "PNCP 12345.678901/2026-11", valorUnitario: 29.5, dataCotacao: "2026-08-07", desconsiderada: false, justificativa: "" },
          { id: 3, fonte: "fornecedor", descricao: "Norte Suprimentos LTDA", documento: "CNPJ 11.222.333/0001-44", valorUnitario: 31.2, dataCotacao: "2026-08-12", desconsiderada: false, justificativa: "" },
        ],
      },
      {
        id: "0142-2", item: 2, especificacao: "Caneta esferografica azul, corpo cristal, ponta media", unidade: "CX",
        quantidades: { educacao: 40, saude: 18, assistencia: 12, administracao: 20 },
        cotacoes: [
          { id: 4, fonte: "painel_precos", descricao: "Painel de Precos - compras federais", documento: "Item 22871", valorUnitario: 42.5, dataCotacao: "2026-08-04", desconsiderada: false, justificativa: "" },
          { id: 5, fonte: "sitio_eletronico", descricao: "Distribuidora Papelar", documento: "www.papelar.com.br", valorUnitario: 44.0, dataCotacao: "2026-08-09", desconsiderada: false, justificativa: "" },
          { id: 6, fonte: "fornecedor", descricao: "Norte Suprimentos LTDA", documento: "CNPJ 11.222.333/0001-44", valorUnitario: 45.9, dataCotacao: "2026-08-12", desconsiderada: false, justificativa: "" },
        ],
      },
      {
        id: "0142-3", item: 3, especificacao: "Pasta arquivo com aba elastica, polipropileno, oficio", unidade: "UN",
        quantidades: { educacao: 80, saude: 25, assistencia: 15, administracao: 20 },
        cotacoes: [
          { id: 7, fonte: "pncp", descricao: "Prefeitura de Franca", documento: "PNCP 98765.432101/2026-02", valorUnitario: 8.4, dataCotacao: "2026-08-06", desconsiderada: false, justificativa: "" },
          { id: 8, fonte: "sitio_eletronico", descricao: "Distribuidora Papelar", documento: "www.papelar.com.br", valorUnitario: 8.9, dataCotacao: "2026-08-09", desconsiderada: false, justificativa: "" },
          { id: 9, fonte: "fornecedor", descricao: "Escritorio Total ME", documento: "CNPJ 44.555.666/0001-77", valorUnitario: 9.5, dataCotacao: "2026-08-11", desconsiderada: false, justificativa: "" },
        ],
      }
    ],
  },
  {
    id: "2026-0138",
    objeto: "Medicamentos e insumos hospitalares",
    prazoLimite: "02/09/2026",
    status: "enviado_licitacao",
    metodoPreco: "mediana",
    justificativaMetodo: "Cesta com dispersao acima de 25%: a mediana reduz o peso do extremo superior.",
    secretariaSolicitante: "saude",
    responsavel: "Marina Alves",
    atualizadoEm: "Ontem, 09:15",
    notas: "",
    lancamentos: [
      { secretaria: "saude", concluidoPor: "Paulo Nunes", concluidoEm: "11/08/2026 10:05" },
      { secretaria: "assistencia", concluidoPor: "Ines Prado", concluidoEm: "11/08/2026 15:48" },
      { secretaria: "educacao", concluidoPor: "Rita Campos", concluidoEm: "12/08/2026 09:12" },
      { secretaria: "administracao", concluidoPor: "Marina Alves", concluidoEm: "12/08/2026 11:30" },
    ],
    itens: [
      {
        id: "0138-1", item: 1, especificacao: "Dipirona sodica 500 mg, comprimido, caixa com 200 unidades", unidade: "CX",
        quantidades: { educacao: 0, saude: 180, assistencia: 40, administracao: 10 },
        cotacoes: [
          { id: 10, fonte: "tabela_referencia", descricao: "CMED - preco maximo de venda ao governo", documento: "Lista CMED 08-2026", valorUnitario: 34.9, dataCotacao: "2026-08-01", desconsiderada: false, justificativa: "" },
          { id: 11, fonte: "pncp", descricao: "Consorcio de Saude regional", documento: "PNCP 55555.111111/2026-08", valorUnitario: 36.2, dataCotacao: "2026-08-05", desconsiderada: false, justificativa: "" },
          { id: 12, fonte: "fornecedor", descricao: "Farma Distribuidora SA", documento: "CNPJ 22.333.444/0001-55", valorUnitario: 38.5, dataCotacao: "2026-08-10", desconsiderada: false, justificativa: "" },
        ],
      },
      {
        id: "0138-2", item: 2, especificacao: "Luva de procedimento nao cirurgica, latex, tamanho M, caixa com 100", unidade: "CX",
        quantidades: { educacao: 0, saude: 320, assistencia: 60, administracao: 15 },
        cotacoes: [
          { id: 13, fonte: "painel_precos", descricao: "Painel de Precos - compras federais", documento: "Item 40199", valorUnitario: 27.4, dataCotacao: "2026-08-02", desconsiderada: false, justificativa: "" },
          { id: 14, fonte: "pncp", descricao: "Prefeitura de Bauru", documento: "PNCP 33333.222222/2026-05", valorUnitario: 28.9, dataCotacao: "2026-08-06", desconsiderada: false, justificativa: "" },
          { id: 15, fonte: "fornecedor", descricao: "Hospitalar Sul LTDA", documento: "CNPJ 66.777.888/0001-99", valorUnitario: 30.1, dataCotacao: "2026-08-11", desconsiderada: false, justificativa: "" },
        ],
      },
      {
        id: "0138-3", item: 3, especificacao: "Seringa descartavel 5 ml com agulha 25 x 7 mm", unidade: "UN",
        quantidades: { educacao: 0, saude: 1500, assistencia: 200, administracao: 0 },
        cotacoes: [
          { id: 16, fonte: "painel_precos", descricao: "Painel de Precos - compras federais", documento: "Item 30871", valorUnitario: 0.78, dataCotacao: "2026-08-02", desconsiderada: false, justificativa: "" },
          { id: 17, fonte: "contrato_similar", descricao: "Ata de registro - Estado de SP", documento: "ARP 044-2026", valorUnitario: 0.82, dataCotacao: "2026-08-05", desconsiderada: false, justificativa: "" },
          { id: 18, fonte: "fornecedor", descricao: "Hospitalar Sul LTDA", documento: "CNPJ 66.777.888/0001-99", valorUnitario: 0.9, dataCotacao: "2026-08-11", desconsiderada: false, justificativa: "" },
        ],
      },
      {
        id: "0138-4", item: 4, especificacao: "Alcool etilico hidratado 70%, frasco com 1 litro", unidade: "FR",
        quantidades: { educacao: 25, saude: 240, assistencia: 80, administracao: 20 },
        cotacoes: [
          { id: 19, fonte: "pncp", descricao: "Prefeitura de Marilia", documento: "PNCP 77777.888888/2026-03", valorUnitario: 8.2, dataCotacao: "2026-08-04", desconsiderada: false, justificativa: "" },
          { id: 20, fonte: "sitio_eletronico", descricao: "Distribuidora Higiene Brasil", documento: "www.higienebrasil.com.br", valorUnitario: 8.7, dataCotacao: "2026-08-08", desconsiderada: false, justificativa: "" },
          { id: 21, fonte: "fornecedor", descricao: "Hospitalar Sul LTDA", documento: "CNPJ 66.777.888/0001-99", valorUnitario: 9.4, dataCotacao: "2026-08-11", desconsiderada: false, justificativa: "" },
        ],
      }
    ],
  },
  {
    id: "2026-0129",
    objeto: "Manutencao preventiva de veiculos",
    prazoLimite: "10/09/2026",
    status: "em_montagem",
    metodoPreco: "media",
    justificativaMetodo: "",
    secretariaSolicitante: "educacao",
    responsavel: "Marina Alves",
    atualizadoEm: "18/08/2026, 16:40",
    notas: "",
    lancamentos: [],
    itens: [
      {
        id: "0129-1", item: 1, especificacao: "Troca de oleo do motor com substituicao de filtro, veiculo leve", unidade: "SV",
        quantidades: { educacao: 18, saude: 8, assistencia: 5, administracao: 4 },
        cotacoes: [],
      },
      {
        id: "0129-2", item: 2, especificacao: "Alinhamento de direcao e balanceamento das quatro rodas, veiculo leve", unidade: "SV",
        quantidades: { educacao: 18, saude: 8, assistencia: 5, administracao: 4 },
        cotacoes: [],
      },
      {
        id: "0129-3", item: 3, especificacao: "Jogo de pastilhas de freio dianteiras para onibus escolar", unidade: "JG",
        quantidades: { educacao: 12, saude: 0, assistencia: 0, administracao: 0 },
        cotacoes: [],
      }
    ],
  },
];

export function findProcesso(id: string) {
  return demoProcessos.find((processo) => processo.id === id);
}

/**
 * Fases pelas quais um processo pode andar. Cada uma libera um tipo de edicao,
 * o que evita que secretaria e setor de compras mexam na mesma coisa ao mesmo
 * tempo.
 */
export const transicoesDeStatus: Record<ProcessoStatus, ProcessoStatus[]> = {
  em_montagem: ["coleta_quantidades", "cancelado"],
  coleta_quantidades: ["em_cotacao", "em_montagem", "cancelado"],
  em_cotacao: ["cotacao_concluida", "coleta_quantidades", "cancelado"],
  cotacao_concluida: ["mapa_elaborado", "em_cotacao", "cancelado"],
  mapa_elaborado: ["enviado_licitacao", "cotacao_concluida", "cancelado"],
  enviado_licitacao: ["em_cpl", "mapa_elaborado", "cancelado"],
  em_cpl: ["contrato_recebido", "enviado_licitacao", "cancelado"],
  contrato_recebido: ["contrato_ativo", "em_cpl", "cancelado"],
  contrato_ativo: ["encerrado", "cancelado"],
  encerrado: [],
  cancelado: ["em_montagem"],
};

export const statusDescricoes: Record<ProcessoStatus, string> = {
  em_montagem: "O Setor de Compras define os itens do lote.",
  coleta_quantidades: "As secretarias informam quanto cada uma precisa.",
  em_cotacao: "O Setor de Compras reune as cotacoes de cada item.",
  cotacao_concluida: "Precos levantados e metodo definido; falta gerar o mapa.",
  mapa_elaborado: "Mapa de precos pronto, aguardando o envio a CPL.",
  enviado_licitacao: "Mapa encaminhado; o lote fica somente para leitura ate a CPL receber.",
  em_cpl: "A CPL conduz a licitacao e registra a tramitacao.",
  contrato_recebido: "A CPL devolveu o processo: havendo contratacao, falta cadastrar o contrato; nao havendo, cancelar ou devolver a comissao.",
  contrato_ativo: "Contrato cadastrado e em vigencia, gerando saldo para as secretarias.",
  encerrado: "Contrato executado ou vencido; nao ha mais saldo a consumir.",
  cancelado: "Processo encerrado sem contratacao.",
};

/**
 * Fases que quem conduz e a CPL. As demais sao do Setor de Compras. E o que
 * impede compras de dar por recebido um processo que a comissao nunca pegou.
 */
export const fasesConduzidasPelaCpl: ProcessoStatus[] = ["em_cpl", "contrato_recebido"];

/** A fila da CPL: o que ja saiu de compras e ainda nao virou contrato cadastrado. */
export const fasesNaCpl: ProcessoStatus[] = ["enviado_licitacao", "em_cpl", "contrato_recebido"];

/**
 * Quem pode mover o processo para uma fase. Compras conduz o processo inteiro,
 * menos as duas fases que so a comissao tem como atestar.
 */
export function passouPelaCpl(status: ProcessoStatus) {
  return ["enviado_licitacao", "em_cpl", "contrato_recebido", "contrato_ativo", "encerrado"].includes(status);
}

export function podeMoverParaFase(papel: Papel, destino: ProcessoStatus) {
  if (fasesConduzidasPelaCpl.includes(destino)) return papel === "cpl";
  return papel === "compras";
}

/** Itens, especificacao e unidade so mudam enquanto o lote esta sendo montado. */
export function estruturaEditavel(status: ProcessoStatus) {
  return status === "em_montagem";
}

export function quantidadesEditaveis(status: ProcessoStatus) {
  return status === "em_montagem" || status === "coleta_quantidades";
}

/**
 * O Setor de Compras tambem corrige quantidade durante a cotacao — um erro de
 * digitacao da secretaria nao deveria obrigar a voltar o processo de fase.
 */
export function ajusteDeQuantidadePermitido(status: ProcessoStatus) {
  return status === "em_montagem" || status === "coleta_quantidades" || status === "em_cotacao";
}

/**
 * Em elaboracao o lote ainda e rascunho do proprio Setor de Compras, entao o
 * numero nao tem dono. Da coleta em diante ele foi lancado por uma secretaria,
 * e sobrescrever exige justificativa.
 */
export function ajusteExigeJustificativa(status: ProcessoStatus) {
  return status !== "em_montagem";
}

export type AjusteQuantidade = {
  secretaria: string;
  anterior: number;
  nova: number;
  justificativa: string;
  usuario: string | null;
  quando: string;
};

export function cotacoesEditaveis(status: ProcessoStatus) {
  return status === "em_montagem" || status === "em_cotacao";
}

export function statusTone(status: ProcessoStatus) {
  if (status === "em_cotacao" || status === "em_cpl") return "blue";
  if (status === "contrato_ativo") return "green";
  if (["coleta_quantidades", "cotacao_concluida", "mapa_elaborado", "enviado_licitacao", "contrato_recebido"].includes(status)) return "yellow";
  return "gray";
}

export function itemTotalQuantity(item: LoteItem) {
  return Object.values(item.quantidades).reduce((total, quantity) => total + Number(quantity || 0), 0);
}

/** Cotacoes que entram na conta: as nao desconsideradas, com valor positivo. */
export function cotacoesValidas(item: LoteItem) {
  return (item.cotacoes ?? []).filter((cotacao) => !cotacao.desconsiderada && cotacao.valorUnitario > 0);
}

export function precoUnitario(item: LoteItem, metodo: MetodoPreco) {
  const valores = cotacoesValidas(item).map((cotacao) => cotacao.valorUnitario).sort((a, b) => a - b);
  if (!valores.length) return 0;
  if (metodo === "menor") return valores[0];
  if (metodo === "mediana") {
    const meio = Math.floor(valores.length / 2);
    return valores.length % 2 ? valores[meio] : (valores[meio - 1] + valores[meio]) / 2;
  }
  return valores.reduce((total, valor) => total + valor, 0) / valores.length;
}

export function medianaDe(valores: number[]) {
  if (!valores.length) return 0;
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 ? ordenados[meio] : (ordenados[meio - 1] + ordenados[meio]) / 2;
}

/**
 * Coeficiente de variacao da cesta de precos. Acima de 25% a dispersao e alta o
 * bastante para merecer analise antes de fechar o valor de referencia.
 */
export function coeficienteVariacao(item: LoteItem) {
  const valores = cotacoesValidas(item).map((cotacao) => cotacao.valorUnitario);
  if (valores.length < 2) return 0;
  const media = valores.reduce((total, valor) => total + valor, 0) / valores.length;
  if (!media) return 0;
  const variancia = valores.reduce((total, valor) => total + (valor - media) ** 2, 0) / valores.length;
  return Math.sqrt(variancia) / media;
}

/**
 * Art. 6, par. 1 da IN 65/2021: precos excessivamente elevados ou inexequiveis
 * devem ser desconsiderados com justificativa. A norma nao fixa um corte, entao
 * aqui e apenas uma sugestao de analise — quem decide e o comprador.
 */
export function cotacoesDestoantes(item: LoteItem) {
  const validas = cotacoesValidas(item);
  if (validas.length < 3) return [] as Cotacao[];
  const mediana = medianaDe(validas.map((cotacao) => cotacao.valorUnitario));
  if (!mediana) return [] as Cotacao[];
  return validas.filter((cotacao) => Math.abs(cotacao.valorUnitario - mediana) / mediana > 0.25);
}

/** Art. 6, par. 4: a cesta deve reunir ao menos tres precos sempre que possivel. */
export const minimoDeCotacoes = 3;

export function itemPendente(item: LoteItem) {
  return cotacoesValidas(item).length < minimoDeCotacoes;
}

export function loteTotal(items: LoteItem[], metodo: MetodoPreco = "media") {
  return items.reduce((total, item) => total + precoUnitario(item, metodo) * itemTotalQuantity(item), 0);
}

export function quantidadeDe(item: LoteItem, chave: Secretaria) {
  return Number(item.quantidades?.[chave] ?? 0);
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
