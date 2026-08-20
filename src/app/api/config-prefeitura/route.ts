import { NextResponse } from "next/server";
import type { PrefeituraConfig } from "@/lib/compras";
import { bancoConfigurado } from "@/lib/db";
import { gravarConfig, lerConfig, type LogoArmazenada } from "@/lib/repositorio/config";

/** Usado apenas quando DATABASE_URL nao esta configurada, para o app subir em branco. */
let configEmMemoria: PrefeituraConfig = { estado: "", nome: "", cnpj: "", logoUrl: "", enderecoCompras: "" };

const mimesAceitos = ["image/png", "image/jpeg", "image/svg+xml"];
const tamanhoMaximoLogo = 2 * 1024 * 1024;

export async function GET() {
  if (!bancoConfigurado()) return NextResponse.json(configEmMemoria, { headers: { "x-origem-dados": "memoria" } });
  try {
    return NextResponse.json(await lerConfig(), { headers: { "x-origem-dados": "postgres" } });
  } catch (erro) {
    return NextResponse.json({ error: (erro as Error).message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  let body: Partial<PrefeituraConfig>;
  let logo: LogoArmazenada | null = null;

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

  if (!bancoConfigurado()) {
    configEmMemoria = { ...configEmMemoria, ...body };
    return NextResponse.json(configEmMemoria, { headers: { "x-origem-dados": "memoria" } });
  }
  try {
    return NextResponse.json(await gravarConfig(body, logo), { headers: { "x-origem-dados": "postgres" } });
  } catch (erro) {
    return NextResponse.json({ error: (erro as Error).message }, { status: 500 });
  }
}
