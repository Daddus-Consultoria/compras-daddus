import { CentralCompras } from "@/components/compras/CentralCompras";
import { exigirPapel } from "@/lib/auth/sessao";
import { obterProcessos, obterSecretarias } from "@/lib/dados";

export const dynamic = "force-dynamic";

export default async function ComprasPage() {
  const sessao = await exigirPapel("compras", "gestor", "admin", "secretario");
  const [{ processos }, secretarias] = await Promise.all([obterProcessos(sessao.prefeituraId), obterSecretarias(sessao.prefeituraId)]);
  return <CentralCompras processos={processos} sessao={sessao} secretarias={secretarias} />;
}
