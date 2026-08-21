import { podeEditarTodasAsColunas } from "@/lib/auth/papeis";
import { modoDemonstracao, obterSessao } from "@/lib/auth/sessao";
import { obterProcessos } from "@/lib/dados";
import { criarProcesso, proximoNumeroProcesso } from "@/lib/repositorio/processos";
import { listarSecretarias } from "@/lib/repositorio/secretarias";
import { NextResponse } from "next/server";

const dataBr = /^\d{2}\/\d{2}\/\d{4}$/;

export async function GET(request: Request) {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ error: "Sessao nao encontrada." }, { status: 401 });

  // ?sugerirNumero=1 devolve o proximo numero livre do ano, para o formulario.
  if (new URL(request.url).searchParams.has("sugerirNumero")) {
    const ano = new Date().getFullYear();
    if (modoDemonstracao() || sessao.prefeituraId === null) return NextResponse.json({ numero: `${ano}-0001` });
    return NextResponse.json({ numero: await proximoNumeroProcesso(sessao.prefeituraId, ano) });
  }

  const { origem, processos } = await obterProcessos(sessao.prefeituraId);
  return NextResponse.json(processos, { headers: { "x-origem-dados": origem } });
}

/** Abrir processo e trabalho do Setor de Compras. */
export async function POST(request: Request) {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ error: "Sessao nao encontrada." }, { status: 401 });
  if (modoDemonstracao() || sessao.prefeituraId === null) {
    return NextResponse.json({ error: "Banco de dados nao configurado: nada foi gravado." }, { status: 503 });
  }
  if (!podeEditarTodasAsColunas(sessao.papel)) {
    return NextResponse.json({ error: "Somente o Setor de Compras abre processos." }, { status: 403 });
  }

  let corpo: Record<string, unknown>;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisicao invalido." }, { status: 400 });
  }

  const numero = String(corpo.numero ?? "").trim();
  const objeto = String(corpo.objeto ?? "").trim();
  const prazoLimite = corpo.prazoLimite ? String(corpo.prazoLimite).trim() : "";
  const secretaria = String(corpo.secretaria ?? "").trim();
  const responsavel = String(corpo.responsavel ?? "").trim() || sessao.nome;

  if (!numero) return NextResponse.json({ error: "Informe o numero do processo." }, { status: 400 });
  if (numero.length > 40) return NextResponse.json({ error: "O numero do processo e longo demais." }, { status: 400 });
  if (!objeto) return NextResponse.json({ error: "Informe o objeto da compra." }, { status: 400 });
  if (prazoLimite && !dataBr.test(prazoLimite)) {
    return NextResponse.json({ error: "O prazo limite deve estar no formato DD/MM/AAAA." }, { status: 400 });
  }

  if (secretaria) {
    const secretarias = await listarSecretarias(sessao.prefeituraId);
    if (!secretarias.some((opcao) => opcao.chave === secretaria && opcao.ativa)) {
      return NextResponse.json({ error: `Secretaria invalida ou desativada: ${secretaria}.` }, { status: 400 });
    }
  }

  const solicitacaoId = Number(corpo.solicitacaoId);
  try {
    const resultado = await criarProcesso(sessao.prefeituraId, sessao.id || null, {
      numero,
      objeto,
      prazoLimite: prazoLimite || null,
      secretaria: secretaria || null,
      responsavel,
      solicitacaoId: Number.isInteger(solicitacaoId) ? solicitacaoId : null,
    });
    if ("erro" in resultado) {
      return NextResponse.json({ error: `Ja existe um processo com o numero ${numero}.` }, { status: 409 });
    }
    return NextResponse.json({ numero: resultado.numero }, { status: 201 });
  } catch (erro) {
    return NextResponse.json({ error: (erro as Error).message }, { status: 500 });
  }
}
