import { podeEditarTodasAsColunas } from "@/lib/auth/papeis";
import { modoDemonstracao, obterSessao } from "@/lib/auth/sessao";
import { cotacoesEditaveis, statusDescricoes } from "@/lib/compras";
import { consultarPrecosPublicos, origemDoPreco } from "@/lib/precos/painel";
import { lerProcesso } from "@/lib/repositorio/processos";
import { NextResponse } from "next/server";

/**
 * Precos publicados para um item do lote, lidos no Painel de Precos.
 *
 * Nao grava nada: devolve a lista para a tela mostrar, e quem decide o que
 * vira cotacao e a pessoa, item a item. A insercao passa pela rota de cotacoes
 * de sempre — o caminho de gravacao continua sendo um so.
 */
export async function GET(request: Request, { params }: { params: Promise<{ numero: string }> }) {
  const { numero } = await params;
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ error: "Sessao nao encontrada." }, { status: 401 });
  if (modoDemonstracao() || sessao.prefeituraId === null) {
    return NextResponse.json({ error: "Banco de dados nao configurado." }, { status: 503 });
  }
  // Cotacao e do Setor de Compras; consultar preco para cotar segue a mesma regra.
  if (!podeEditarTodasAsColunas(sessao.papel)) {
    return NextResponse.json({ error: "Somente o Setor de Compras pesquisa precos neste processo." }, { status: 403 });
  }

  const parametros = new URL(request.url).searchParams;
  const numeroItem = Number(parametros.get("item"));
  if (!Number.isInteger(numeroItem)) {
    return NextResponse.json({ error: "Informe o numero do item." }, { status: 400 });
  }

  const processo = await lerProcesso(sessao.prefeituraId, numero);
  if (!processo) return NextResponse.json({ error: `Processo ${numero} nao encontrado.` }, { status: 404 });

  if (!cotacoesEditaveis(processo.status)) {
    return NextResponse.json(
      { error: `O processo esta em "${statusDescricoes[processo.status]}" e nao aceita novas cotacoes.` },
      { status: 409 },
    );
  }

  const item = processo.itens.find((linha) => linha.item === numeroItem);
  if (!item) return NextResponse.json({ error: `Item ${numeroItem} nao existe neste lote.` }, { status: 404 });

  if (!item.catalogo) {
    return NextResponse.json(
      { error: "Este item ainda nao esta amarrado a um codigo do catalogo. O Painel de Precos consulta por CATMAT/CATSER, nunca por descricao." },
      { status: 409 },
    );
  }

  try {
    const precos = await consultarPrecosPublicos({
      codigo: item.catalogo.codigo,
      tipo: item.catalogo.tipo,
      estado: parametros.get("estado"),
      desde: parametros.get("desde"),
      ate: parametros.get("ate"),
    });

    // Preco que ja esta no lote nao volta na lista: reimportar criaria a mesma
    // compra duas vezes na cesta e mexeria na media sem que ninguem tenha
    // cotado nada novo. O `documento` e a chave — e o id da compra no Painel.
    const jaImportados = new Set(item.cotacoes.map((cotacao) => cotacao.documento).filter(Boolean));

    return NextResponse.json({
      catalogo: item.catalogo,
      precos: precos.map((preco) => ({
        ...preco,
        origem: origemDoPreco(preco),
        jaImportado: jaImportados.has(preco.documento),
      })),
    });
  } catch (erro) {
    // Falha de rede nao e "sem preco": a tela precisa dizer que nao conseguiu
    // perguntar, e nao que a origem nao tem nada.
    return NextResponse.json(
      { error: `Nao foi possivel consultar o Painel de Precos agora: ${(erro as Error).message}` },
      { status: 502 },
    );
  }
}
