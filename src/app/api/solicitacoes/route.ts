import { podeAbrirSolicitacao } from "@/lib/auth/papeis";
import { modoDemonstracao, obterSessao } from "@/lib/auth/sessao";
import { listarSecretarias } from "@/lib/repositorio/secretarias";
import { criarSolicitacao, listarSolicitacoes, type Solicitacao } from "@/lib/repositorio/solicitacoes";
import { NextResponse } from "next/server";

export async function GET() {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ error: "Sessao nao encontrada." }, { status: 401 });
  if (modoDemonstracao() || sessao.prefeituraId === null) {
    return NextResponse.json([], { headers: { "x-origem-dados": "memoria" } });
  }
  try {
    // Secretario ve so o que a propria secretaria enviou; os demais, a prefeitura inteira.
    const escopo = sessao.papel === "secretario" ? sessao.secretariaId : null;
    return NextResponse.json(await listarSolicitacoes(sessao.prefeituraId, escopo), { headers: { "x-origem-dados": "postgres" } });
  } catch (erro) {
    return NextResponse.json({ error: (erro as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ error: "Sessao nao encontrada." }, { status: 401 });
  if (modoDemonstracao() || sessao.prefeituraId === null) {
    return NextResponse.json({ error: "Banco de dados nao configurado: nada foi gravado." }, { status: 503 });
  }
  if (!podeAbrirSolicitacao(sessao.papel)) {
    return NextResponse.json({ error: "Seu perfil nao pode abrir solicitacoes." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisicao invalido." }, { status: 400 });
  }

  const objeto = String(body.objeto ?? "").trim();
  const justificativa = String(body.justificativa ?? "").trim();
  // Secretario nao escolhe a secretaria: e sempre a dele.
  const secretaria = sessao.papel === "secretario" ? String(sessao.secretariaChave ?? "") : String(body.secretaria ?? "").trim();

  if (!objeto) return NextResponse.json({ error: "Informe o objeto da compra." }, { status: 400 });
  if (!justificativa) return NextResponse.json({ error: "Informe a justificativa." }, { status: 400 });
  const secretarias = await listarSecretarias(sessao.prefeituraId);
  if (!secretarias.some((opcao) => opcao.chave === secretaria && opcao.ativa)) {
    return NextResponse.json({ error: `Secretaria invalida ou desativada: ${secretaria || "nao informada"}.` }, { status: 400 });
  }

  try {
    const criada: Solicitacao = await criarSolicitacao({
      prefeituraId: sessao.prefeituraId,
      objeto,
      justificativa,
      secretaria,
      autorId: sessao.id || null,
    });
    return NextResponse.json(criada, { status: 201, headers: { "x-origem-dados": "postgres" } });
  } catch (erro) {
    return NextResponse.json({ error: (erro as Error).message }, { status: 500 });
  }
}
