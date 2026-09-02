import { consultar, consultarUm, emTransacao } from "@/lib/db";
import type { ContratoStatus } from "@/lib/contratos";
import { acoesDoPedido, mexeNoEmpenho, type AcaoPedido, type Pedido, type PedidoStatus, type SaldoItem } from "@/lib/pedidos";
import { dataBrParaIso } from "@/lib/compras";

type LinhaPedido = Omit<Pedido, "itens"> & { itens: Pedido["itens"] };

// As datas saem formatadas do proprio Postgres, como no resto do portal, para
// nao dependerem do fuso do servidor.
const selecao = `
  select p.id, p.numero, c.numero as contrato, c.fornecedor,
         sec.chave as secretaria, sec.nome as "secretariaNome",
         p.justificativa, p.status,
         coalesce(emp.numero, '') as empenho, p.empenho_id as "empenhoId",
         to_char(p.entrega_prevista, 'DD/MM/YYYY') as "entregaPrevista",
         p.motivo_decisao as "motivoDecisao",
         autor.nome as solicitante,
         p.criado_por_id as "criadoPorId",
         to_char(p.criado_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') as "criadoEm",
         conferente.nome as conferente,
         to_char(p.conferido_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') as "conferidoEm",
         decisor.nome as decisor,
         to_char(p.decidido_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') as "decididoEm",
         coalesce((select jsonb_agg(jsonb_build_object(
                     'id', ip.id,
                     'itemContratoId', ip.item_contrato_id,
                     'item', ic.numero_item,
                     'descricao', ic.descricao,
                     'unidade', ic.unidade,
                     'quantidade', ip.quantidade,
                     'valorUnitario', ic.valor_unitario)
                     order by ic.numero_item)
                   from itens_pedido ip
                   join itens_contrato ic on ic.id = ip.item_contrato_id
                   where ip.pedido_id = p.id), '[]'::jsonb) as itens
  from pedidos_fornecimento p
  join contratos c on c.id = p.contrato_id
  join secretarias sec on sec.id = p.secretaria_id
  left join empenhos emp on emp.id = p.empenho_id
  left join usuarios autor on autor.id = p.criado_por_id
  left join usuarios conferente on conferente.id = p.conferido_por_id
  left join usuarios decisor on decisor.id = p.decidido_por_id`;

function paraPedido(linha: LinhaPedido): Pedido {
  return {
    ...linha,
    itens: (linha.itens ?? []).map((item) => ({
      ...item,
      quantidade: Number(item.quantidade),
      valorUnitario: Number(item.valorUnitario),
    })),
  };
}

export type FiltrosPedido = {
  /** Preenchido para o secretario: ele so enxerga o que a propria secretaria pediu. */
  secretariaId?: number | null;
  contrato?: string | null;
  status?: PedidoStatus | null;
};

export async function listarPedidos(prefeituraId: number, filtros: FiltrosPedido = {}) {
  const condicoes = ["p.prefeitura_id = $1"];
  const valores: unknown[] = [prefeituraId];
  if (filtros.secretariaId != null) {
    valores.push(filtros.secretariaId);
    condicoes.push(`p.secretaria_id = $${valores.length}`);
  }
  if (filtros.contrato) {
    valores.push(filtros.contrato);
    condicoes.push(`c.numero = $${valores.length}`);
  }
  if (filtros.status) {
    valores.push(filtros.status);
    condicoes.push(`p.status = $${valores.length}::pedido_status`);
  }
  const linhas = await consultar<LinhaPedido>(
    `${selecao} where ${condicoes.join(" and ")} order by p.criado_em desc`,
    valores,
  );
  return linhas.map(paraPedido);
}

export async function lerPedido(prefeituraId: number, id: number) {
  const linha = await consultarUm<LinhaPedido>(`${selecao} where p.prefeitura_id = $1 and p.id = $2`, [prefeituraId, id]);
  return linha ? paraPedido(linha) : null;
}

type LinhaSaldo = {
  item_contrato_id: number;
  numero_item: number;
  descricao: string;
  unidade: string;
  valor_unitario: string;
  quantidade_contratada: string;
  autorizada: string;
  em_analise: string;
};

