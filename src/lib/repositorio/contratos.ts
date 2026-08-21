import { precoUnitario, type Processo } from "@/lib/compras";
import type { Contrato, ContratoStatus, ItemContrato } from "@/lib/contratos";
import { consultar, consultarUm, emTransacao } from "@/lib/db";
import { lerProcesso, paraDataIso } from "@/lib/repositorio/processos";

type LinhaContrato = {
  id: number;
  numero: string;
  fornecedor: string;
  cnpj_fornecedor: string;
  objeto: string;
  vigencia_inicio: string | null;
  vigencia_fim: string | null;
  valor_total: string;
  documento: string;
  status: ContratoStatus;
  processo: string | null;
  atualizado_em: string;
  itens: ItemContrato[];
};

// As datas saem formatadas do proprio Postgres para nao dependerem do fuso do
// servidor, do mesmo jeito que na consulta de processos.
const selecao = `
  select c.id, c.numero, c.fornecedor, c.cnpj_fornecedor, c.objeto,
         to_char(c.vigencia_inicio, 'DD/MM/YYYY') as vigencia_inicio,
         to_char(c.vigencia_fim, 'DD/MM/YYYY') as vigencia_fim,
         c.valor_total, c.documento, c.status, p.numero_processo as processo,
         to_char(c.atualizado_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') as atualizado_em,
         coalesce((select jsonb_agg(jsonb_build_object(
                     'id', ic.id,
                     'item', ic.numero_item,
                     'descricao', ic.descricao,
                     'unidade', ic.unidade,
                     'quantidadeContratada', ic.quantidade_contratada,
                     'valorUnitario', ic.valor_unitario)
                     order by ic.numero_item)
                   from itens_contrato ic where ic.contrato_id = c.id), '[]'::jsonb) as itens
  from contratos c
  left join processos_compra p on p.id = c.processo_id`;

function paraContrato(linha: LinhaContrato): Contrato {
  return {
    id: linha.id,
    numero: linha.numero,
    fornecedor: linha.fornecedor,
    cnpjFornecedor: linha.cnpj_fornecedor,
    objeto: linha.objeto,
    vigenciaInicio: linha.vigencia_inicio,
    vigenciaFim: linha.vigencia_fim,
    valorTotal: Number(linha.valor_total),
    documento: linha.documento,
    status: linha.status,
    processo: linha.processo,
    atualizadoEm: linha.atualizado_em,
    itens: (linha.itens ?? []).map((item) => ({
      ...item,
      quantidadeContratada: Number(item.quantidadeContratada),
      valorUnitario: Number(item.valorUnitario),
    })),
  };
}

export async function listarContratos(prefeituraId: number) {
  const linhas = await consultar<LinhaContrato>(
    `${selecao} where c.prefeitura_id = $1 order by c.vigencia_fim nulls last, c.numero`,
    [prefeituraId],
  );
  return linhas.map(paraContrato);
}

export async function lerContrato(prefeituraId: number, numero: string) {
  const linha = await consultarUm<LinhaContrato>(
    `${selecao} where c.prefeitura_id = $1 and c.numero = $2`,
    [prefeituraId, numero],
  );
  return linha ? paraContrato(linha) : null;
}

/**
 * Itens do lote convertidos em itens de contrato: a quantidade e a soma do que
 * as secretarias pediram e o valor unitario e o preco de referencia apurado
 * pelo metodo escolhido no processo. Sao so valores iniciais — o contrato
 * assinado pode divergir, e a tela deixa corrigir.
 */
function itensDoProcesso(processo: Processo) {
  return processo.itens.map((item) => ({
    numeroItem: item.item,
    descricao: item.especificacao,
    unidade: item.unidade,
    quantidade: Object.values(item.quantidades).reduce((total, valor) => total + Number(valor || 0), 0),
    valorUnitario: precoUnitario(item, processo.metodoPreco),
  }));
}

