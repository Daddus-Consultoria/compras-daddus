import { podeGerenciarPrefeituras } from "@/lib/auth/papeis";
import { modoDemonstracao, obterSessao } from "@/lib/auth/sessao";
import { criarPrefeitura, lerPrefeitura, listarPrefeituras } from "@/lib/repositorio/prefeituras";
import { NextResponse } from "next/server";

export async function GET() {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ error: "Sessao nao encontrada." }, { status: 401 });
  if (!podeGerenciarPrefeituras(sessao.papel)) return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  if (modoDemonstracao()) return NextResponse.json([]);
  try {
    return NextResponse.json(await listarPrefeituras());
  } catch (erro) {
    return NextResponse.json({ error: (erro as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ error: "Sessao nao encontrada." }, { status: 401 });
  if (!podeGerenciarPrefeituras(sessao.papel)) return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  if (modoDemonstracao()) return NextResponse.json({ error: "Banco de dados nao configurado." }, { status: 503 });

  let corpo: Record<string, unknown>;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisicao invalido." }, { status: 400 });
  }

  const nome = String(corpo.nome ?? "").trim();
  if (!nome) return NextResponse.json({ error: "Informe o nome da prefeitura." }, { status: 400 });

  try {
    const id = await criarPrefeitura({
      nome,
      estado: String(corpo.estado ?? "").trim(),
      cnpj: String(corpo.cnpj ?? "").trim(),
      enderecoCompras: String(corpo.enderecoCompras ?? "").trim(),
    });
    return NextResponse.json(await lerPrefeitura(id), { status: 201 });
  } catch (erro) {
    return NextResponse.json({ error: (erro as Error).message }, { status: 500 });
  }
}