// O saldo nasce aqui, na leitura: contratado menos autorizado. Pedido ainda
// nao autorizado entra numa coluna a parte porque nao consumiu nada — mas
// tambem nao esta livre para outra secretaria tomar. Conferido conta junto com
// pendente: a conferencia nao devolve a quantidade para a praca.
const selecaoSaldo = `
  select ic.id as item_contrato_id, ic.numero_item, ic.descricao, ic.unidade,
         ic.valor_unitario, ic.quantidade_contratada,
         coalesce(sum(ip.quantidade) filter (where p.status = 'autorizado'), 0) as autorizada,
         coalesce(sum(ip.quantidade) filter (where p.status in ('pendente', 'conferido')), 0) as em_analise
  from itens_contrato ic
  join contratos c on c.id = ic.contrato_id
  left join itens_pedido ip on ip.item_contrato_id = ic.id
  left join pedidos_fornecimento p on p.id = ip.pedido_id
  where c.prefeitura_id = $1 and c.numero = $2
  group by ic.id
  order by ic.numero_item`;

function paraSaldo(linha: LinhaSaldo): SaldoItem {
  const contratada = Number(linha.quantidade_contratada);
  const autorizada = Number(linha.autorizada);
  const emAnalise = Number(linha.em_analise);
  return {
    itemContratoId: linha.item_contrato_id,
    item: linha.numero_item,
    descricao: linha.descricao,
    unidade: linha.unidade,
    valorUnitario: Number(linha.valor_unitario),
    contratada,
    autorizada,
    emAnalise,
    saldo: contratada - autorizada,
    disponivel: contratada - autorizada - emAnalise,
  };
}

export async function saldoDoContrato(prefeituraId: number, numero: string) {
  const linhas = await consultar<LinhaSaldo>(selecaoSaldo, [prefeituraId, numero]);
  return linhas.map(paraSaldo);
}

export type ResumoSaldo = { contrato: string; contratado: number; executado: number; saldo: number };

/**
 * Um resumo por contrato, em dinheiro, para a lista de contratos e as metricas.
 * O `lateral` evita contar o mesmo item duas vezes quando ele tem varios pedidos.
 */
export async function resumoDeSaldos(prefeituraId: number) {
  const linhas = await consultar<{ contrato: string; contratado: string; executado: string }>(
    `select c.numero as contrato,
            coalesce(sum(ic.quantidade_contratada * ic.valor_unitario), 0) as contratado,
            coalesce(sum(coalesce(e.autorizada, 0) * ic.valor_unitario), 0) as executado
     from contratos c
     join itens_contrato ic on ic.contrato_id = c.id
     left join lateral (
       select sum(ip.quantidade) as autorizada
       from itens_pedido ip
       join pedidos_fornecimento p on p.id = ip.pedido_id
       where ip.item_contrato_id = ic.id and p.status = 'autorizado'
     ) e on true
     where c.prefeitura_id = $1
     group by c.numero`,
    [prefeituraId],
  );
  return linhas.map((linha): ResumoSaldo => {
    const contratado = Number(linha.contratado);
    const executado = Number(linha.executado);
    return { contrato: linha.contrato, contratado, executado, saldo: contratado - executado };
  });
}

export type ItemDoPedido = { itemContratoId: number; quantidade: number };

export type DadosNovoPedido = {
  contrato: string;
  /** Chave da secretaria que vai consumir; o secretario so pode a propria. */
  secretaria: string;
  justificativa: string;
  entregaPrevista: string | null;
  itens: ItemDoPedido[];
};

/** O que faltou de saldo, item a item, para a mensagem dizer exatamente onde parou. */
export type FaltaDeSaldo = { item: number; descricao: string; unidade: string; pedida: number; disponivel: number };

type Executar = (sql: string, valores?: unknown[]) => Promise<Record<string, unknown>[]>;

/**
 * Trava a linha do contrato antes de olhar o saldo. Duas autorizacoes do mesmo
 * contrato passam a esperar uma pela outra, entao nao ha janela entre conferir
 * o saldo e consumi-lo.
 */
