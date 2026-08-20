import { NextResponse } from "next/server";
import { secretariaLabels } from "@/lib/compras";
import { bancoConfigurado } from "@/lib/db";
import { criarSolicitacao, listarSolicitacoes, type Solicitacao } from "@/lib/repositorio/solicitacoes";

/** Usado apenas quando DATABASE_URL nao esta configurada. */
const solicitacoesEmMemoria: Solicitacao[] = [];

export async function GET() {
  if (!bancoConfigurado()) return NextResponse.json(solicitacoesEmMemoria, { headers: { "x-origem-dados": "memoria" } });
  try {
    return NextResponse.json(await listarSolicitacoes(), { headers: { "x-origem-dados": "postgres" } });
  } catch (erro) {
    return NextResponse.json({ error: (erro as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisicao invalido." }, { status: 400 });
  }

  const objeto = String(body.objeto ?? "").trim();
  const justificativa = String(body.justificativa ?? "").trim();
  const secretaria = String(body.secretaria ?? "").trim();

  if (!objeto) return NextResponse.json({ error: "Informe o objeto da compra." }, { status: 400 });
  if (!justificativa) return NextResponse.json({ error: "Informe a justificativa." }, { status: 400 });
  if (!(secretaria in secretariaLabels)) {
    return NextResponse.json({ error: `Secretaria invalida: ${secretaria || "nao informada"}.` }, { status: 400 });
  }

  if (!bancoConfigurado()) {
    const solicitacao: Solicitacao = {
      id: `SOL-${solicitacoesEmMemoria.length + 1}`,
      objeto,
      justificativa,
      secretaria: secretaria as Solicitacao["secretaria"],
      status: "pendente",
      createdAt: new Date().toISOString(),
    };
    solicitacoesEmMemoria.unshift(solicitacao);
    return NextResponse.json(solicitacao, { status: 201, headers: { "x-origem-dados": "memoria" } });
  }
  try {
    const criada = await criarSolicitacao({ objeto, justificativa, secretaria });
    return NextResponse.json(criada, { status: 201, headers: { "x-origem-dados": "postgres" } });
  } catch (erro) {
    return NextResponse.json({ error: (erro as Error).message }, { status: 500 });
  }
}
