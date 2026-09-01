import { papeisQuePodeCriar, papelLabels, podeGerenciarUsuarios, podeSerOrdenador, type Papel } from "@/lib/auth/papeis";
import { gerarHash, problemaNaSenha } from "@/lib/auth/senha";
import { modoDemonstracao, obterSessao } from "@/lib/auth/sessao";
import { criarUsuario, definirAtivo, definirOrdenador, definirSenha, emailJaUsado, lerUsuario, listarUsuarios } from "@/lib/repositorio/usuarios";
import { listarSecretarias } from "@/lib/repositorio/secretarias";
import { NextResponse } from "next/server";

const emailValido = (valor: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);

export async function GET() {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ error: "Sessao nao encontrada." }, { status: 401 });
  if (!podeGerenciarUsuarios(sessao.papel)) return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  if (modoDemonstracao()) return NextResponse.json([]);
  try {
    // Admin so enxerga a propria prefeitura; superadmin ve todas.
    return NextResponse.json(await listarUsuarios(sessao.papel === "superadmin" ? null : sessao.prefeituraId));
  } catch (erro) {
    return NextResponse.json({ error: (erro as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ error: "Sessao nao encontrada." }, { status: 401 });
  if (!podeGerenciarUsuarios(sessao.papel)) return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  if (modoDemonstracao()) return NextResponse.json({ error: "Banco de dados nao configurado." }, { status: 503 });

  let corpo: Record<string, unknown>;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisicao invalido." }, { status: 400 });
  }

  const nome = String(corpo.nome ?? "").trim();
  const email = String(corpo.email ?? "").trim().toLowerCase();
  const senha = String(corpo.senha ?? "");
  const papel = String(corpo.papel ?? "") as Papel;

  if (!nome) return NextResponse.json({ error: "Informe o nome." }, { status: 400 });
  if (!emailValido(email)) return NextResponse.json({ error: "Informe um e-mail valido." }, { status: 400 });
  if (!papeisQuePodeCriar(sessao.papel).includes(papel)) {
    return NextResponse.json({ error: `Seu perfil nao pode criar usuarios do tipo "${papel || "nao informado"}".` }, { status: 403 });
  }
  const problema = problemaNaSenha(senha);
  if (problema) return NextResponse.json({ error: problema }, { status: 400 });

  // Admin cria sempre dentro da propria prefeitura, ignorando o que a tela mandar.
  const prefeituraId = sessao.papel === "superadmin" ? Number(corpo.prefeituraId) : sessao.prefeituraId;
  if (!Number.isInteger(prefeituraId) || !prefeituraId) {
    return NextResponse.json({ error: "Escolha a prefeitura do usuario." }, { status: 400 });
  }

  let secretariaId: number | null = null;
  if (papel === "secretario") {
    secretariaId = Number(corpo.secretariaId);
    const secretarias = await listarSecretarias(prefeituraId);
    if (!secretarias.some((secretaria) => secretaria.id === secretariaId)) {
      return NextResponse.json({ error: "Escolha uma secretaria valida desta prefeitura." }, { status: 400 });
    }
  }

  // Ordenar despesa e designacao, nao consequencia do perfil: dentro da mesma
  // secretaria ha quem requisite e ha quem autorize, e os dois sao secretario.
  const ordenador = corpo.ordenador === true;
  if (ordenador && !podeSerOrdenador(papel)) {
    return NextResponse.json(
      { error: `Ordenador de despesa so pode ser secretario ou gabinete, e nao "${papelLabels[papel]}".` },
      { status: 400 },
    );
  }

  try {
    if (await emailJaUsado(email)) return NextResponse.json({ error: "Ja existe um usuario com esse e-mail." }, { status: 409 });
    const id = await criarUsuario({ email, nome, senhaHash: await gerarHash(senha), papel, prefeituraId, secretariaId, ordenador });
    return NextResponse.json(await lerUsuario(id), { status: 201 });
  } catch (erro) {
    return NextResponse.json({ error: (erro as Error).message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ error: "Sessao nao encontrada." }, { status: 401 });
  if (!podeGerenciarUsuarios(sessao.papel)) return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  if (modoDemonstracao()) return NextResponse.json({ error: "Banco de dados nao configurado." }, { status: 503 });

  let corpo: Record<string, unknown>;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisicao invalido." }, { status: 400 });
  }

  const id = Number(corpo.id);
  const alvo = Number.isInteger(id) ? await lerUsuario(id) : null;
  if (!alvo) return NextResponse.json({ error: "Usuario nao encontrado." }, { status: 404 });
  if (sessao.papel !== "superadmin" && alvo.prefeituraId !== sessao.prefeituraId) {
    return NextResponse.json({ error: "Esse usuario nao pertence a sua prefeitura." }, { status: 403 });
  }
  if (alvo.id === sessao.id) return NextResponse.json({ error: "Voce nao pode alterar o proprio acesso por aqui." }, { status: 400 });

  try {
    if (typeof corpo.ativo === "boolean") {
      await definirAtivo(alvo.id, corpo.ativo);
    }
    if (typeof corpo.ordenador === "boolean") {
      if (corpo.ordenador && !podeSerOrdenador(alvo.papel)) {
        return NextResponse.json(
          { error: `${papelLabels[alvo.papel]} nao pode ser ordenador de despesa.` },
          { status: 400 },
        );
      }
      await definirOrdenador(alvo.id, corpo.ordenador);
    }
    if (typeof corpo.novaSenha === "string" && corpo.novaSenha) {
      const problema = problemaNaSenha(corpo.novaSenha);
      if (problema) return NextResponse.json({ error: problema }, { status: 400 });
      // Senha definida por terceiro sempre exige troca no proximo acesso.
      await definirSenha(alvo.id, await gerarHash(corpo.novaSenha), true);
    }
    return NextResponse.json(await lerUsuario(alvo.id));
  } catch (erro) {
    return NextResponse.json({ error: (erro as Error).message }, { status: 500 });
  }
}
