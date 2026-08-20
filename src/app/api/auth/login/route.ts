import { assinarToken, duracaoSessaoSegundos, nomeCookieSessao } from "@/lib/auth/token";
import { conferirSenha } from "@/lib/auth/senha";
import { modoDemonstracao } from "@/lib/auth/sessao";
import { buscarCredencial, lerUsuario, registrarAcesso } from "@/lib/repositorio/usuarios";
import { NextResponse } from "next/server";

// Mensagem unica para email inexistente e senha errada, para nao revelar quais
// enderecos estao cadastrados.
const recusa = "E-mail ou senha invalidos.";

export async function POST(request: Request) {
  if (modoDemonstracao()) {
    return NextResponse.json({ error: "O portal esta em modo de demonstracao: configure DATABASE_URL e SESSION_SECRET." }, { status: 503 });
  }

  let corpo: { email?: string; senha?: string };
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisicao invalido." }, { status: 400 });
  }

  const email = String(corpo.email ?? "").trim();
  const senha = String(corpo.senha ?? "");
  if (!email || !senha) return NextResponse.json({ error: "Informe e-mail e senha." }, { status: 400 });

  const credencial = await buscarCredencial(email);
  if (!credencial || !(await conferirSenha(senha, credencial.senha_hash))) {
    return NextResponse.json({ error: recusa }, { status: 401 });
  }
  if (!credencial.ativo) {
    return NextResponse.json({ error: "Este acesso esta desativado. Procure o administrador." }, { status: 403 });
  }

  const usuario = await lerUsuario(credencial.id);
  if (!usuario) return NextResponse.json({ error: recusa }, { status: 401 });

  const token = await assinarToken({
    uid: usuario.id,
    nome: usuario.nome,
    papel: usuario.papel,
    prefeituraId: usuario.prefeituraId,
    secretariaId: usuario.secretariaId,
    exp: Math.floor(Date.now() / 1000) + duracaoSessaoSegundos,
  });
  await registrarAcesso(usuario.id);

  const resposta = NextResponse.json({ papel: usuario.papel, precisaTrocarSenha: usuario.precisaTrocarSenha });
  resposta.cookies.set(nomeCookieSessao, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: duracaoSessaoSegundos,
  });
  return resposta;
}
