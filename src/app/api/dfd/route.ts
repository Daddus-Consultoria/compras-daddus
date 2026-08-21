import { podeAbrirSolicitacao, podeVerDemandas } from "@/lib/auth/papeis";
import { modoDemonstracao, obterSessao } from "@/lib/auth/sessao";
import { obterDfds } from "@/lib/dados";
import { validarDemanda } from "@/lib/dfd";
import { criarDfd } from "@/lib/repositorio/dfd";
import { NextResponse } from "next/server";

export async function GET() {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ error: "Sessao nao encontrada." }, { status: 401 });
  if (!podeVerDemandas(sessao.papel)) {
    return NextResponse.json({ error: "Perfil sem acesso as demandas da prefeitura." }, { status: 403 });
  }
  // O secretario enxerga apenas as demandas da propria secretaria.
  const escopo = sessao.papel === "secretario" ? sessao.secretariaChave : null;
  return NextResponse.json(await obterDfds(sessao.prefeituraId, escopo));
}

export async function POST(request: Request) {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ error: "Sessao nao encontrada." }, { status: 401 });
  if (modoDemonstracao() || sessao.prefeituraId === null) {
    return NextResponse.json({ error: "Banco de dados nao configurado: nada foi gravado." }, { status: 503 });
  }
  if (!podeAbrirSolicitacao(sessao.papel)) {
    return NextResponse.json({ error: "Seu perfil nao pode abrir demandas." }, { status: 403 });
  }

  let corpo: Record<string, unknown>;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisicao invalido." }, { status: 400 });
  }

  // O secretario nao escolhe a secretaria: e sempre a dele, como no lote.
  const secretaria = sessao.papel === "secretario" ? String(sessao.secretariaChave ?? "") : String(corpo.secretaria ?? "").trim();
  if (!secretaria) return NextResponse.json({ error: "Informe a secretaria da demanda." }, { status: 400 });

  const dados = validarDemanda(corpo);
  if ("error" in dados) return NextResponse.json({ error: dados.error }, { status: 400 });

  try {
    const resultado = await criarDfd(sessao.prefeituraId, sessao.id || null, secretaria, dados);
    if ("erro" in resultado) {
      if (resultado.erro === "numero-em-disputa") {
        return NextResponse.json({ error: "Outra demanda tomou o numero neste instante. Tente novamente." }, { status: 409 });
      }
      return NextResponse.json({ error: "Secretaria invalida ou desativada." }, { status: 400 });
    }
    return NextResponse.json({ numero: resultado.numero }, { status: 201 });
  } catch (erro) {
    return NextResponse.json({ error: (erro as Error).message }, { status: 500 });
  }
}
