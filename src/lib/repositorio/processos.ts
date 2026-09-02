import { dataBrParaIso, type AjusteQuantidade, type Cotacao, type LancamentoSecretaria, type LoteItem, type MetodoPreco, type Processo, type ProcessoStatus, type Secretaria } from "@/lib/compras";
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
  lancamentos: LancamentoSecretaria[] | null;
};

type LinhaItem = {
  processo_id: number;
  numero_item: number;
  especificacao: string;
  unidade: string;
  quantidades: Record<string, number>;
  cotacoes: Cotacao[];
  ajustes: AjusteQuantidade[];
  codigo_catalogo: number | null;
  catalogo_tipo: "material" | "servico" | null;
  catalogo_descricao: string | null;
};

// As datas sao formatadas no proprio Postgres para nao dependerem do fuso do servidor.
const selecaoProcesso = `
  select p.id, p.numero_processo, p.objeto,
         to_char(p.prazo_limite, 'DD/MM/YYYY') as prazo_limite,
         p.status, sec.chave as secretaria_solicitante, p.responsavel, p.notas_processo,
         p.metodo_preco, p.justificativa_metodo,
         to_char(p.atualizado_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') as atualizado_em,
         coalesce((select jsonb_agg(jsonb_build_object(
                     'secretaria', s.chave,
                     'concluidoPor', u.nome,
                     'concluidoEm', to_char(l.concluido_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'))
                     order by l.concluido_em)
                   from lancamentos_quantidade l
                   join secretarias s on s.id = l.secretaria_id
                   left join usuarios u on u.id = l.concluido_por_id
                   where l.processo_id = p.id), '[]'::jsonb) as lancamentos
  from processos_compra p
  left join secretarias sec on sec.id = p.secretaria_solicitante_id`;

