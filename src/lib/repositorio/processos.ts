import type { LoteItem, Processo, ProcessoStatus, Secretaria } from "@/lib/compras";
import { consultar, emTransacao } from "@/lib/db";

/** A coluna `fonte` guarda o rotulo; a interface trabalha com as tres chaves fixas. */
const fontePorChave: Record<keyof LoteItem["cotacoes"], string> = { bnc: "BNC", pncp: "PNCP", mercado: "Mercado" };
const chavePorFonte: Record<string, keyof LoteItem["cotacoes"]> = { BNC: "bnc", PNCP: "pncp", Mercado: "mercado" };

type LinhaProcesso = {
  id: number;
  numero_processo: string;
  objeto: string;
  prazo_limite: string | null;
  status: ProcessoStatus;
  secretaria_solicitante: Secretaria | null;
  responsavel: string;
  notas_processo: string;
  atualizado_em: string;
};

type LinhaItem = {
  processo_id: number;
  numero_item: number;
  especificacao: string;
  unidade: string;
  quantidades: Record<string, number>;
  cotacoes: Record<string, number>;
};

// As datas sao formatadas no proprio Postgres para nao dependerem do fuso do servidor.
const selecaoProcesso = `
  select p.id, p.numero_processo, p.objeto,
         to_char(p.prazo_limite, 'DD/MM/YYYY') as prazo_limite,
         p.status, sec.chave as secretaria_solicitante, p.responsavel, p.notas_processo,
         to_char(p.atualizado_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') as atualizado_em
  from processos_compra p
  left join secretarias sec on sec.id = p.secretaria_solicitante_id`;

const selecaoItens = `
  select i.processo_id, i.numero_item, i.especificacao, i.unidade,
         coalesce((select jsonb_object_agg(s.chave, q.quantidade)
                   from item_quantidades q join secretarias s on s.id = q.secretaria_id
                   where q.item_id = i.id), '{}'::jsonb) as quantidades,
         coalesce((select jsonb_object_agg(c.fonte, c.valor_unitario)
                   from cotacoes c where c.item_id = i.id), '{}'::jsonb) as cotacoes
  from itens_lote i
  where i.processo_id = any($1::int[])
  order by i.numero_item`;

function paraItem(linha: LinhaItem, chaves: string[]): LoteItem {
  const gravadas = Object.entries(linha.quantidades ?? {}).map(([chave, valor]) => [chave, Number(valor)]);
  const quantidades = {
    ...Object.fromEntries(chaves.map((chave) => [chave, 0])),
    ...Object.fromEntries(gravadas),
  } as Record<Secretaria, number>;
  const cotacoes = { bnc: 0, pncp: 0, mercado: 0 };
  for (const [fonte, valor] of Object.entries(linha.cotacoes ?? {})) {
    const chave = chavePorFonte[fonte];
    if (chave) cotacoes[chave] = Number(valor);
  }
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

      for (const [chave, fonte] of Object.entries(fontePorChave)) {
        await executar(
          `insert into cotacoes (item_id, fonte, valor_unitario) values ($1, $2, $3)
           on conflict (item_id, fonte) do update set valor_unitario = excluded.valor_unitario`,
          [linha.id, fonte, item.cotacoes[chave as keyof LoteItem["cotacoes"]] ?? 0],
        );
      }
    }
    return true;
  });
}
