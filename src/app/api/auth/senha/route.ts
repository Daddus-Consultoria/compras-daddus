import { conferirSenha, gerarHash, problemaNaSenha } from "@/lib/auth/senha";
import { obterSessao } from "@/lib/auth/sessao";
import { buscarCredencial, definirSenha } from "@/lib/repositorio/usuarios";
import { NextResponse } from "next/server";

export async function PUT(request: Request) {
  const sessao = await obterSessao();
  if (!sessao || sessao.demonstracao) return NextResponse.json({ error: "Sessao nao encontrada." }, { status: 401 });

  let corpo: { senhaAtual?: string; novaSenha?: string };
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisicao invalido." }, { status: 400 });
  }

  const senhaAtual = String(corpo.senhaAtual ?? "");
  const novaSenha = String(corpo.novaSenha ?? "");

  const credencial = await buscarCredencial(sessao.email);
  if (!credencial || !(await conferirSenha(senhaAtual, credencial.senha_hash))) {
    return NextResponse.json({ error: "A senha atual esta incorreta." }, { status: 400 });
  }
  const problema = problemaNaSenha(novaSenha);
  if (problema) return NextResponse.json({ error: problema }, { status: 400 });
  if (novaSenha === senhaAtual) return NextResponse.json({ error: "A nova senha precisa ser diferente da atual." }, { status: 400 });

  await definirSenha(sessao.id, await gerarHash(novaSenha), false);
  return NextResponse.json({ ok: true });
}
