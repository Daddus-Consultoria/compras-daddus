import { podeEditarEtp, podeVerEtp } from "@/lib/auth/papeis";
import { modoDemonstracao, obterSessao, type Sessao } from "@/lib/auth/sessao";
import { obterDfdDoProcesso, obterEtp, obterProcesso, obterSecretarias } from "@/lib/dados";
import { camposDoEtp, derivarEtp, faltaParaConcluir, type CampoEtp } from "@/lib/etp";
import { concluirEtp, reabrirEtp, salvarEtp } from "@/lib/repositorio/etp";
import { NextResponse } from "next/server";

/**
 * Enquanto o estudo e rascunho, os incisos derivados sao recalculados a cada
 * leitura — se a cotacao muda, o ETP muda junto. Concluido, vale o instantaneo
 * congelado na assinatura.
 */
async function montar(sessao: Sessao, numeroProcesso: string) {
  const [{ processo }, dfd, secretarias, etp] = await Promise.all([
    obterProcesso(sessao.prefeituraId, numeroProcesso),
    obterDfdDoProcesso(sessao.prefeituraId, numeroProcesso),
    obterSecretarias(sessao.prefeituraId),
    obterEtp(sessao.prefeituraId, numeroProcesso),
  ]);
  if (!processo) return null;
  const vivo = derivarEtp({ processo, dfd, secretarias });
  return { processo, dfd, etp, derivado: etp.status === "concluido" && etp.instantaneo ? etp.instantaneo : vivo, vivo };
}

export async function GET(_request: Request, { params }: { params: Promise<{ processo: string }> }) {
  const { processo } = await params;
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ error: "Sessao nao encontrada." }, { status: 401 });
  if (!podeVerEtp(sessao.papel)) {
    return NextResponse.json({ error: "Perfil sem acesso ao estudo tecnico." }, { status: 403 });
  }
  const dados = await montar(sessao, decodeURIComponent(processo));
  if (!dados) return NextResponse.json({ error: `Processo ${processo} nao encontrado.` }, { status: 404 });
  return NextResponse.json({ etp: dados.etp, derivado: dados.derivado, demanda: dados.dfd });
}

/** Grava os incisos discursivos. Estudo concluido nao aceita edicao: reabra antes. */
export async function PATCH(request: Request, { params }: { params: Promise<{ processo: string }> }) {
  const { processo } = await params;
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ error: "Sessao nao encontrada." }, { status: 401 });
  if (modoDemonstracao() || sessao.prefeituraId === null) {
    return NextResponse.json({ error: "Banco de dados nao configurado: nada foi gravado." }, { status: 503 });
  }
  if (!podeEditarEtp(sessao.papel)) {
    return NextResponse.json({ error: "O estudo tecnico preliminar e elaborado pelo Setor de Compras." }, { status: 403 });
  }

  let corpo: Record<string, unknown>;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisicao invalido." }, { status: 400 });
  }

  const campos: Partial<Record<CampoEtp | "omissoes", string>> = {};
  for (const campo of [...camposDoEtp, "omissoes" as const]) {
    if (corpo[campo] !== undefined) campos[campo] = String(corpo[campo] ?? "").trim();
  }
  if (!Object.keys(campos).length) return NextResponse.json({ error: "Nenhum campo informado." }, { status: 400 });

  try {
    const resultado = await salvarEtp(sessao.prefeituraId, decodeURIComponent(processo), sessao.id || null, campos);
    if ("erro" in resultado) {
      if (resultado.erro === "processo-nao-encontrado") {
        return NextResponse.json({ error: `Processo ${processo} nao encontrado.` }, { status: 404 });
      }
      return NextResponse.json(
        { error: "O estudo ja foi concluido. Reabra para editar — a reabertura descarta o instantaneo assinado." },
        { status: 409 },
      );
    }
    const dados = await montar(sessao, decodeURIComponent(processo));
    return NextResponse.json({ etp: dados?.etp, derivado: dados?.derivado });
  } catch (erro) {
    return NextResponse.json({ error: (erro as Error).message }, { status: 500 });
  }
}

/** Concluir congela o derivado; reabrir devolve o estudo ao calculo vivo. */
export async function POST(request: Request, { params }: { params: Promise<{ processo: string }> }) {
  const { processo } = await params;
  const numero = decodeURIComponent(processo);
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ error: "Sessao nao encontrada." }, { status: 401 });
  if (modoDemonstracao() || sessao.prefeituraId === null) {
    return NextResponse.json({ error: "Banco de dados nao configurado: nada foi gravado." }, { status: 503 });
  }
  if (!podeEditarEtp(sessao.papel)) {
    return NextResponse.json({ error: "O estudo tecnico preliminar e elaborado pelo Setor de Compras." }, { status: 403 });
  }

  let corpo: Record<string, unknown>;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisicao invalido." }, { status: 400 });
  }

  const acao = String(corpo.acao ?? "");
  if (acao !== "concluir" && acao !== "reabrir") {
    return NextResponse.json({ error: `Acao invalida: ${acao}.` }, { status: 400 });
  }

  const dados = await montar(sessao, numero);
  if (!dados) return NextResponse.json({ error: `Processo ${processo} nao encontrado.` }, { status: 404 });

  try {
    if (acao === "reabrir") {
      const reaberto = await reabrirEtp(sessao.prefeituraId, numero);
      if (!reaberto) return NextResponse.json({ error: "Nao ha estudo concluido para reabrir." }, { status: 409 });
      return NextResponse.json({ status: "rascunho" });
    }

    const faltas = faltaParaConcluir(dados.etp, dados.vivo);
    if (faltas.length) {
      return NextResponse.json(
        { error: `O estudo ainda nao pode ser concluido: falta ${faltas.join("; ")}.`, faltas },
        { status: 422 },
      );
    }

    // A data entra aqui, no servidor, e nao no navegador de quem clicou.
    const instantaneo = {
      ...dados.vivo,
      geradoEm: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }),
    };
    const concluido = await concluirEtp(sessao.prefeituraId, numero, sessao.id || null, instantaneo);
    if (!concluido) {
      return NextResponse.json({ error: "O estudo ja estava concluido." }, { status: 409 });
    }
    return NextResponse.json({ status: "concluido" });
  } catch (erro) {
    return NextResponse.json({ error: (erro as Error).message }, { status: 500 });
  }
}
