import { ConfiguracaoPrefeitura } from "@/components/compras/ConfiguracaoPrefeitura";
import { exigirPapel } from "@/lib/auth/sessao";

export const dynamic = "force-dynamic";

export default async function ConfiguracoesPage() {
  const sessao = await exigirPapel("admin", "compras");
  return <ConfiguracaoPrefeitura sessao={sessao} />;
}
