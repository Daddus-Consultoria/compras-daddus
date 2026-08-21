import { modoDemonstracao, obterSessao } from "@/lib/auth/sessao";
import { listarSolicitacoes } from "@/lib/repositorio/solicitacoes";
import { NextResponse } from "next/server";

// Criar demanda vive em /api/dfd desde a Fase 5: la ela nasce com itens e
// memoria de calculo, que e o que o ETP precisa citar depois.
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