const selecaoItens = `
  select i.processo_id, i.numero_item, i.especificacao, i.unidade,
         i.codigo_catalogo, i.catalogo_tipo, i.catalogo_descricao,
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
                   from cotacoes c where c.item_id = i.id), '[]'::jsonb) as cotacoes,
         coalesce((select jsonb_agg(jsonb_build_object(
                     'secretaria', s.nome,
                     'anterior', a.quantidade_anterior,
                     'nova', a.quantidade_nova,
                     'justificativa', a.justificativa,
                     'usuario', u.nome,
                     'quando', to_char(a.criado_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'))
                     order by a.criado_em desc)
                   from ajustes_quantidade a
                   join secretarias s on s.id = a.secretaria_id
                   left join usuarios u on u.id = a.usuario_id
                   where a.item_id = i.id), '[]'::jsonb) as ajustes
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
    ajustes: linha.ajustes ?? [],
    id: `${linha.processo_id}-${linha.numero_item}`,
    item: linha.numero_item,
    especificacao: linha.especificacao,
    unidade: linha.unidade,
    quantidades,
    cotacoes,
    catalogo: linha.codigo_catalogo && linha.catalogo_tipo
      ? {
          codigo: linha.codigo_catalogo,
          tipo: linha.catalogo_tipo,
          descricao: linha.catalogo_descricao ?? "",
        }
      : null,
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
    lancamentos: linha.lancamentos ?? [],
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
export type AjusteRegistrado = { item: number; secretaria: string; anterior: number; nova: number };

export async function salvarLote(
  prefeituraId: number,
  numero: string,
  dados: { notas: string; itens: LoteItem[] },
  autorId: number | null = null,
  ajustes: { justificativa: string; mudancas: AjusteRegistrado[] } | null = null,
  secretariaDoAutor: string | null = null,
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

    // Chaves cujo numero realmente mudou neste salvamento — usadas no fim para
    // reabrir o lancamento de quem mexeu na propria quantidade.
    const mexidas = new Set<string>();

    for (const item of dados.itens) {
      const [linha] = (await executar(
        `insert into itens_lote (processo_id, numero_item, especificacao, unidade, codigo_catalogo, catalogo_tipo, catalogo_descricao)
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (processo_id, numero_item)
         do update set especificacao = excluded.especificacao, unidade = excluded.unidade,
                       codigo_catalogo = excluded.codigo_catalogo,
                       catalogo_tipo = excluded.catalogo_tipo,
                       catalogo_descricao = excluded.catalogo_descricao
         returning id`,
        [
          processo.id, item.item, item.especificacao, item.unidade,
          item.catalogo?.codigo ?? null,
          item.catalogo?.tipo ?? null,
          item.catalogo?.descricao ?? null,
        ],
      )) as Array<{ id: number }>;

      for (const secretaria of secretarias) {
        // O `where` no final e o que preserva a autoria. Sem ele, salvar o lote
        // por qualquer motivo — corrigir uma especificacao, por exemplo —
        // recarimbava `atualizado_por_id` de TODAS as secretarias com quem
        // salvou, apagando justamente o que a migracao 001 diz que esta tabela
        // existe para guardar: "saber quem preencheu o que". A linha so muda de
        // dono quando o numero dela muda.
        const [alterada] = (await executar(
          `insert into item_quantidades (item_id, secretaria_id, quantidade, atualizado_por_id)
           values ($1, $2, $3, $4)
           on conflict (item_id, secretaria_id)
           do update set quantidade = excluded.quantidade, atualizado_por_id = excluded.atualizado_por_id, atualizado_em = now()
           where item_quantidades.quantidade is distinct from excluded.quantidade
           returning secretaria_id`,
          [linha.id, secretaria.id, Number(item.quantidades[secretaria.chave] ?? 0), autorId],
        )) as Array<{ secretaria_id: number }>;
        if (alterada) mexidas.add(secretaria.chave);
      }

    }
    // O ajuste e gravado depois das quantidades, ja com os ids definitivos.
    if (ajustes?.mudancas.length) {
      for (const mudanca of ajustes.mudancas) {
        await executar(
          `insert into ajustes_quantidade (item_id, secretaria_id, quantidade_anterior, quantidade_nova, justificativa, usuario_id)
           select i.id, s.id, $3, $4, $5, $6
           from itens_lote i, secretarias s
           where i.processo_id = $1 and i.numero_item = $2 and s.prefeitura_id = $7 and s.chave = $8`,
          [processo.id, mudanca.item, mudanca.anterior, mudanca.nova, ajustes.justificativa, autorId, prefeituraId, mudanca.secretaria],
        );
      }
    }

    /**
     * A secretaria que mexe no proprio numero depois de ter concluido volta a
     * constar como pendente: "concluido" quer dizer "este e o meu numero
     * final", e editar desfaz a afirmacao. Ela reconclui com um clique.
     *
     * So vale para a propria secretaria. Quando o Setor de Compras corrige o
     * numero de alguem, a correcao ja fica registrada em ajustes_quantidade,
     * com justificativa, e aparece no mapa — reabrir o lancamento ali so faria
     * o processo cobrar de novo uma secretaria que ja fez a parte dela.
     */
    if (secretariaDoAutor && mexidas.has(secretariaDoAutor)) {
      await executar(
        `delete from lancamentos_quantidade l
         using secretarias s
         where l.processo_id = $1 and l.secretaria_id = s.id
           and s.prefeitura_id = $2 and s.chave = $3`,
        [processo.id, prefeituraId, secretariaDoAutor],
      );
    }

    return true;
  });
}

/**
 * A secretaria declara que terminou de lancar as quantidades dela.
 *
 * O `on conflict do nothing` guarda a primeira conclusao: se duas pessoas da
 * mesma secretaria clicarem, quem assinou foi a primeira, e o registro nao
 * deveria trocar de dono por causa de um clique repetido.
 */
export async function concluirLancamento(
  prefeituraId: number,
  numero: string,
  secretariaChave: string,
  usuarioId: number | null,
) {
  const linha = await consultarUm<{ processo_id: number }>(
    `insert into lancamentos_quantidade (processo_id, secretaria_id, concluido_por_id)
     select p.id, s.id, $4
     from processos_compra p, secretarias s
     where p.prefeitura_id = $1 and p.numero_processo = $2
       and s.prefeitura_id = $1 and s.chave = $3
     on conflict (processo_id, secretaria_id) do nothing
     returning processo_id`,
    [prefeituraId, numero, secretariaChave, usuarioId],
  );
  // Sem linha: ou ja estava concluido (do nothing), ou processo/secretaria nao
  // existem nesta prefeitura. Quem separa os dois casos e a rota, que ja leu o
  // processo antes de chamar.
  return Boolean(linha);
}

/** Desfaz a conclusao, para a secretaria corrigir o que lancou. */
export async function reabrirLancamento(prefeituraId: number, numero: string, secretariaChave: string) {
  const linha = await consultarUm<{ processo_id: number }>(
    `delete from lancamentos_quantidade l
     using processos_compra p, secretarias s
     where l.processo_id = p.id and l.secretaria_id = s.id
       and p.prefeitura_id = $1 and p.numero_processo = $2
       and s.prefeitura_id = $1 and s.chave = $3
     returning l.processo_id`,
    [prefeituraId, numero, secretariaChave],
  );
  return Boolean(linha);
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
    [itemId, dados.fonte, dados.descricao, dados.documento, dados.valorUnitario, dataBrParaIso(dados.dataCotacao), dados.desconsiderada, dados.justificativa],
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
      dados.valorUnitario ?? null, dados.dataCotacao ? dataBrParaIso(dados.dataCotacao) : null,
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

    // "Encerrado" quer dizer que nao ha mais saldo a consumir, e "cancelado",
    // que nao houve contratacao. Nenhum dos dois combina com um contrato ainda
    // ativo aceitando pedido: seriam duas verdades sobre o mesmo fato. Quem
    // decide o destino do saldo e o comprador, encerrando o contrato antes.
    if (novo === "encerrado" || novo === "cancelado") {
      const [contrato] = (await executar(
        `select c.numero,
                coalesce(sum((ic.quantidade_contratada - coalesce(e.autorizada, 0)) * ic.valor_unitario), 0) as saldo
         from contratos c
         left join itens_contrato ic on ic.contrato_id = c.id
         left join lateral (
           select sum(ip.quantidade) as autorizada
           from itens_pedido ip
           join pedidos_fornecimento p on p.id = ip.pedido_id
           where ip.item_contrato_id = ic.id and p.status = 'autorizado'
         ) e on true
         where c.processo_id = $1 and c.status = 'ativo'
         group by c.id
         order by c.numero
         limit 1`,
        [atual.id],
      )) as Array<{ numero: string; saldo: string }>;
      if (contrato) return { erro: "contrato-ativo" as const, contrato: contrato.numero, saldo: Number(contrato.saldo) };
    }

    await executar("update processos_compra set status = $2::processo_status, atualizado_em = now() where id = $1", [atual.id, novo]);

    // A demanda acompanha o destino do processo que ela originou. Cancelado o
    // processo — licitacao fracassada, por exemplo —, a necessidade continua
    // existindo: ela volta para a fila e solta o vinculo, senao a secretaria
    // fica com um DFD congelado que ninguem consegue reaproveitar.
    if (novo === "cancelado") {
      await executar(
        "update solicitacoes set status = 'pendente'::solicitacao_status, processo_id = null where processo_id = $1",
        [atual.id],
      );
    }
    // Encerrado o processo, a demanda foi atendida: e o fim natural dela.
    if (novo === "encerrado") {
      await executar(
        "update solicitacoes set status = 'concluido'::solicitacao_status where processo_id = $1",
        [atual.id],
      );
    }
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

/**
 * Sugere o proximo numero no padrao "AAAA-NNNN", continuando a sequencia do ano
 * corrente daquela prefeitura. E so uma sugestao: quem monta o processo pode
 * digitar o numero que o municipio usa.
 */
export async function proximoNumeroProcesso(prefeituraId: number, ano: number) {
  const linha = await consultarUm<{ maior: number | null }>(
    `select max(substring(numero_processo from '\\d+$')::int) as maior
     from processos_compra
     where prefeitura_id = $1 and numero_processo like $2`,
    [prefeituraId, `${ano}-%`],
  );
  return `${ano}-${String((linha?.maior ?? 0) + 1).padStart(4, "0")}`;
}

export type DadosNovoProcesso = {
  numero: string;
  objeto: string;
  prazoLimite: string | null;
  secretaria: Secretaria | null;
  responsavel: string;
  /** Solicitacao que originou o processo, marcada como atendida na mesma transacao. */
  solicitacaoId: number | null;
};

/**
 * Cria o processo ja em "Em elaboracao" e registra a abertura no historico. O
 * lote nasce vazio: os itens entram na propria tela do processo.
 */
export async function criarProcesso(prefeituraId: number, usuarioId: number | null, dados: DadosNovoProcesso) {
  return emTransacao(async (executar) => {
    // A unicidade e decidida pelo proprio indice, e nao por um select antes do
    // insert: entre os dois cabia outra requisicao com o mesmo numero, e quem
    // perdesse a corrida recebia o erro cru do Postgres em vez de 409.
    const [criado] = (await executar(
      `insert into processos_compra (prefeitura_id, numero_processo, objeto, prazo_limite, secretaria_solicitante_id, responsavel)
       values ($1, $2, $3, $4, (select id from secretarias where prefeitura_id = $1 and chave = $5), $6)
       on conflict (prefeitura_id, numero_processo) do nothing
       returning id`,
      [prefeituraId, dados.numero, dados.objeto, dataBrParaIso(dados.prazoLimite), dados.secretaria, dados.responsavel],
    )) as Array<{ id: number }>;
    if (!criado) return { erro: "numero-duplicado" as const };

    await executar(
      "insert into historico_status (processo_id, de, para, usuario_id, observacao) values ($1, null, 'em_montagem'::processo_status, $2, $3)",
      [criado.id, usuarioId, "Processo aberto."],
    );

    // A solicitacao que virou processo deixa de ficar pendente na fila e passa a
    // apontar para o processo: e o primeiro elo da cadeia necessidade -> compra,
    // e sem ele ninguem consegue dizer depois em que processo o pedido virou.
    if (dados.solicitacaoId) {
      const vinculada = (await executar(
        `update solicitacoes set status = 'em_cotacao'::solicitacao_status, processo_id = $3
         where id = $1 and prefeitura_id = $2 and status = 'pendente'
         returning id, secretaria_id`,
        [dados.solicitacaoId, prefeituraId, criado.id],
      )) as Array<{ id: number; secretaria_id: number | null }>;

      // O lote comeca com os itens que a secretaria ja quantificou no DFD: o
      // comprador corrige a especificacao, mas nao redigita a demanda inteira.
      if (vinculada.length) {
        const itens = (await executar(
          `insert into itens_lote (processo_id, numero_item, especificacao, unidade)
           select $1, i.numero_item, i.descricao, i.unidade
           from itens_solicitacao i where i.solicitacao_id = $2
           order by i.numero_item
           returning id, numero_item`,
          [criado.id, dados.solicitacaoId],
        )) as Array<{ id: number; numero_item: number }>;

        // A coluna do lote e inteira desde a primeira migracao; a quantidade do
        // DFD, fracionaria. O arredondamento e explicito para nao virar surpresa.
        if (itens.length && vinculada[0].secretaria_id) {
          await executar(
            `insert into item_quantidades (item_id, secretaria_id, quantidade, atualizado_por_id)
             select il.id, $3, round(i.quantidade)::int, $4
             from itens_solicitacao i
             join itens_lote il on il.processo_id = $1 and il.numero_item = i.numero_item
             where i.solicitacao_id = $2 and round(i.quantidade)::int > 0
             on conflict (item_id, secretaria_id) do nothing`,
            [criado.id, dados.solicitacaoId, vinculada[0].secretaria_id, usuarioId],
          );
        }
      }
    }

    return { numero: dados.numero };
  });
}
