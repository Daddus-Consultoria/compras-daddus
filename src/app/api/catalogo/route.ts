import { podeEditarLote } from "@/lib/auth/papeis";
import { modoDemonstracao, obterSessao } from "@/lib/auth/sessao";
import { buscarNoCatalogo, situacaoDoCatalogo } from "@/lib/repositorio/catalogo";
import { NextResponse } from "next/server";

/**
 * Busca no catalogo CATMAT/CATSER, para amarrar um item do lote a um codigo.
 *
 * A busca e local (ver db/migrations/009): a API do Compras.gov.br nao procura
 * por texto, entao o catalogo e coletado por `npm run catalogo` e consultado
 * aqui com indice de relevancia em portugues.
 */
export async function GET(request: Request) {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ error: "Sessao nao encontrada." }, { status: 401 });
  if (modoDemonstracao()) {
    return NextResponse.json({ error: "Banco de dados nao configurado: o catalogo nao esta disponivel." }, { status: 503 });
  }
  // Quem amarra o item ao catalogo e quem monta o lote.
  if (!podeEditarLote(sessao.papel)) {
    return NextResponse.json({ error: "Seu perfil nao edita itens do lote." }, { status: 403 });
  }

  const parametros = new URL(request.url).searchParams;
  const termo = (parametros.get("q") ?? "").trim();
  const tipoBruto = parametros.get("tipo");
  const tipo = tipoBruto === "material" || tipoBruto === "servico" ? tipoBruto : null;

  try {
    const situacao = await situacaoDoCatalogo();
    // Catalogo vazio nao e o mesmo que busca sem resultado, e a tela precisa
    // dizer coisas diferentes: uma se resolve mudando o termo, a outra so
    // rodando a coleta.
    if (!situacao.total) {
      return NextResponse.json({
        itens: [],
        catalogoVazio: true,
        aviso: "O catalogo CATMAT/CATSER ainda nao foi coletado neste ambiente. Rode `npm run catalogo`.",
      });
    }

    if (termo.length < 3) {
      return NextResponse.json({ itens: [], aviso: "Digite ao menos 3 caracteres." });
    }

    return NextResponse.json({ itens: await buscarNoCatalogo(termo, { tipo }), coletadoEm: situacao.coletadoEm });
  } catch (erro) {
    return NextResponse.json({ error: (erro as Error).message }, { status: 500 });
  }
}
