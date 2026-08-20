import { GestaoPrefeituras } from "@/components/compras/GestaoPrefeituras";
import { exigirPapel, modoDemonstracao } from "@/lib/auth/sessao";
import { listarPrefeituras } from "@/lib/repositorio/prefeituras";

export const dynamic = "force-dynamic";

export default async function SuperadminPage() {
  const sessao = await exigirPapel("superadmin");
  const prefeituras = modoDemonstracao() ? [] : await listarPrefeituras().catch(() => []);
  return <GestaoPrefeituras sessao={sessao} prefeituras={prefeituras} />;
}
