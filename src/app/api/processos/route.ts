import { obterSessao } from "@/lib/auth/sessao";
import { obterProcessos } from "@/lib/dados";
import { NextResponse } from "next/server";

export async function GET() {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ error: "Sessao nao encontrada." }, { status: 401 });
  const { origem, processos } = await obterProcessos(sessao.prefeituraId);
  return NextResponse.json(processos, { headers: { "x-origem-dados": origem } });
}
