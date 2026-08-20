import type { PrefeituraConfig } from "@/lib/compras";

const strapiUrl = process.env.STRAPI_URL || process.env.NEXT_PUBLIC_STRAPI_URL;
const strapiToken = process.env.STRAPI_API_TOKEN;

export function isStrapiConfigured() {
  return Boolean(strapiUrl && strapiToken);
}

export async function strapiRequest<T>(path: string, options: RequestInit = {}) {
  if (!strapiUrl || !strapiToken) throw new Error("Strapi não configurado.");
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${strapiToken}`);
  if (!(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const response = await fetch(`${strapiUrl}${path}`, {
    ...options,
    headers,
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({})) as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message || `Strapi respondeu ${response.status}.`);
  return payload;
}

export function unwrapStrapiData<T>(payload: { data?: T } | T) {
  return (payload && typeof payload === "object" && "data" in payload ? payload.data : payload) as T;
}

export function prefeituraFromStrapi(payload: unknown): PrefeituraConfig {
  const data = unwrapStrapiData(payload as { data?: Record<string, unknown> }) || {};
  const logo = data.logo as { url?: string; data?: { attributes?: { url?: string } } } | undefined;
  return {
    estado: String(data.estado || ""),
    nome: String(data.nome || ""),
    cnpj: String(data.cnpj || ""),
    logoUrl: String(data.logoUrl || logo?.url || logo?.data?.attributes?.url || ""),
    enderecoCompras: String(data.enderecoCompras || ""),
  };
}