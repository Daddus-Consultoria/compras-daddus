import { podeEditarConfigPrefeitura } from "@/lib/auth/papeis";
import { modoDemonstracao, obterSessao } from "@/lib/auth/sessao";
import { secretariasDemo } from "@/lib/compras";
import { criarSecretaria, definirAtivaSecretaria, listarSecretarias, removerSecretaria, renomearSecretaria, usoDaSecretaria } from "@/lib/repositorio/secretarias";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ error: "Sessao nao encontrada." }, { status: 401 });

  // O superadmin nao tem prefeitura propria: para cadastrar um secretario ele
  // precisa enxergar as secretarias do municipio que esta administrando.
  const pedida = Number(new URL(request.url).searchParams.get("prefeitura"));
  const prefeituraId = sessao.papel === "superadmin" && Number.isInteger(pedida) && pedida > 0 ? pedida : sessao.prefeituraId;

  if (modoDemonstracao() || !prefeituraId) return NextResponse.json(secretariasDemo);
  try {
    return NextResponse.json(await listarSecretarias(prefeituraId));
  } catch (erro) {
    return NextResponse.json({ error: (erro as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ error: "Sessao nao encontrada." }, { status: 401 });
  if (!podeEditarConfigPrefeitura(sessao.papel) || !sessao.prefeituraId) {
    return NextResponse.json({ error: "Somente o administrador da prefeitura gerencia as secretarias." }, { status: 403 });
  }
  if (modoDemonstracao()) return NextResponse.json({ error: "Banco de dados nao configurado." }, { status: 503 });

  let corpo: { nome?: unknown };
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisicao invalido." }, { status: 400 });
  }
  const nome = String(corpo.nome ?? "").trim();
  if (nome.length < 2) return NextResponse.json({ error: "Informe o nome da secretaria." }, { status: 400 });

  try {
    const resultado = await criarSecretaria(sessao.prefeituraId, nome);
    if (resultado.erro) return NextResponse.json({ error: resultado.erro }, { status: 409 });
    return NextResponse.json(resultado.secretaria, { status: 201 });
  } catch (erro) {
    return NextResponse.json({ error: (erro as Error).message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ error: "Sessao nao encontrada." }, { status: 401 });
  if (!podeEditarConfigPrefeitura(sessao.papel) || !sessao.prefeituraId) {
    return NextResponse.json({ error: "Somente o administrador da prefeitura gerencia as secretarias." }, { status: 403 });
  }
  if (modoDemonstracao()) return NextResponse.json({ error: "Banco de dados nao configurado." }, { status: 503 });

  let corpo: { id?: unknown; nome?: unknown; ativa?: unknown };
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisicao invalido." }, { status: 400 });
  }
  const id = Number(corpo.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Secretaria invalida." }, { status: 400 });

  try {
    let atualizada = null;
    if (typeof corpo.nome === "string" && corpo.nome.trim().length >= 2) {
      atualizada = await renomearSecretaria(sessao.prefeituraId, id, corpo.nome);
    }
    if (typeof corpo.ativa === "boolean") {
      atualizada = await definirAtivaSecretaria(sessao.prefeituraId, id, corpo.ativa);
    }
    if (!atualizada) return NextResponse.json({ error: "Secretaria nao encontrada nesta prefeitura." }, { status: 404 });
    return NextResponse.json(atualizada);
  } catch (erro) {
    return NextResponse.json({ error: (erro as Error).message }, { status: 500 });
  }
}

/**
 * Exclusao definitiva so quando a secretaria nunca foi usada. Havendo qualquer
 * historico, a resposta explica o que prende e sugere desativar.
 */
export async function DELETE(request: Request) {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ error: "Sessao nao encontrada." }, { status: 401 });
  if (!podeEditarConfigPrefeitura(sessao.papel) || !sessao.prefeituraId) {
    return NextResponse.json({ error: "Somente o administrador da prefeitura gerencia as secretarias." }, { status: 403 });
  }
  if (modoDemonstracao()) return NextResponse.json({ error: "Banco de dados nao configurado." }, { status: 503 });

  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Secretaria invalida." }, { status: 400 });

  try {
    const uso = await usoDaSecretaria(sessao.prefeituraId, id);
    if (!uso) return NextResponse.json({ error: "Secretaria nao encontrada nesta prefeitura." }, { status: 404 });
    const impedimentos = [
      Number(uso.quantidades) && `${uso.quantidades} quantidade(s) lancada(s)`,
      Number(uso.solicitacoes) && `${uso.solicitacoes} solicitacao(oes)`,
      Number(uso.processos) && `${uso.processos} processo(s)`,
      Number(uso.usuarios) && `${uso.usuarios} usuario(s)`,
    ].filter(Boolean);
    if (impedimentos.length) {
      return NextResponse.json(
        { error: `Nao da para excluir: existe ${impedimentos.join(", ")} ligada(s) a essa secretaria. Desative-a para tira-la das novas planilhas sem apagar o historico.` },
        { status: 409 },
      );
    }
    await removerSecretaria(sessao.prefeituraId, id);
    return NextResponse.json({ ok: true });
  } catch (erro) {
    return NextResponse.json({ error: (erro as Error).message }, { status: 500 });
  }
}
