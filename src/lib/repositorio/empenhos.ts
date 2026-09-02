import { consultar, consultarUm, emTransacao } from "@/lib/db";
import type { ContratoStatus } from "@/lib/contratos";
import type { DadosEmpenho, Empenho } from "@/lib/empenhos";
import { dataBrParaIso } from "@/lib/compras";

type LinhaEmpenho = {
  id: number;
  numero: string;
  contrato: string;
  dataEmissao: string | null;
  valor: string;
  observacao: string;
  registradoPor: string | null;
  registradoEm: string;
  comprometido: string;
  pedidos: string;
};

/**
 * O comprometido nasce na leitura, como o saldo do contrato: a soma dos pedidos
 * vivos que apontam para a nota. `empenhado` reserva e `autorizado` consome; os
 * demais estados devolvem, e a nota fica sem consumo ate a Financa anular.
 */
const selecao = `
  select e.id, e.numero, c.numero as contrato,
         to_char(e.data_emissao, 'DD/MM/YYYY') as "dataEmissao",
         e.valor, e.observacao,
         autor.nome as "registradoPor",
         to_char(e.registrado_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') as "registradoEm",
         coalesce(consumo.comprometido, 0) as comprometido,
         coalesce(consumo.pedidos, 0) as pedidos
  from empenhos e
  join contratos c on c.id = e.contrato_id
  left join usuarios autor on autor.id = e.registrado_por_id
  left join lateral (
    select coalesce(sum(case when p.status in ('empenhado', 'autorizado') then valores.total else 0 end), 0) as comprometido,
           count(*) as pedidos
    from pedidos_fornecimento p
    left join lateral (
      select coalesce(sum(ip.quantidade * ic.valor_unitario), 0) as total
      from itens_pedido ip
      join itens_contrato ic on ic.id = ip.item_contrato_id
      where ip.pedido_id = p.id
    ) valores on true
    where p.empenho_id = e.id
  ) consumo on true`;

function paraEmpenho(linha: LinhaEmpenho): Empenho {
  const valor = Number(linha.valor);
  const comprometido = Number(linha.comprometido);
  return {
    id: linha.id,
    numero: linha.numero,
    contrato: linha.contrato,
    dataEmissao: linha.dataEmissao,
    valor,
    observacao: linha.observacao,
    registradoPor: linha.registradoPor,
    registradoEm: linha.registradoEm,
    comprometido,
    saldo: valor - comprometido,
    pedidos: Number(linha.pedidos),
  };
}

export async function listarEmpenhos(prefeituraId: number, filtros: { contrato?: string | null } = {}) {
  const condicoes = ["e.prefeitura_id = $1"];
  const valores: unknown[] = [prefeituraId];
  if (filtros.contrato) {
    valores.push(filtros.contrato);
    condicoes.push(`c.numero = $${valores.length}`);
  }
  const linhas = await consultar<LinhaEmpenho>(
    `${selecao} where ${condicoes.join(" and ")} order by e.registrado_em desc`,
    valores,
  );
  return linhas.map(paraEmpenho);
}

export async function lerEmpenho(prefeituraId: number, id: number) {
  const linha = await consultarUm<LinhaEmpenho>(`${selecao} where e.prefeitura_id = $1 and e.id = $2`, [prefeituraId, id]);
  return linha ? paraEmpenho(linha) : null;
}

/**
 * Registra a nota emitida pela Financa. O numero e unico no municipio: o
 * indice e que decide, e o 23505 vira uma mensagem em vez de um erro 500.
 */
export async function criarEmpenho(prefeituraId: number, usuarioId: number | null, dados: DadosEmpenho) {
  try {
    return await emTransacao(async (executar) => {
      const [contrato] = (await executar(
        "select id, status from contratos where prefeitura_id = $1 and numero = $2",
        [prefeituraId, dados.contrato],
      )) as Array<{ id: number; status: ContratoStatus }>;
      if (!contrato) return { erro: "contrato-nao-encontrado" as const };
      if (contrato.status !== "ativo") return { erro: "contrato-inativo" as const, status: contrato.status };

      const [criado] = (await executar(
        `insert into empenhos (prefeitura_id, contrato_id, numero, valor, data_emissao, observacao, registrado_por_id)
         values ($1, $2, $3, $4, $5::date, $6, $7) returning id`,
        [prefeituraId, contrato.id, dados.numero, dados.valor, dataBrParaIso(dados.dataEmissao), dados.observacao, usuarioId],
      )) as Array<{ id: number }>;
      return { id: criado.id };
    });
  } catch (erro) {
    if ((erro as { code?: string }).code === "23505") return { erro: "numero-em-uso" as const };
    throw erro;
  }
}

