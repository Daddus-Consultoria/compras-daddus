import { FormularioTrocaSenha } from "@/components/compras/FormularioTrocaSenha";
import { obterSessao } from "@/lib/auth/sessao";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Usa obterSessao, e nao exigirSessao, para nao entrar em laco de redirecionamento.
export default async function TrocarSenhaPage() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/api/auth/sair");
  if (sessao.demonstracao) redirect("/painel");
  return <FormularioTrocaSenha nome={sessao.nome.split(" ")[0]} obrigatoria={sessao.precisaTrocarSenha} />;
}
