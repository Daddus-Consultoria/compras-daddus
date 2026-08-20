import { paginaInicial, type Papel } from "@/lib/auth/papeis";
import { lerToken, nomeCookieSessao, segredoConfigurado } from "@/lib/auth/token";
import type { Secretaria } from "@/lib/compras";
import { bancoConfigurado } from "@/lib/db";
import { lerUsuario } from "@/lib/repositorio/usuarios";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export type Sessao = {
  id: number;
  nome: string;
  email: string;
  papel: Papel;
  prefeituraId: number | null;
  prefeituraNome: string | null;
  secretariaId: number | null;
  secretariaChave: Secretaria | null;
  precisaTrocarSenha: boolean;
  demonstracao: boolean;
};

/**
 * Sem banco ou sem segredo de sessao nao ha como autenticar ninguem. Em vez de
 * derrubar o portal, ele abre em demonstracao: dados de exemplo, nada gravado,
 * e a interface avisa disso.
 */
export function modoDemonstracao() {
  return !bancoConfigurado() || !segredoConfigurado();
}

const sessaoDemonstracao: Sessao = {
  id: 0,
  nome: "Visitante",
  email: "demonstracao@daddus",
  papel: "compras",
  prefeituraId: null,
  prefeituraNome: "Prefeitura de Nova Esperanca",
  secretariaId: null,
  secretariaChave: "administracao",
  precisaTrocarSenha: false,
  demonstracao: true,
};

export async function obterSessao(): Promise<Sessao | null> {
  if (modoDemonstracao()) return sessaoDemonstracao;
  const armazem = await cookies();
  const conteudo = await lerToken(armazem.get(nomeCookieSessao)?.value);
  if (!conteudo) return null;
  // O usuario e relido a cada requisicao para que desativar alguem tenha efeito
  // imediato, sem esperar o token expirar.
  const usuario = await lerUsuario(conteudo.uid);
  if (!usuario || !usuario.ativo) return null;
  return {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    papel: usuario.papel,
    prefeituraId: usuario.prefeituraId,
    prefeituraNome: usuario.prefeituraNome,
    secretariaId: usuario.secretariaId,
    secretariaChave: usuario.secretariaChave,
    precisaTrocarSenha: usuario.precisaTrocarSenha,
    demonstracao: false,
  };
}

export async function exigirSessao() {
  const sessao = await obterSessao();
  // Passa por /api/auth/sair para o cookie ser apagado: um cookie ainda
  // assinado, mas de usuario desativado, faria middleware e pagina ficarem se
  // redirecionando um para o outro.
  if (!sessao) redirect("/api/auth/sair");
  if (sessao.precisaTrocarSenha) redirect("/trocar-senha");
  return sessao;
}

/** Quem nao tem o papel exigido volta para o proprio painel, nao para um erro. */
export async function exigirPapel(...aceitos: Papel[]) {
  const sessao = await exigirSessao();
  if (!aceitos.includes(sessao.papel)) redirect(paginaInicial(sessao.papel));
  return sessao;
}

/** A prefeitura em que a sessao opera. Superadmin escolhe pela URL; os demais tem a sua. */
export function prefeituraDaSessao(sessao: Sessao) {
  return sessao.prefeituraId;
}
