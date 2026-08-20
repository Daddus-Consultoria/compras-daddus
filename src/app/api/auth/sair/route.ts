import { nomeCookieSessao } from "@/lib/auth/token";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Saida por navegacao. Existe porque um cookie pode continuar valido depois de
 * o usuario ser desativado ou removido: nesse caso a pagina nao tem como
 * limpar o cookie sozinha, e mandar direto para /login faria o middleware
 * devolver a pessoa ao painel, em laco. Aqui o cookie morre antes do redirect.
 */
export async function GET(request: NextRequest) {
  const resposta = NextResponse.redirect(new URL("/login", request.url));
  resposta.cookies.set(nomeCookieSessao, "", { httpOnly: true, path: "/", maxAge: 0 });
  return resposta;
}
