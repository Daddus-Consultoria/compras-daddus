import type { Papel } from "@/lib/auth/papeis";

/**
 * Token de sessao assinado com HMAC-SHA256 pela Web Crypto, que existe tanto
 * no runtime Node quanto no Edge — assim o middleware valida a sessao sem
 * precisar do driver do banco.
 */
export type Conteudo = {
  uid: number;
  nome: string;
  papel: Papel;
  prefeituraId: number | null;
  secretariaId: number | null;
  exp: number;
};

export const nomeCookieSessao = "daddus_sessao";
export const duracaoSessaoSegundos = 8 * 60 * 60;

export function segredoConfigurado() {
  return Boolean(process.env.SESSION_SECRET);
}

function paraBase64Url(bytes: Uint8Array) {
  let binario = "";
  for (const byte of bytes) binario += String.fromCharCode(byte);
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function deBase64Url(texto: string) {
  const preenchido = texto.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(texto.length / 4) * 4, "=");
  const binario = atob(preenchido);
  return Uint8Array.from(binario, (caractere) => caractere.charCodeAt(0));
}

async function chave() {
  const segredo = process.env.SESSION_SECRET;
  if (!segredo) throw new Error("SESSION_SECRET nao configurada.");
  return crypto.subtle.importKey("raw", new TextEncoder().encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function assinarToken(conteudo: Conteudo) {
  const corpo = paraBase64Url(new TextEncoder().encode(JSON.stringify(conteudo)));
  const assinatura = await crypto.subtle.sign("HMAC", await chave(), new TextEncoder().encode(corpo));
  return `${corpo}.${paraBase64Url(new Uint8Array(assinatura))}`;
}

export async function lerToken(token: string | undefined): Promise<Conteudo | null> {
  if (!token || !segredoConfigurado()) return null;
  const [corpo, assinatura] = token.split(".");
  if (!corpo || !assinatura) return null;
  try {
    const valida = await crypto.subtle.verify("HMAC", await chave(), deBase64Url(assinatura), new TextEncoder().encode(corpo));
    if (!valida) return null;
    const conteudo = JSON.parse(new TextDecoder().decode(deBase64Url(corpo))) as Conteudo;
    if (!conteudo.exp || conteudo.exp * 1000 < Date.now()) return null;
    return conteudo;
  } catch {
    return null;
  }
}
