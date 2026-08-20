import { nomeCookieSessao } from "@/lib/auth/token";
import { NextResponse } from "next/server";

export async function POST() {
  const resposta = NextResponse.json({ ok: true });
  resposta.cookies.set(nomeCookieSessao, "", { httpOnly: true, path: "/", maxAge: 0 });
  return resposta;
}
