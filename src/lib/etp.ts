import {
  cotacoesValidas,
  fonteLabels,
  itemTotalQuantity,
  loteTotal,
  metodoLabels,
  minimoDeCotacoes,
  money,
  nomeCurtoSecretaria,
  precoUnitario,
  quantidadeDe,
  type Processo,
  type SecretariaInfo,
} from "@/lib/compras";
import { prioridadeLabels, type Dfd } from "@/lib/dfd";

/**
 * Estudo Tecnico Preliminar (art. 18 da Lei 14.133/2021).
 *
 * Cinco dos treze incisos o portal ja sabe responder: a necessidade esta no
 * DFD, as quantidades e a memoria de calculo estao no lote, o levantamento de
 * mercado e a estimativa de valor estao na pesquisa de precos. Esses nao viram
 * campo digitado — sao derivados a cada leitura, enquanto o estudo e rascunho.
 *
 * Ao concluir, o derivado e congelado num instantaneo: um ETP assinado nao pode
 * mudar de conteudo porque alguem editou uma cotacao na semana seguinte.
 */

/** Os valores sao os mesmos do enum etp_status no banco. */
export type EtpStatus = "rascunho" | "concluido";

export const etpStatusLabels: Record<EtpStatus, string> = {
  rascunho: "Em elaboracao",
  concluido: "Concluido",
};

/** Os incisos discursivos, que sao os que viram coluna. */
export type CampoEtp =
  | "previsaoPca"
  | "requisitos"
  | "solucao"
  | "parcelamento"
  | "resultados"
  | "providencias"
  | "correlatas"
  | "impactos"
  | "posicionamento";

export type Inciso = {
  numero: string;
  titulo: string;
  ajuda: string;
  /** Campo digitado; ausente quando o inciso e derivado dos dados do portal. */
  campo?: CampoEtp;
  /** Art. 18, par. 2: I, IV, VI, VIII e XIII sao obrigatorios. */
  obrigatorio: boolean;
};

export const incisos: Inciso[] = [
  { numero: "I", titulo: "Descricao da necessidade", obrigatorio: true,
    ajuda: "Vem do DFD da secretaria: o problema a resolver e o interesse publico envolvido." },
  { numero: "II", titulo: "Previsao no plano de contratacoes anual", obrigatorio: false, campo: "previsaoPca",
    ajuda: "Diga se a contratacao consta do PCA do exercicio e sob qual item." },
  { numero: "III", titulo: "Requisitos da contratacao", obrigatorio: false, campo: "requisitos",
    ajuda: "Requisitos tecnicos, de qualidade, prazo de entrega, garantia e sustentabilidade." },
  { numero: "IV", titulo: "Estimativa das quantidades e memorias de calculo", obrigatorio: true,
    ajuda: "Vem das quantidades lancadas por cada secretaria e da memoria de calculo do DFD." },
  { numero: "V", titulo: "Levantamento de mercado", obrigatorio: false,
    ajuda: "Vem das fontes consultadas na pesquisa de precos, na ordem do art. 5 da IN 65/2021." },
  { numero: "VI", titulo: "Estimativa do valor da contratacao", obrigatorio: true,
    ajuda: "Vem do metodo de formacao de preco adotado no processo e das cotacoes consideradas." },
  { numero: "VII", titulo: "Descricao da solucao como um todo", obrigatorio: false, campo: "solucao",
    ajuda: "Como a contratacao se encaixa no servico: entrega, instalacao, treinamento, assistencia." },
  { numero: "VIII", titulo: "Justificativa para o parcelamento ou nao", obrigatorio: true, campo: "parcelamento",
    ajuda: "Art. 40, V, b: adjudicar por item amplia a disputa; parcelar de menos exige explicacao." },
  { numero: "IX", titulo: "Resultados pretendidos", obrigatorio: false, campo: "resultados",
    ajuda: "O que muda para o cidadao e para a administracao quando a compra acontecer." },
  { numero: "X", titulo: "Providencias previas ao contrato", obrigatorio: false, campo: "providencias",
    ajuda: "Adequacao de espaco, capacitacao de servidores, ajustes de sistema, fiscal designado." },
  { numero: "XI", titulo: "Contratacoes correlatas e interdependentes", obrigatorio: false, campo: "correlatas",
    ajuda: "Outras contratacoes que precisam existir junto ou antes desta." },
  { numero: "XII", titulo: "Impactos ambientais", obrigatorio: false, campo: "impactos",
    ajuda: "Logistica reversa, descarte, criterios de sustentabilidade exigidos." },
  { numero: "XIII", titulo: "Posicionamento conclusivo", obrigatorio: true, campo: "posicionamento",
    ajuda: "Diga, em uma frase, se a contratacao e viavel e deve prosseguir." },
];

export const camposDoEtp = incisos.filter((inciso) => inciso.campo).map((inciso) => inciso.campo!) as CampoEtp[];