async function contratoTravado(executar: Executar, prefeituraId: number, numero: string) {
  const [contrato] = (await executar(
    "select id, numero, status from contratos where prefeitura_id = $1 and numero = $2 for update",
    [prefeituraId, numero],
  )) as Array<{ id: number; numero: string; status: ContratoStatus }>;
  return contrato ?? null;
}

async function saldoTravado(executar: Executar, prefeituraId: number, numero: string) {
  const linhas = (await executar(selecaoSaldo, [prefeituraId, numero])) as unknown as LinhaSaldo[];
  return linhas.map(paraSaldo);
}

function faltas(saldo: SaldoItem[], itens: ItemDoPedido[], disponivel: (item: SaldoItem) => number) {
  const porId = new Map(saldo.map((item) => [item.itemContratoId, item]));
  const encontradas: FaltaDeSaldo[] = [];
  for (const pedido of itens) {
    const item = porId.get(pedido.itemContratoId);
    if (!item) continue;
    const livre = disponivel(item);
    if (pedido.quantidade > livre + 1e-9) {
      encontradas.push({ item: item.item, descricao: item.descricao, unidade: item.unidade, pedida: pedido.quantidade, disponivel: Math.max(0, livre) });
    }
  }
  return encontradas;
}

/**
 * Abre o pedido de fornecimento. Ele nasce pendente e nao baixa saldo — mas ja
 * respeita o que outros pedidos reservaram, senao duas secretarias poderiam
 * pedir o mesmo saldo e uma descobriria isso so na recusa.
 */
export async function criarPedido(prefeituraId: number, usuarioId: number | null, dados: DadosNovoPedido) {
  const ano = new Date().getFullYear();
  // O numero e sequencial por prefeitura e ano; quem decide a unicidade e o
  // indice. Duas aberturas simultaneas em contratos diferentes podem escolher o
  // mesmo numero, e a segunda simplesmente tenta de novo.
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    try {
      return await emTransacao(async (executar) => {
        const contrato = await contratoTravado(executar, prefeituraId, dados.contrato);
        if (!contrato) return { erro: "contrato-nao-encontrado" as const };
        if (contrato.status !== "ativo") return { erro: "contrato-inativo" as const, status: contrato.status };

        const [secretaria] = (await executar(
          "select id, ativa from secretarias where prefeitura_id = $1 and chave = $2",
          [prefeituraId, dados.secretaria],
        )) as Array<{ id: number; ativa: boolean }>;
        if (!secretaria) return { erro: "secretaria-nao-encontrada" as const };
        if (!secretaria.ativa) return { erro: "secretaria-inativa" as const };

        const saldo = await saldoTravado(executar, prefeituraId, dados.contrato);
        const conhecidos = new Set(saldo.map((item) => item.itemContratoId));
        const estranhos = dados.itens.filter((item) => !conhecidos.has(item.itemContratoId));
        if (estranhos.length) return { erro: "item-de-outro-contrato" as const };

        const semSaldo = faltas(saldo, dados.itens, (item) => item.disponivel);
        if (semSaldo.length) return { erro: "sem-saldo" as const, faltas: semSaldo };

        const [{ proximo }] = (await executar(
          `select coalesce(max(substring(numero from '^\\d+')::int), 0) + 1 as proximo
           from pedidos_fornecimento where prefeitura_id = $1 and numero like $2`,
          [prefeituraId, `%/${ano}`],
        )) as Array<{ proximo: number }>;
        const numero = `${String(proximo).padStart(4, "0")}/${ano}`;

        const [criado] = (await executar(
          `insert into pedidos_fornecimento
             (prefeitura_id, contrato_id, secretaria_id, numero, justificativa, entrega_prevista, criado_por_id)
           values ($1, $2, $3, $4, $5, $6::date, $7)
           returning id`,
          [prefeituraId, contrato.id, secretaria.id, numero, dados.justificativa, dataBrParaIso(dados.entregaPrevista), usuarioId],
        )) as Array<{ id: number }>;

        for (const item of dados.itens) {
          await executar(
            "insert into itens_pedido (pedido_id, item_contrato_id, quantidade) values ($1, $2, $3)",
            [criado.id, item.itemContratoId, item.quantidade],
          );
        }

        return { id: criado.id, numero };
      });
    } catch (erro) {
      const codigo = (erro as { code?: string }).code;
      if (codigo === "23505" && tentativa < 2) continue;
      throw erro;
    }
  }
  return { erro: "numero-em-disputa" as const };
}

