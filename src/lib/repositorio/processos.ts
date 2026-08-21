import type { Cotacao, LoteItem, MetodoPreco, Processo, ProcessoStatus, Secretaria } from "@/lib/compras";
import { consultar, consultarUm, emTransacao } from "@/lib/db";

type LinhaProcesso = {
  id: number;
  numero_processo: string;
  objeto: string;
  prazo_limite: string | null;
  status: ProcessoStatus;
  secretaria_solicitante: Secretaria | null;
  responsavel: string;
  notas_processo: string;
  metodo_preco: MetodoPreco;
  justificativa_metodo: string;
  atualizado_em: string;
};

type LinhaItem = {
  processo_id: number;
  numero_item: number;
  especificacao: string;
  unidade: string;
  quantidades: Record<string, number>;
  cotacoes: Cotacao[];
};

// As datas sao formatadas no proprio Postgres para nao dependerem do fuso do servidor.
const selecaoProcesso = `
  select p.id, p.numero_processo, p.objeto,
         to_char(p.prazo_limite, 'DD/MM/YYYY') as prazo_limite,
         p.status, sec.chave as secretaria_solicitante, p.responsavel, p.notas_processo,
         p.metodo_preco, p.justificativa_metodo,
         to_char(p.atualizado_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') as atualizado_em
  from processos_compra p
  left join secretarias sec on sec.id = p.secretaria_solicitante_id`;

const selecaoItens = `
  select i.processo_id, i.numero_item, i.especificacao, i.unidade,
         coalesce((select jsonb_object_agg(s.chave, q.quantidade)
                   from item_quantidades q join secretarias s on s.id = q.secretaria_id
                   where q.item_id = i.id), '{}'::jsonb) as quantidades,
         coalesce((select jsonb_agg(jsonb_build_object(
                     'id', c.id,
                     'fonte', c.fonte_tipo,
                     'descricao', c.descricao,
                     'documento', c.documento,
                     'valorUnitario', c.valor_unitario,
                     'dataCotacao', to_char(c.data_cotacao, 'DD/MM/YYYY'),
                     'desconsiderada', c.desconsiderada,
                     'justificativa', c.justificativa)
                     order by c.desconsiderada, c.valor_unitario)
                   from cotacoes c where c.item_id = i.id), '[]'::jsonb) as cotacoes
  from itens_lote i
  where i.processo_id = any($1::int[])
  order by i.numero_item`;

function paraItem(linha: LinhaItem, chaves: string[]): LoteItem {
  const gravadas = Object.entries(linha.quantidades ?? {}).map(([chave, valor]) => [chave, Number(valor)]);
  const quantidades = {
    ...Object.fromEntries(chaves.map((chave) => [chave, 0])),
    ...Object.fromEntries(gravadas),
  } as Record<Secretaria, number>;
  const cotacoes = (linha.cotacoes ?? []).map((cotacao) => ({
    ...cotacao,
    valorUnitario: Number(cotacao.valorUnitario),
  }));
  return {
    id: `${linha.processo_id}-${linha.numero_item}`,
    item: linha.numero_item,
    especificacao: linha.especificacao,
    unidade: linha.unidade,
    quantidades,
    cotacoes,
  };
}

function paraProcesso(linha: LinhaProcesso, itens: LoteItem[]): Processo {
  return {
    id: linha.numero_processo,
    objeto: linha.objeto,
    prazoLimite: linha.prazo_limite ?? "-",
    status: linha.status,
    metodoPreco: linha.metodo_preco,
    justificativaMetodo: linha.justificativa_metodo,
    secretariaSolicitante: linha.secretaria_solicitante,
    responsavel: linha.responsavel,
    atualizadoEm: linha.atualizado_em,
    notas: linha.notas_processo,
    itens,
  };
}

async function montar(prefeituraId: number, linhas: LinhaProcesso[]) {
  if (!linhas.length) return [];
  const [itens, secretarias] = await Promise.all([
    consultar<LinhaItem>(selecaoItens, [linhas.map((linha) => linha.id)]),
    consultar<{ chave: string }>("select chave from secretarias where prefeitura_id = $1 order by ordem", [prefeituraId]),
  ]);
  const chaves = secretarias.map((secretaria) => secretaria.chave);
  const porProcesso = new Map<number, LoteItem[]>();
  for (const linha of itens) {
    const lista = porProcesso.get(linha.processo_id) ?? [];
    lista.push(paraItem(linha, chaves));
    porProcesso.set(linha.processo_id, lista);
  }
  return linhas.map((linha) => paraProcesso(linha, porProcesso.get(linha.id) ?? []));
}

