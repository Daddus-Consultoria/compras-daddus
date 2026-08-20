import { NextResponse } from "next/server";
import type { PrefeituraConfig } from "@/lib/compras";
import { isStrapiConfigured, prefeituraFromStrapi, strapiRequest } from "@/lib/strapi";

let config: PrefeituraConfig = { estado: "SP", nome: "Prefeitura de Nova Esperanca", cnpj: "12.345.678/0001-90", logoUrl: "", enderecoCompras: "Praca da Republica, 100 - Centro" };

export async function GET() {
  if (isStrapiConfigured()) {
    const payload = await strapiRequest<{ data?: Record<string, unknown> }>("/api/config-prefeitura");
    return NextResponse.json(prefeituraFromStrapi(payload));
  }
  return NextResponse.json(config);
}

export async function PUT(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  let body: Partial<PrefeituraConfig>;
  let logo: File | null = null;
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    body = Object.fromEntries(["estado", "nome", "cnpj", "enderecoCompras"].map((field) => [field, String(form.get(field) || "")])) as Partial<PrefeituraConfig>;
    const uploadedLogo = form.get("logo");
    logo = uploadedLogo instanceof File && uploadedLogo.size > 0 ? uploadedLogo : null;
  } else {
    body = (await request.json()) as Partial<PrefeituraConfig>;
  }
  if (isStrapiConfigured()) {
    let logoId: number | undefined;
    if (logo) {
      const uploadForm = new FormData();
      uploadForm.append("files", logo, logo.name);
      const uploadPayload = await strapiRequest<Array<{ id: number }>>("/api/upload", { method: "POST", body: uploadForm, headers: {} });
      logoId = uploadPayload[0]?.id;
    }
    const payload = await strapiRequest<{ data?: Record<string, unknown> }>("/api/config-prefeitura", {
      method: "PUT",
      body: JSON.stringify({ data: { ...body, ...(logoId ? { logo: logoId } : {}) } }),
    });
    return NextResponse.json(prefeituraFromStrapi(payload));
  }
  config = { ...config, ...body };
  return NextResponse.json(config);
}
