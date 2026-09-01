import { PaginaContratos } from "@/components/compras/PaginaContratos";
import { exigirPapel } from "@/lib/auth/sessao";
import { obterContratos, obterProcessos, obterResumoDeSaldos } from "@/lib/dados";

export const dynamic = "force-dynamic";

export default async function ContratosPage() {
  const sessao = await exigirPapel("compras", "gestor", "admin", "cpl", "secretario", "gabinete");
  const [{ contratos }, { processos }, saldos] = await Promise.all([
    obterContratos(sessao.prefeituraId),
    obterProcessos(sessao.prefeituraId),
    obterResumoDeSaldos(sessao.prefeituraId),
  ]);
  return <PaginaContratos contratos={contratos} processos={processos} saldos={saldos} sessao={sessao} />;
}
