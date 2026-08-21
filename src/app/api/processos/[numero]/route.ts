import { obterSessao } from "@/lib/auth/sessao";
import { obterProcesso } from "@/lib/dados";
import { NextResponse } from "next/server";

export async function GET(request: Request, { params }: { params: Promise<{ numero: string }> }) {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ error: "Sessao nao encontrada." }, { status: 401 });
  const { numero } = await params;
  const { origem, processo } = await obterProcesso(sessao.prefeituraId, numero);
  if (!processo) return NextResponse.json({ error: `Processo ${numero} nao encontrado.` }, { status: 404 });
  return NextResponse.json(processo, { headers: { "x-origem-dados": origem } });
}