export type Etp = {
  processo: string;
  status: EtpStatus;
  previsaoPca: string;
  requisitos: string;
  solucao: string;
  parcelamento: string;
  resultados: string;
  providencias: string;
  correlatas: string;
  impactos: string;
  posicionamento: string;
  /** Art. 18, par. 2: inciso nao contemplado exige justificativa. */
  omissoes: string;
  instantaneo: InstantaneoEtp | null;
  autor: string | null;
  concluidoPor: string | null;
  concluidoEm: string | null;
  atualizadoEm: string;
};

export type LinhaItemEtp = {
  item: number;
  descricao: string;
  unidade: string;
  quantidade: number;
  memoria: string;
  cotacoes: number;
  valorUnitario: number;
  total: number;
};

/** O que o portal responde sozinho — vivo no rascunho, congelado na conclusao. */
export type InstantaneoEtp = {
  necessidade: string;
  quantidades: string;
  mercado: string;
  valor: string;
  itens: LinhaItemEtp[];
  fontes: Array<{ fonte: string; consultas: number }>;
  valorTotal: number;
  demanda: string | null;
  /** Preenchido no momento da conclusao; vazio enquanto e rascunho. */
  geradoEm: string;
};

function frase(partes: Array<string | null | undefined>) {
  return partes.filter((parte) => parte && String(parte).trim()).join(" ");
}

/**
 * Monta os incisos derivados a partir do DFD, do lote e das cotacoes. Nenhum
 * destes textos e gravado enquanto o estudo e rascunho: se a cotacao muda, o
 * ETP muda junto, que e o comportamento certo antes de assinar.
 */
export function derivarEtp(dados: { processo: Processo; dfd: Dfd | null; secretarias: SecretariaInfo[] }): InstantaneoEtp {
  const { processo, dfd, secretarias } = dados;
  const metodo = processo.metodoPreco;

  const memorias = new Map((dfd?.itens ?? []).map((item) => [item.item, item.memoria]));
  const itens: LinhaItemEtp[] = processo.itens.map((item) => {
    const quantidade = itemTotalQuantity(item);
    const unitario = precoUnitario(item, metodo);
    return {
      item: item.item,
      descricao: item.especificacao,
      unidade: item.unidade,
      quantidade,
      memoria: memorias.get(item.item) ?? "",
      cotacoes: cotacoesValidas(item).length,
      valorUnitario: unitario,
      total: unitario * quantidade,
    };
  });

  const contagemPorFonte = new Map<string, number>();
  for (const item of processo.itens) {
    for (const cotacao of cotacoesValidas(item)) {
      const rotulo = fonteLabels[cotacao.fonte];
      contagemPorFonte.set(rotulo, (contagemPorFonte.get(rotulo) ?? 0) + 1);
    }
  }
  const fontes = [...contagemPorFonte.entries()]
    .map(([fonte, consultas]) => ({ fonte, consultas }))
    .sort((a, b) => b.consultas - a.consultas);
  const totalCotacoes = fontes.reduce((total, linha) => total + linha.consultas, 0);
  const semCesta = itens.filter((item) => item.cotacoes < minimoDeCotacoes).length;

  const necessidade = dfd
    ? frase([
        `A demanda foi formalizada pela ${dfd.secretariaNome} no DFD ${dfd.numero}, em ${dfd.criadoEm}, com prioridade ${prioridadeLabels[dfd.prioridade].toLowerCase()}.`,
        dfd.justificativa,
        dfd.dataPretendida ? `A secretaria pretende ser atendida ate ${dfd.dataPretendida}.` : null,
        dfd.previsaoPca ? "A demanda foi indicada como prevista no plano de contratacoes anual." : null,
        dfd.vinculacao ? `Vinculacao informada: ${dfd.vinculacao}` : null,
      ])
    : frase([
        `A contratacao tem por objeto ${processo.objeto}.`,
        "A demanda foi registrada diretamente no processo pelo Setor de Compras, sem DFD vinculado no portal.",
      ]);

  const porSecretaria = secretarias
    .map((secretaria) => {
      const total = processo.itens.reduce((soma, item) => soma + quantidadeDe(item, secretaria.chave), 0);
      return total ? `${secretaria.nome}: ${total.toLocaleString("pt-BR")}` : null;
    })
    .filter(Boolean)
    .join("; ");
  const ajustes = processo.itens.reduce((total, item) => total + (item.ajustes?.length ?? 0), 0);

  const quantidades = frase([
    `O lote reune ${itens.length} ${itens.length === 1 ? "item" : "itens"}, somando ${itens.reduce((total, item) => total + item.quantidade, 0).toLocaleString("pt-BR")} unidades.`,
    porSecretaria ? `Quantidades lancadas por secretaria — ${porSecretaria}.` : null,
    dfd && memorias.size ? "As memorias de calculo declaradas no DFD acompanham cada item na tabela abaixo." : null,
    ajustes ? `${ajustes} ${ajustes === 1 ? "ajuste de quantidade foi registrado" : "ajustes de quantidade foram registrados"} pelo Setor de Compras, com justificativa, e constam do mapa de precos.` : null,
  ]);

  const mercado = totalCotacoes
    ? frase([
        `Foram consideradas ${totalCotacoes} ${totalCotacoes === 1 ? "cotacao" : "cotacoes"} de ${fontes.length} ${fontes.length === 1 ? "fonte" : "fontes"}: ${fontes.map((linha) => `${linha.fonte} (${linha.consultas})`).join(", ")}.`,
        "A consulta seguiu a ordem de preferencia do art. 5 da IN SEGES/ME 65/2021, com bases publicas antes da pesquisa direta com fornecedor.",
        semCesta
          ? `${semCesta} ${semCesta === 1 ? "item ainda esta" : "itens ainda estao"} abaixo das ${minimoDeCotacoes} cotacoes recomendadas pelo art. 6, par. 4.`
          : `Todos os itens reuniram ao menos ${minimoDeCotacoes} precos, como recomenda o art. 6, par. 4.`,
      ])
    : "Nenhuma cotacao foi registrada no processo ate a emissao deste estudo.";

  const valorTotal = loteTotal(processo.itens, metodo);
  const valor = frase([
    `O valor estimado da contratacao e de ${money(valorTotal)},`,
    `apurado pelo metodo "${metodoLabels[metodo]}", entre as cotacoes consideradas, nos termos do art. 6 da IN SEGES/ME 65/2021.`,
    processo.justificativaMetodo ? `Justificativa do metodo: ${processo.justificativaMetodo}` : null,
    "Os precos unitarios de referencia constam da tabela abaixo e o detalhamento de cada cotacao, do mapa de precos do processo.",
  ]);

  return {
    necessidade,
    quantidades,
    mercado,
    valor,
    itens,
    fontes,
    valorTotal,
    demanda: dfd?.numero ?? null,
    geradoEm: "",
  };
}