export type DadosContrato = {
  numero: string;
  fornecedor: string;
  cnpjFornecedor: string;
  objeto: string;
  vigenciaInicio: string | null;
  vigenciaFim: string | null;
  documento: string;
  status: ContratoStatus;
};

export type DadosNovoContrato = DadosContrato & {
  /** Processo de origem; nulo em contrato herdado de antes do portal. */
  processoNumero: string | null;
  /** Traz os itens do lote ja preenchidos, em vez de comecar com o contrato vazio. */
  copiarItens: boolean;
};

/**
 * Cadastra o contrato que voltou da CPL. Quando ele nasce de um processo que
 * estava em "Contrato recebido", o proprio cadastro leva o processo para
 * "Contrato ativo": e o cadastro que atesta o fato, e nao um clique a parte.
 */
export async function criarContrato(prefeituraId: number, usuarioId: number | null, dados: DadosNovoContrato) {
  const processo = dados.processoNumero ? await lerProcesso(prefeituraId, dados.processoNumero) : null;
  if (dados.processoNumero && !processo) return { erro: "processo-nao-encontrado" as const };
  const itens = processo && dados.copiarItens ? itensDoProcesso(processo) : [];

  return emTransacao(async (executar) => {
    const [existente] = (await executar(
      "select id from contratos where prefeitura_id = $1 and numero = $2",
      [prefeituraId, dados.numero],
    )) as Array<{ id: number }>;
    if (existente) return { erro: "numero-duplicado" as const };

    const [criado] = (await executar(
      `insert into contratos (prefeitura_id, processo_id, numero, fornecedor, cnpj_fornecedor, objeto,
                              vigencia_inicio, vigencia_fim, documento, status, criado_por_id)
       values ($1,
               (select id from processos_compra where prefeitura_id = $1 and numero_processo = $2),
               $3, $4, $5, $6, $7, $8, $9, $10::contrato_status, $11)
       returning id`,
      [
        prefeituraId, dados.processoNumero, dados.numero, dados.fornecedor, dados.cnpjFornecedor,
        dados.objeto, paraDataIso(dados.vigenciaInicio), paraDataIso(dados.vigenciaFim),
        dados.documento, dados.status, usuarioId,
      ],
    )) as Array<{ id: number }>;

    for (const item of itens) {
      await executar(
        `insert into itens_contrato (contrato_id, numero_item, item_lote_id, descricao, unidade, quantidade_contratada, valor_unitario)
         select $1, $2, i.id, $3, $4, $5, $6
         from itens_lote i
         join processos_compra p on p.id = i.processo_id
         where p.prefeitura_id = $7 and p.numero_processo = $8 and i.numero_item = $2`,
        [criado.id, item.numeroItem, item.descricao, item.unidade, item.quantidade, item.valorUnitario, prefeituraId, dados.processoNumero],
      );
    }

    await recalcularValor(executar, criado.id);

    // O processo so avanca se estava mesmo esperando o contrato; um contrato
    // cadastrado fora de hora nao deve reescrever a fase de um processo em
    // qualquer outro ponto do fluxo.
    if (processo?.status === "contrato_recebido") {
      await executar(
        `update processos_compra set status = 'contrato_ativo'::processo_status, atualizado_em = now()
         where prefeitura_id = $1 and numero_processo = $2`,
        [prefeituraId, dados.processoNumero],
      );
      await executar(
        `insert into historico_status (processo_id, de, para, usuario_id, observacao)
         select id, 'contrato_recebido'::processo_status, 'contrato_ativo'::processo_status, $3, $4
         from processos_compra where prefeitura_id = $1 and numero_processo = $2`,
        [prefeituraId, dados.processoNumero, usuarioId, `Contrato ${dados.numero} cadastrado.`],
      );
    }

    return { numero: dados.numero };
  });
}

