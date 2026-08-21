import { PaginaContratos } from "@/components/compras/PaginaContratos";
import { exigirPapel } from "@/lib/auth/sessao";
import { obterContratos, obterProcessos } from "@/lib/dados";

export const dynamic = "force-dynamic";

export default async function ContratosPage() {
  const sessao = await exigirPapel("compras", "gestor", "admin", "cpl", "secretario");
  const [{ contratos }, { processos }] = await Promise.all([
    obterContratos(sessao.prefeituraId),
    obterProcessos(sessao.prefeituraId),
  ]);
  return <PaginaContratos contratos={contratos} processos={processos} sessao={sessao} />;
}
