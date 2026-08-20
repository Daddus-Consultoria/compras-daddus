import { SolicitacoesSecretaria } from "@/components/compras/SolicitacoesSecretaria";
import { exigirPapel } from "@/lib/auth/sessao";

export const dynamic = "force-dynamic";

export default async function SolicitacoesPage() {
  const sessao = await exigirPapel("secretario", "compras", "admin", "gestor");
  return <SolicitacoesSecretaria sessao={sessao} />;
}