export async function listarProcessos(prefeituraId: number) {
  return montar(prefeituraId, await consultar<LinhaProcesso>(
    `${selecaoProcesso} where p.prefeitura_id = $1 order by p.prazo_limite nulls last, p.numero_processo`,
    [prefeituraId],
  ));
}

export async function lerProcesso(prefeituraId: number, numero: string) {
  const linhas = await consultar<LinhaProcesso>(
    `${selecaoProcesso} where p.prefeitura_id = $1 and p.numero_processo = $2`,
    [prefeituraId, numero],
  );
  return (await montar(prefeituraId, linhas))[0] ?? null;
}

/**
 * Grava o lote inteiro de uma vez: o cliente manda o estado desejado e a
 * reconciliacao acontece por numero_item, para nao depender de ids temporarios
 * de itens criados na tela.
 */
export async function salvarLote(
  prefeituraId: number,
  numero: string,
  dados: { notas: string; itens: LoteItem[] },
  autorId: number | null = null,
) {
  return emTransacao(async (executar) => {
    // O filtro por prefeitura no proprio UPDATE e o que impede uma prefeitura
    // de gravar no processo de outra, mesmo que o numero seja adivinhado.
    const [processo] = (await executar(
      "update processos_compra set notas_processo = $3, atualizado_em = now() where prefeitura_id = $1 and numero_processo = $2 returning id",
      [prefeituraId, numero, dados.notas],
    )) as Array<{ id: number }>;
    if (!processo) return false;

    // As secretarias sao as que a prefeitura tem hoje, e nao uma lista fixa.
    const secretarias = (await executar("select id, chave from secretarias where prefeitura_id = $1", [prefeituraId])) as Array<{ id: number; chave: string }>;

    await executar("delete from itens_lote where processo_id = $1 and not (numero_item = any($2::int[]))", [
      processo.id,
      dados.itens.map((item) => item.item),
    ]);

    for (const item of dados.itens) {
      const [linha] = (await executar(
        `insert into itens_lote (processo_id, numero_item, especificacao, unidade) values ($1, $2, $3, $4)
         on conflict (processo_id, numero_item)
         do update set especificacao = excluded.especificacao, unidade = excluded.unidade
         returning id`,
        [processo.id, item.item, item.especificacao, item.unidade],
      )) as Array<{ id: number }>;

      for (const secretaria of secretarias) {
        await executar(
          `insert into item_quantidades (item_id, secretaria_id, quantidade, atualizado_por_id)
           values ($1, $2, $3, $4)
           on conflict (item_id, secretaria_id)
           do update set quantidade = excluded.quantidade, atualizado_por_id = excluded.atualizado_por_id, atualizado_em = now()`,
          [linha.id, secretaria.id, Number(item.quantidades[secretaria.chave] ?? 0), autorId],
        );
      }

    }
    return true;
  });
}

type DadosCotacao = {
  fonte: string;
  descricao: string;
  documento: string;
  valorUnitario: number;
  dataCotacao: string | null;
  desconsiderada: boolean;
  justificativa: string;
};

/** "12/08/2026" -> "2026-08-12"; qualquer outra coisa vira nulo. */
function paraDataIso(valor: string | null) {
  if (!valor) return null;
  const partes = valor.split("/");
  if (partes.length !== 3) return null;
  const [dia, mes, ano] = partes;
  return `${ano}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}`;
}

/**
 * Confere que o item pertence mesmo a um processo daquela prefeitura antes de
 * qualquer escrita: e o que impede uma prefeitura de lancar cotacao na outra.
 */
async function idDoItem(prefeituraId: number, numero: string, numeroItem: number) {
  const linha = await consultarUm<{ id: number }>(
    `select i.id from itens_lote i
     join processos_compra p on p.id = i.processo_id
     where p.prefeitura_id = $1 and p.numero_processo = $2 and i.numero_item = $3`,
    [prefeituraId, numero, numeroItem],
  );
  return linha?.id ?? null;
}

