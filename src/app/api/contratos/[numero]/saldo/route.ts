import { podeVerContratos } from "@/lib/auth/papeis";
import { obterSessao } from "@/lib/auth/sessao";
import { obterSaldo } from "@/lib/dados";
import { NextResponse } from "next/server";

/**
 * O saldo do contrato, item a item. E leitura de acompanhamento: quem enxerga o
 * contrato enxerga quanto dele ja foi consumido.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ numero: string }> }) {
  const { numero } = await params;
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ error: "Sessao nao encontrada." }, { status: 401 });
  if (!podeVerContratos(sessao.papel)) {
    return NextResponse.json({ error: "Perfil sem acesso aos contratos da prefeitura." }, { status: 403 });
  }
  return NextResponse.json(await obterSaldo(sessao.prefeituraId, decodeURIComponent(numero)));
}
