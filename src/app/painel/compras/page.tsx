import { CentralCompras } from "@/components/compras/CentralCompras";
import { obterProcessos } from "@/lib/dados";

export const dynamic = "force-dynamic";

export default async function ComprasPage() {
  const { processos } = await obterProcessos();
  return <CentralCompras processos={processos} />;
}
