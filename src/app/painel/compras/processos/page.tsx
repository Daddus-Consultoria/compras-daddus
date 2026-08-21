import { PaginaProcessos } from "@/components/compras/PaginaProcessos";
import { exigirPapel } from "@/lib/auth/sessao";
import { obterProcessos, obterSecretarias } from "@/lib/dados";

export const dynamic = "force-dynamic";

export default async function ProcessosPage() {
  const sessao = await exigirPapel("compras", "gestor", "admin", "cpl", "secretario");
  const [{ processos }, secretarias] = await Promise.all([obterProcessos(sessao.prefeituraId), obterSecretarias(sessao.prefeituraId)]);
  return <PaginaProcessos processos={processos} sessao={sessao} secretarias={secretarias} />;
}
