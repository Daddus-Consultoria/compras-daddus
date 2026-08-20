import { ConfiguracaoPrefeitura } from "@/components/compras/ConfiguracaoPrefeitura";
import { exigirPapel } from "@/lib/auth/sessao";
import { obterSecretarias } from "@/lib/dados";

export const dynamic = "force-dynamic";

export default async function ConfiguracoesPage() {
  const sessao = await exigirPapel("admin", "compras");
  const secretarias = await obterSecretarias(sessao.prefeituraId);
  return <ConfiguracaoPrefeitura sessao={sessao} secretarias={secretarias} />;
}
