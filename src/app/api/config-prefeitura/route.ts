import { podeEditarConfigPrefeitura } from "@/lib/auth/papeis";
import { modoDemonstracao, obterSessao } from "@/lib/auth/sessao";
import type { PrefeituraConfig } from "@/lib/compras";
import { atualizarPrefeitura, lerPrefeitura } from "@/lib/repositorio/prefeituras";
import { NextResponse } from "next/server";

const mimesAceitos = ["image/png", "image/jpeg", "image/svg+xml"];
const tamanhoMaximoLogo = 2 * 1024 * 1024;
const vazia: PrefeituraConfig = { estado: "", nome: "", cnpj: "", logoUrl: "", enderecoCompras: "" };

/** Sempre a prefeitura da sessao: nao ha como pedir a de outro municipio. */
export async function GET() {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ error: "Sessao nao encontrada." }, { status: 401 });
  if (modoDemonstracao() || sessao.prefeituraId === null) {
    return NextResponse.json(vazia, { headers: { "x-origem-dados": "memoria" } });
  }
  try {
    const prefeitura = await lerPrefeitura(sessao.prefeituraId);
    if (!prefeitura) return NextResponse.json(vazia, { headers: { "x-origem-dados": "postgres" } });
    const { estado, nome, cnpj, enderecoCompras, logoUrl } = prefeitura;
    return NextResponse.json({ estado, nome, cnpj, enderecoCompras, logoUrl }, { headers: { "x-origem-dados": "postgres" } });
  } catch (erro) {
    return NextResponse.json({ error: (erro as Error).message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ error: "Sessao nao encontrada." }, { status: 401 });
  if (modoDemonstracao() || sessao.prefeituraId === null) {
    return NextResponse.json({ error: "Banco de dados nao configurado: nada foi gravado." }, { status: 503 });
  }
  if (!podeEditarConfigPrefeitura(sessao.papel)) {
    return NextResponse.json({ error: "Seu perfil nao pode alterar os dados da prefeitura." }, { status: 403 });
  }

  const contentType = request.headers.get("content-type") || "";
  let body: Partial<PrefeituraConfig>;
  let logo: { mime: string; dados: Buffer } | null = null;

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    body = Object.fromEntries(
      ["estado", "nome", "cnpj", "enderecoCompras"].map((campo) => [campo, String(form.get(campo) || "")]),
    ) as Partial<PrefeituraConfig>;
    const arquivo = form.get("logo");
    if (arquivo instanceof File && arquivo.size > 0) {
      if (!mimesAceitos.includes(arquivo.type)) {
        return NextResponse.json({ error: `Formato de logo nao aceito: ${arquivo.type || "desconhecido"}.` }, { status: 400 });
      }
      if (arquivo.size > tamanhoMaximoLogo) {
        return NextResponse.json({ error: "A logo deve ter no maximo 2 MB." }, { status: 400 });
      }
      logo = { mime: arquivo.type, dados: Buffer.from(await arquivo.arrayBuffer()) };
    }
  } else {
    body = (await request.json()) as Partial<PrefeituraConfig>;
  }

  if (!body.nome?.trim()) return NextResponse.json({ error: "Informe o nome da prefeitura." }, { status: 400 });

  try {
    const atualizada = await atualizarPrefeitura(sessao.prefeituraId, {
      estado: body.estado ?? "",
      nome: body.nome,
      cnpj: body.cnpj ?? "",
      enderecoCompras: body.enderecoCompras ?? "",
    }, logo);
    if (!atualizada) return NextResponse.json({ error: "Prefeitura nao encontrada." }, { status: 404 });
    const { estado, nome, cnpj, enderecoCompras, logoUrl } = atualizada;
    return NextResponse.json({ estado, nome, cnpj, enderecoCompras, logoUrl }, { headers: { "x-origem-dados": "postgres" } });
  } catch (erro) {
    return NextResponse.json({ error: (erro as Error).message }, { status: 500 });
  }
}
