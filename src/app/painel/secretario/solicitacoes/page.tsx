import { SolicitacoesSecretaria } from "@/components/compras/SolicitacoesSecretaria";
import { exigirPapel } from "@/lib/auth/sessao";
import { obterSecretarias } from "@/lib/dados";

export const dynamic = "force-dynamic";

export default async function SolicitacoesPage() {
  const sessao = await exigirPapel("secretario", "compras", "admin", "gestor");
  const secretarias = await obterSecretarias(sessao.prefeituraId);
  return <SolicitacoesSecretaria sessao={sessao} secretarias={secretarias} />;
}
