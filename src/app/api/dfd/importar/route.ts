import { podeAbrirSolicitacao } from "@/lib/auth/papeis";
import { modoDemonstracao, obterSessao } from "@/lib/auth/sessao";
import { tipoFonteLabels, type TipoFonte } from "@/lib/dfd";
import { fontesDeImportacao, itensDaFonte } from "@/lib/repositorio/dfd";
import { listarSecretarias } from "@/lib/repositorio/secretarias";
import { NextResponse } from "next/server";

/**
 * De onde a secretaria pode puxar itens ja digitados. Sem `tipo`, devolve as
 * fontes disponiveis; com `tipo` e `id`, os itens daquela fonte.
 *
 * O recorte e sempre a secretaria da sessao: importar de um relatorio anterior
 * nao pode virar uma porta para ler o consumo da secretaria vizinha.
 */
export async function GET(request: Request) {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ error: "Sessao nao encontrada." }, { status: 401 });
  if (!podeAbrirSolicitacao(sessao.papel)) {
    return NextResponse.json({ error: "Seu perfil nao abre demandas." }, { status: 403 });
  }
  if (modoDemonstracao() || sessao.prefeituraId === null) return NextResponse.json([]);

  const parametros = new URL(request.url).searchParams;
  const chave = sessao.papel === "secretario" ? sessao.secretariaChave : parametros.get("secretaria");
  if (!chave) return NextResponse.json({ error: "Informe a secretaria da demanda." }, { status: 400 });

  const secretaria = (await listarSecretarias(sessao.prefeituraId)).find((opcao) => opcao.chave === chave);
  if (!secretaria) return NextResponse.json({ error: `Secretaria invalida: ${chave}.` }, { status: 400 });

  const tipo = parametros.get("tipo");
  if (!tipo) return NextResponse.json(await fontesDeImportacao(sessao.prefeituraId, secretaria.id));

  if (!(tipo in tipoFonteLabels)) return NextResponse.json({ error: `Fonte invalida: ${tipo}.` }, { status: 400 });
  const id = parametros.get("id");
  if (!id) return NextResponse.json({ error: "Informe qual documento importar." }, { status: 400 });

  return NextResponse.json(await itensDaFonte(sessao.prefeituraId, secretaria.id, tipo as TipoFonte, id));
}