export async function atualizarContrato(prefeituraId: number, numero: string, dados: Partial<DadosContrato>) {
  const linha = await consultarUm<{ id: number }>(
    `update contratos set
       fornecedor = coalesce($3, fornecedor),
       cnpj_fornecedor = coalesce($4, cnpj_fornecedor),
       objeto = coalesce($5, objeto),
       vigencia_inicio = coalesce($6::date, vigencia_inicio),
       vigencia_fim = coalesce($7::date, vigencia_fim),
       documento = coalesce($8, documento),
       status = coalesce($9::contrato_status, status),
       atualizado_em = now()
     where prefeitura_id = $1 and numero = $2
     returning id`,
    [
      prefeituraId, numero,
      dados.fornecedor ?? null, dados.cnpjFornecedor ?? null, dados.objeto ?? null,
      dados.vigenciaInicio ? paraDataIso(dados.vigenciaInicio) : null,
      dados.vigenciaFim ? paraDataIso(dados.vigenciaFim) : null,
      dados.documento ?? null, dados.status ?? null,
    ],
  );
  return Boolean(linha);
}

type Executar = (sql: string, valores?: unknown[]) => Promise<Record<string, unknown>[]>;

/** O valor do contrato e sempre a soma dos itens; nunca chega digitado do cliente. */
async function recalcularValor(executar: Executar, contratoId: number) {
  await executar(
    `update contratos set valor_total = coalesce(
       (select sum(quantidade_contratada * valor_unitario) from itens_contrato where contrato_id = $1), 0)
     where id = $1`,
    [contratoId],
  );
}

/**
 * Grava a lista inteira de itens de uma vez, reconciliando por numero do item —
 * o mesmo contrato do lote, para nao depender de ids temporarios criados na tela.
 */
export async function salvarItensContrato(prefeituraId: number, numero: string, itens: ItemContrato[]) {
  return emTransacao(async (executar) => {
    // O filtro por prefeitura no proprio UPDATE e o que impede uma prefeitura
    // de gravar no contrato de outra, mesmo adivinhando o numero.
    const [contrato] = (await executar(
      "update contratos set atualizado_em = now() where prefeitura_id = $1 and numero = $2 returning id",
      [prefeituraId, numero],
    )) as Array<{ id: number }>;
    if (!contrato) return false;

    await executar("delete from itens_contrato where contrato_id = $1 and not (numero_item = any($2::int[]))", [
      contrato.id,
      itens.map((item) => item.item),
    ]);

    for (const item of itens) {
      await executar(
        `insert into itens_contrato (contrato_id, numero_item, descricao, unidade, quantidade_contratada, valor_unitario)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (contrato_id, numero_item)
         do update set descricao = excluded.descricao, unidade = excluded.unidade,
                       quantidade_contratada = excluded.quantidade_contratada,
                       valor_unitario = excluded.valor_unitario`,
        [contrato.id, item.item, item.descricao, item.unidade, Number(item.quantidadeContratada || 0), Number(item.valorUnitario || 0)],
      );
    }

    await recalcularValor(executar, contrato.id);
    return true;
  });
}

export async function removerContrato(prefeituraId: number, numero: string) {
  const linha = await consultarUm<{ id: number }>(
    "delete from contratos where prefeitura_id = $1 and numero = $2 returning id",
    [prefeituraId, numero],
  );
  return Boolean(linha);
}

/**
 * Sugere o proximo numero no padrao "NNN/AAAA", que e como o contrato costuma
 * ser numerado no municipio. E so uma sugestao: o numero vem do instrumento.
 */
export async function proximoNumeroContrato(prefeituraId: number, ano: number) {
  const linha = await consultarUm<{ maior: number | null }>(
    `select max(substring(numero from '^\\d+')::int) as maior
     from contratos
     where prefeitura_id = $1 and numero like $2`,
    [prefeituraId, `%/${ano}`],
  );
  return `${String((linha?.maior ?? 0) + 1).padStart(3, "0")}/${ano}`;
}