/** Sugestoes iniciais: o comprador corrige, mas nao comeca de uma pagina em branco. */
export function sugestoes(processo: Processo, secretarias: SecretariaInfo[]): Partial<Record<CampoEtp, string>> {
  const itens = processo.itens.length;
  const solicitante = nomeCurtoSecretaria(secretarias, processo.secretariaSolicitante);
  return {
    parcelamento: itens > 1
      ? `O objeto e divisivel e a adjudicacao sera por item, o que amplia a disputa e permite a participacao de fornecedores de menor porte, nos termos do art. 40, V, b, da Lei 14.133/2021. Os ${itens} itens do lote sao autonomos entre si e nao ha perda de economia de escala relevante no fracionamento.`
      : "O objeto e composto por um unico item, o que torna o parcelamento inaplicavel.",
    resultados: `Atendimento da demanda ${solicitante === "-" ? "das secretarias" : `da ${solicitante}`} sem interrupcao do servico, com preco de referencia formado por pesquisa documentada.`,
    posicionamento: "A contratacao e viavel tecnica e economicamente e deve prosseguir para a fase externa.",
  };
}

/** O que impede a conclusao: os obrigatorios do art. 18, par. 2, e a justificativa das omissoes. */
export function faltaParaConcluir(etp: Etp, derivado: InstantaneoEtp) {
  const faltas: string[] = [];
  for (const inciso of incisos) {
    if (!inciso.campo) continue;
    const preenchido = String(etp[inciso.campo] ?? "").trim();
    if (inciso.obrigatorio && !preenchido) faltas.push(`${inciso.numero} — ${inciso.titulo}`);
  }
  if (!derivado.itens.length) faltas.push("IV — o lote nao tem itens");
  if (!derivado.valorTotal) faltas.push("VI — o processo nao tem preco de referencia apurado");
  if (incisosOmitidos(etp).length && !etp.omissoes.trim()) {
    faltas.push("justificativa dos incisos nao contemplados (art. 18, par. 2)");
  }
  return faltas;
}

export function incisosOmitidos(etp: Etp) {
  return incisos.filter((inciso) => inciso.campo && !inciso.obrigatorio && !String(etp[inciso.campo] ?? "").trim());
}

export function etpVazio(processo: string): Etp {
  return {
    processo,
    status: "rascunho",
    previsaoPca: "",
    requisitos: "",
    solucao: "",
    parcelamento: "",
    resultados: "",
    providencias: "",
    correlatas: "",
    impactos: "",
    posicionamento: "",
    omissoes: "",
    instantaneo: null,
    autor: null,
    concluidoPor: null,
    concluidoEm: null,
    atualizadoEm: "-",
  };
}