export type DadosDecisao = {
  acao: AcaoPedido;
  motivo: string;
  /** Nota de empenho a vincular; usado por `empenhar` e `corrigir-empenho`. */
  empenhoId: number | null;
  entregaPrevista: string | null;
};

/**
 * Confere, devolve, autoriza, recusa, cancela ou estorna. A autorizacao e o
 * unico ponto em que o saldo cai, entao e aqui que ele e conferido de novo,
 * com o contrato travado: entre a abertura do pedido e a decisao o contrato
 * pode ter mudado de itens.
 *
 * Quem pode fazer cada uma dessas coisas nao se decide aqui — a rota resolve
 * isso antes, porque depende do valor do pedido e das regras da prefeitura.
 */
export async function decidirPedido(prefeituraId: number, id: number, usuarioId: number | null, dados: DadosDecisao) {
  const regra = acoesDoPedido[dados.acao];
  return emTransacao(async (executar) => {
    const [pedido] = (await executar(
      `select p.id, p.status, p.secretaria_id, p.empenho_id, c.numero as contrato, c.status as contrato_status
       from pedidos_fornecimento p join contratos c on c.id = p.contrato_id
       where p.prefeitura_id = $1 and p.id = $2 for update of p`,
      [prefeituraId, id],
    )) as Array<{ id: number; status: PedidoStatus; secretaria_id: number; empenho_id: number | null; contrato: string; contrato_status: ContratoStatus }>;
    if (!pedido) return { erro: "pedido-nao-encontrado" as const };
    if (!regra.origens.includes(pedido.status)) return { erro: "acao-incompativel" as const, status: pedido.status };

    const destino = regra.destino ?? pedido.status;

    if (dados.acao === "autorizar") {
      const contrato = await contratoTravado(executar, prefeituraId, pedido.contrato);
      if (!contrato) return { erro: "contrato-nao-encontrado" as const };
      if (contrato.status !== "ativo") return { erro: "contrato-inativo" as const, status: contrato.status };

      const saldo = await saldoTravado(executar, prefeituraId, pedido.contrato);
      const itens = (await executar(
        "select item_contrato_id, quantidade from itens_pedido where pedido_id = $1",
        [pedido.id],
      )) as Array<{ item_contrato_id: number; quantidade: string }>;
      const pedidos = itens.map((item) => ({ itemContratoId: item.item_contrato_id, quantidade: Number(item.quantidade) }));
      // Aqui o corte e o saldo, e nao o disponivel: o proprio pedido ja esta
      // contado em "em analise", e ele nao pode disputar consigo mesmo.
      const semSaldo = faltas(saldo, pedidos, (item) => item.saldo);
      if (semSaldo.length) return { erro: "sem-saldo" as const, faltas: semSaldo };
    }

    // Conferir nao e decidir: carimba a conferencia e deixa `decidido_em` nulo,
    // que e o que a constraint do banco exige e o que o historico deve contar.
    if (dados.acao === "conferir") {
      await executar(
        `update pedidos_fornecimento
         set status = 'conferido', conferido_por_id = $2, conferido_em = now()
         where id = $1`,
        [pedido.id, usuarioId],
      );
      return { status: "conferido" as PedidoStatus, secretariaId: pedido.secretaria_id };
    }

    if (mexeNoEmpenho(dados.acao)) {
      if (!dados.empenhoId) return { erro: "empenho-nao-informado" as const };
      // A nota e travada antes de olhar o saldo dela, pelo mesmo motivo do
      // contrato: dois pedidos empenhados ao mesmo tempo esperam um pelo outro.
      const [nota] = (await executar(
        `select e.id, e.numero, e.valor, c.numero as contrato
         from empenhos e join contratos c on c.id = e.contrato_id
         where e.prefeitura_id = $1 and e.id = $2 for update of e`,
        [prefeituraId, dados.empenhoId],
      )) as Array<{ id: number; numero: string; valor: string; contrato: string }>;
      if (!nota) return { erro: "empenho-nao-encontrado" as const };
      // Nota de empenho se emite contra uma despesa: a de um contrato nao paga
      // o fornecimento de outro.
      if (nota.contrato !== pedido.contrato) return { erro: "empenho-de-outro-contrato" as const };

      const [valores] = (await executar(
        `select coalesce(sum(ip.quantidade * ic.valor_unitario), 0) as total
         from itens_pedido ip join itens_contrato ic on ic.id = ip.item_contrato_id
         where ip.pedido_id = $1`,
        [pedido.id],
      )) as Array<{ total: string }>;
      const valorDoPedido = Number(valores.total);

      // O proprio pedido sai da conta: numa troca de nota ele ja pode estar
      // contado na de origem, e nao pode disputar saldo consigo mesmo.
      const [consumo] = (await executar(
        `select coalesce(sum(v.total), 0) as comprometido
         from pedidos_fornecimento p
         left join lateral (
           select coalesce(sum(ip.quantidade * ic.valor_unitario), 0) as total
           from itens_pedido ip join itens_contrato ic on ic.id = ip.item_contrato_id
           where ip.pedido_id = p.id
         ) v on true
         where p.empenho_id = $1 and p.id <> $2 and p.status in ('empenhado', 'autorizado')`,
        [nota.id, pedido.id],
      )) as Array<{ comprometido: string }>;
      const disponivel = Number(nota.valor) - Number(consumo.comprometido);
      if (valorDoPedido > disponivel + 1e-9) {
        return { erro: "empenho-sem-saldo" as const, numero: nota.numero, pedido: valorDoPedido, disponivel: Math.max(0, disponivel) };
      }

      if (dados.acao === "empenhar") {
        await executar(
          "update pedidos_fornecimento set status = 'empenhado', empenho_id = $2 where id = $1",
          [pedido.id, nota.id],
        );
        return { status: "empenhado" as PedidoStatus, secretariaId: pedido.secretaria_id };
      }

      const [anterior] = (await executar("select numero from empenhos where id = $1", [pedido.empenho_id])) as Array<{ numero: string }>;
      await executar("update pedidos_fornecimento set empenho_id = $2 where id = $1", [pedido.id, nota.id]);
      await executar(
        `insert into empenho_alteracoes (empenho_id, pedido_id, descricao, motivo, alterado_por_id)
         values ($1, $2, $3, $4, $5)`,
        [
          nota.id,
          pedido.id,
          `Pedido passou da nota ${anterior?.numero ?? "sem numero"} para ${nota.numero}.`,
          dados.motivo,
          usuarioId,
        ],
      );
      return { status: pedido.status, secretariaId: pedido.secretaria_id };
    }

    await executar(
      `update pedidos_fornecimento
       set status = $2::pedido_status,
           motivo_decisao = $3,
           entrega_prevista = coalesce($4::date, entrega_prevista),
           decidido_por_id = $5,
           decidido_em = now()
       where id = $1`,
      [pedido.id, destino, dados.motivo, dataBrParaIso(dados.entregaPrevista), usuarioId],
    );

    return { status: destino, secretariaId: pedido.secretaria_id };
  });
}

/** Quantos pedidos vivos um contrato tem: usado antes de excluir o contrato. */
export async function pedidosDoContrato(prefeituraId: number, numero: string) {
  const linha = await consultarUm<{ total: string }>(
    `select count(*) as total from pedidos_fornecimento p join contratos c on c.id = p.contrato_id
     where c.prefeitura_id = $1 and c.numero = $2`,
    [prefeituraId, numero],
  );
  return Number(linha?.total ?? 0);
}
