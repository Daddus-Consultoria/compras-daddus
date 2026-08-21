import { podeEditarDemanda, podeVerDemandas } from "@/lib/auth/papeis";
import { modoDemonstracao, obterSessao } from "@/lib/auth/sessao";
import { obterDfd } from "@/lib/dados";
import { validarDemanda } from "@/lib/dfd";
import { atualizarDfd } from "@/lib/repositorio/dfd";
import { NextResponse } from "next/server";

export async function GET(_request: Request, { params }: { params: Promise<{ numero: string }> }) {
  const { numero } = await params;
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ error: "Sessao nao encontrada." }, { status: 401 });
  if (!podeVerDemandas(sessao.papel)) {
    return NextResponse.json({ error: "Perfil sem acesso as demandas da prefeitura." }, { status: 403 });
  }
  const dfd = await obterDfd(sessao.prefeituraId, decodeURIComponent(numero));
  // Demanda de outra secretaria nao existe para o secretario.
  if (!dfd || (sessao.papel === "secretario" && dfd.secretaria !== sessao.secretariaChave)) {
    return NextResponse.json({ error: `Demanda ${numero} nao encontrada.` }, { status: 404 });
  }
  return NextResponse.json(dfd);
}

/** Editar so ate a demanda virar processo: dali em diante ela e peca do processo. */
export async function PATCH(request: Request, { params }: { params: Promise<{ numero: string }> }) {
  const { numero } = await params;
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ error: "Sessao nao encontrada." }, { status: 401 });
  if (modoDemonstracao() || sessao.prefeituraId === null) {
    return NextResponse.json({ error: "Banco de dados nao configurado: nada foi gravado." }, { status: 503 });
  }
  if (!podeEditarDemanda(sessao.papel)) {
    return NextResponse.json({ error: "Seu perfil nao edita demandas." }, { status: 403 });
  }

  const existente = await obterDfd(sessao.prefeituraId, decodeURIComponent(numero));
  if (!existente || (sessao.papel === "secretario" && existente.secretaria !== sessao.secretariaChave)) {
    return NextResponse.json({ error: `Demanda ${numero} nao encontrada.` }, { status: 404 });
  }

  let corpo: Record<string, unknown>;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisicao invalido." }, { status: 400 });
  }

  const dados = validarDemanda(corpo);
  if ("error" in dados) return NextResponse.json({ error: dados.error }, { status: 400 });

  try {
    const resultado = await atualizarDfd(sessao.prefeituraId, decodeURIComponent(numero), dados);
    if ("erro" in resultado) {
      if (resultado.erro === "nao-encontrado") {
        return NextResponse.json({ error: `Demanda ${numero} nao encontrada.` }, { status: 404 });
      }
      return NextResponse.json(
        { error: `A demanda ${numero} ja virou processo e nao pode mais ser editada.` },
        { status: 409 },
      );
    }
    return NextResponse.json(await obterDfd(sessao.prefeituraId, decodeURIComponent(numero)));
  } catch (erro) {
    return NextResponse.json({ error: (erro as Error).message }, { status: 500 });
  }
}
