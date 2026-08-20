import { NextResponse } from "next/server";

const solicitacoes: Array<Record<string, string>> = [];

export async function GET() {
  return NextResponse.json(solicitacoes);
}

export async function POST(request: Request) {
  const body = await request.json();
  const solicitacao = { id: `SOL-${Date.now()}`, ...body, status: "Recebida", createdAt: new Date().toISOString() };
  solicitacoes.unshift(solicitacao);
  return NextResponse.json(solicitacao, { status: 201 });
}