export async function criarCotacao(prefeituraId: number, numero: string, numeroItem: number, dados: DadosCotacao) {
  const itemId = await idDoItem(prefeituraId, numero, numeroItem);
  if (!itemId) return null;
  const linha = await consultarUm<{ id: number }>(
    `insert into cotacoes (item_id, fonte_tipo, descricao, documento, valor_unitario, data_cotacao, desconsiderada, justificativa)
     values ($1, $2::fonte_cotacao, $3, $4, $5, $6, $7, $8) returning id`,
    [itemId, dados.fonte, dados.descricao, dados.documento, dados.valorUnitario, paraDataIso(dados.dataCotacao), dados.desconsiderada, dados.justificativa],
  );
  await consultar("update processos_compra set atualizado_em = now() where numero_processo = $1 and prefeitura_id = $2", [numero, prefeituraId]);
  return linha?.id ?? null;
}

export async function atualizarCotacao(prefeituraId: number, cotacaoId: number, dados: Partial<DadosCotacao>) {
  const linha = await consultarUm<{ id: number }>(
    `update cotacoes c set
       fonte_tipo = coalesce($3::fonte_cotacao, c.fonte_tipo),
       descricao = coalesce($4, c.descricao),
       documento = coalesce($5, c.documento),
       valor_unitario = coalesce($6, c.valor_unitario),
       data_cotacao = coalesce($7::date, c.data_cotacao),
       desconsiderada = coalesce($8, c.desconsiderada),
       justificativa = coalesce($9, c.justificativa)
     from itens_lote i join processos_compra p on p.id = i.processo_id
     where c.id = $2 and c.item_id = i.id and p.prefeitura_id = $1
     returning c.id`,
    [
      prefeituraId, cotacaoId,
      dados.fonte ?? null, dados.descricao ?? null, dados.documento ?? null,
      dados.valorUnitario ?? null, dados.dataCotacao ? paraDataIso(dados.dataCotacao) : null,
      dados.desconsiderada ?? null, dados.justificativa ?? null,
    ],
  );
  return Boolean(linha);
}

export async function removerCotacao(prefeituraId: number, cotacaoId: number) {
  const linha = await consultarUm<{ id: number }>(
    `delete from cotacoes c
     using itens_lote i, processos_compra p
     where c.id = $2 and c.item_id = i.id and i.processo_id = p.id and p.prefeitura_id = $1
     returning c.id`,
    [prefeituraId, cotacaoId],
  );
  return Boolean(linha);
}

export async function definirMetodo(prefeituraId: number, numero: string, metodo: MetodoPreco, justificativa: string) {
  const linha = await consultarUm<{ id: number }>(
    `update processos_compra set metodo_preco = $3::metodo_preco, justificativa_metodo = $4, atualizado_em = now()
     where prefeitura_id = $1 and numero_processo = $2 returning id`,
    [prefeituraId, numero, metodo, justificativa],
  );
  return Boolean(linha);
}

/** Muda a fase do processo e deixa registrado quem mudou, para o processo administrativo. */
export async function alterarStatus(prefeituraId: number, numero: string, novo: ProcessoStatus, usuarioId: number | null, observacao: string) {
  return emTransacao(async (executar) => {
    const [atual] = (await executar(
      "select id, status from processos_compra where prefeitura_id = $1 and numero_processo = $2 for update",
      [prefeituraId, numero],
    )) as Array<{ id: number; status: ProcessoStatus }>;
    if (!atual) return { erro: "processo-nao-encontrado" as const };
    await executar("update processos_compra set status = $2::processo_status, atualizado_em = now() where id = $1", [atual.id, novo]);
    await executar(
      "insert into historico_status (processo_id, de, para, usuario_id, observacao) values ($1, $2::processo_status, $3::processo_status, $4, $5)",
      [atual.id, atual.status, novo, usuarioId, observacao],
    );
    return { anterior: atual.status };
  });
}

export type EventoStatus = {
  de: ProcessoStatus | null;
  para: ProcessoStatus;
  usuario: string | null;
  observacao: string;
  quando: string;
};

export async function historicoDoProcesso(prefeituraId: number, numero: string) {
  return consultar<EventoStatus>(
    `select h.de, h.para, u.nome as usuario, h.observacao,
            to_char(h.criado_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') as quando
     from historico_status h
     join processos_compra p on p.id = h.processo_id
     left join usuarios u on u.id = h.usuario_id
     where p.prefeitura_id = $1 and p.numero_processo = $2
     order by h.criado_em desc`,
    [prefeituraId, numero],
  );
}
