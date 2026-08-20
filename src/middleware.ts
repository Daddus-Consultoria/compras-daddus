import { lerToken, nomeCookieSessao, segredoConfigurado } from "@/lib/auth/token";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Barreira barata: so confere a assinatura do cookie para decidir se a pessoa
 * ve a tela de login. A checagem de papel e de prefeitura acontece do lado do
 * servidor, em cada pagina e rota de API, onde o banco esta disponivel.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Sem segredo configurado o portal roda em demonstracao e nao ha o que barrar.
  if (!segredoConfigurado()) return NextResponse.next();

  const conteudo = await lerToken(request.cookies.get(nomeCookieSessao)?.value);
  const autenticado = Boolean(conteudo);

  if (pathname === "/login" && autenticado) {
    return NextResponse.redirect(new URL("/painel", request.url));
  }
  if (pathname.startsWith("/painel") && !autenticado) {
    const destino = new URL("/login", request.url);
    destino.searchParams.set("de", pathname);
    return NextResponse.redirect(destino);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/painel/:path*", "/login"],
};
