import { podeEditarConfigPrefeitura } from "@/lib/auth/papeis";
import { modoDemonstracao, obterSessao } from "@/lib/auth/sessao";
import type { PrefeituraConfig, RegrasAutorizacao } from "@/lib/compras";
import { atualizarPrefeitura, lerPrefeitura } from "@/lib/repositorio/prefeituras";
import { NextResponse } from "next/server";

const mimesAceitos = ["image/png", "image/jpeg", "image/svg+xml"];
const tamanhoMaximoLogo = 2 * 1024 * 1024;
const vazia: PrefeituraConfig & RegrasAutorizacao = {
  estado: "", nome: "", cnpj: "", logoUrl: "", enderecoCompras: "",
  limiteAutorizacao: null, exigeOrdenadorDistinto: true,
};

/**
 * O limite chega do formulario como texto: vazio e "sem teto", e nao zero.
 * Zero seria uma prefeitura em que o secretario nao autoriza nada, o que a
 * constraint do banco recusa.
 */
function limiteInformado(valor: unknown): number | null | undefined {
  if (valor === null) return null;
  if (valor === undefined) return undefined;
  const texto = String(valor).trim().replace(/\./g, "").replace(",", ".");
  if (!texto) return null;
  const numero = Number(texto);
  if (!Number.isFinite(numero) || numero <= 0) return undefined;
  return numero;
}

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
    const { estado, nome, cnpj, enderecoCompras, logoUrl, limiteAutorizacao, exigeOrdenadorDistinto } = prefeitura;
    return NextResponse.json(
      { estado, nome, cnpj, enderecoCompras, logoUrl, limiteAutorizacao, exigeOrdenadorDistinto },
      { headers: { "x-origem-dados": "postgres" } },
    );
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
  let limiteBruto: unknown;
  let exigeDistinto: boolean | undefined;
  let logo: { mime: string; dados: Buffer } | null = null;

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    body = Object.fromEntries(
      ["estado", "nome", "cnpj", "enderecoCompras"].map((campo) => [campo, String(form.get(campo) || "")]),
    ) as Partial<PrefeituraConfig>;
    limiteBruto = form.has("limiteAutorizacao") ? String(form.get("limiteAutorizacao") ?? "") : undefined;
    exigeDistinto = form.has("exigeOrdenadorDistinto") ? form.get("exigeOrdenadorDistinto") === "true" : undefined;
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
    const json = (await request.json()) as Partial<PrefeituraConfig & RegrasAutorizacao>;
    body = json;
    limiteBruto = "limiteAutorizacao" in json ? json.limiteAutorizacao : undefined;
    exigeDistinto = typeof json.exigeOrdenadorDistinto === "boolean" ? json.exigeOrdenadorDistinto : undefined;
  }

  if (!body.nome?.trim()) return NextResponse.json({ error: "Informe o nome da prefeitura." }, { status: 400 });

  const limite = limiteInformado(limiteBruto);
  if (limite === undefined && limiteBruto !== undefined) {
    return NextResponse.json(
      { error: "A alcada do secretario precisa ser um valor maior que zero, ou vazia para nao ter teto." },
      { status: 400 },
    );
  }

  try {
    // Campo ausente no formulario mantem o que esta gravado: a tela dos dados
    // institucionais nao pode zerar a alcada por omissao.
    const atual = await lerPrefeitura(sessao.prefeituraId);
    const atualizada = await atualizarPrefeitura(sessao.prefeituraId, {
      estado: body.estado ?? "",
      nome: body.nome,
      cnpj: body.cnpj ?? "",
      enderecoCompras: body.enderecoCompras ?? "",
      limiteAutorizacao: limiteBruto === undefined ? atual?.limiteAutorizacao ?? null : limite ?? null,
      exigeOrdenadorDistinto: exigeDistinto ?? atual?.exigeOrdenadorDistinto ?? true,
    }, logo);
    if (!atualizada) return NextResponse.json({ error: "Prefeitura nao encontrada." }, { status: 404 });
    const { estado, nome, cnpj, enderecoCompras, logoUrl, limiteAutorizacao, exigeOrdenadorDistinto } = atualizada;
    return NextResponse.json(
      { estado, nome, cnpj, enderecoCompras, logoUrl, limiteAutorizacao, exigeOrdenadorDistinto },
      { headers: { "x-origem-dados": "postgres" } },
    );
  } catch (erro) {
    return NextResponse.json({ error: (erro as Error).message }, { status: 500 });
  }
}