/**
 * Corrige o cadastro da nota. Exige motivo escrito e o grava: numero de
 * empenho corrigido sem justificativa e indistinguivel de numero trocado.
 *
 * O valor nao pode cair abaixo do que os pedidos ja tomaram — seria uma nota
 * comprometida acima do proprio valor.
 */
export async function atualizarEmpenho(
  prefeituraId: number,
  id: number,
  usuarioId: number | null,
  dados: { numero: string; valor: number; dataEmissao: string | null; observacao: string },
  motivo: string,
) {
  try {
    return await emTransacao(async (executar) => {
      const [atual] = (await executar(
        "select id, numero, valor from empenhos where prefeitura_id = $1 and id = $2 for update",
        [prefeituraId, id],
      )) as Array<{ id: number; numero: string; valor: string }>;
      if (!atual) return { erro: "empenho-nao-encontrado" as const };

      const [consumo] = (await executar(
        `select coalesce(sum(valores.total), 0) as comprometido
         from pedidos_fornecimento p
         left join lateral (
           select coalesce(sum(ip.quantidade * ic.valor_unitario), 0) as total
           from itens_pedido ip
           join itens_contrato ic on ic.id = ip.item_contrato_id
           where ip.pedido_id = p.id
         ) valores on true
         where p.empenho_id = $1 and p.status in ('empenhado', 'autorizado')`,
        [id],
      )) as Array<{ comprometido: string }>;
      const comprometido = Number(consumo.comprometido);
      if (dados.valor + 1e-9 < comprometido) {
        return { erro: "valor-abaixo-do-comprometido" as const, comprometido };
      }

      const mudancas: string[] = [];
      if (dados.numero !== atual.numero) mudancas.push(`numero ${atual.numero} para ${dados.numero}`);
      if (Math.abs(dados.valor - Number(atual.valor)) > 1e-9) mudancas.push(`valor ${atual.valor} para ${dados.valor}`);

      await executar(
        `update empenhos set numero = $2, valor = $3, data_emissao = $4::date, observacao = $5 where id = $1`,
        [id, dados.numero, dados.valor, dataBrParaIso(dados.dataEmissao), dados.observacao],
      );
      if (mudancas.length) {
        await executar(
          "insert into empenho_alteracoes (empenho_id, descricao, motivo, alterado_por_id) values ($1, $2, $3, $4)",
          [id, `Cadastro alterado: ${mudancas.join("; ")}.`, motivo, usuarioId],
        );
      }
      return { id };
    });
  } catch (erro) {
    if ((erro as { code?: string }).code === "23505") return { erro: "numero-em-uso" as const };
    throw erro;
  }
}

export type AlteracaoEmpenho = {
  id: number;
  descricao: string;
  motivo: string;
  autor: string | null;
  quando: string;
};

export async function alteracoesDoEmpenho(prefeituraId: number, id: number) {
  return consultar<AlteracaoEmpenho>(
    `select a.id, a.descricao, a.motivo, u.nome as autor,
            to_char(a.alterado_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') as quando
     from empenho_alteracoes a
     join empenhos e on e.id = a.empenho_id
     left join usuarios u on u.id = a.alterado_por_id
     where e.prefeitura_id = $1 and a.empenho_id = $2
     order by a.alterado_em desc`,
    [prefeituraId, id],
  );
}

/** Notas com pedido vivo: usado antes de excluir o contrato. */
export async function empenhosDoContrato(prefeituraId: number, numero: string) {
  const linha = await consultarUm<{ total: string }>(
    `select count(*) as total from empenhos e join contratos c on c.id = e.contrato_id
     where c.prefeitura_id = $1 and c.numero = $2`,
    [prefeituraId, numero],
  );
  return Number(linha?.total ?? 0);
}
