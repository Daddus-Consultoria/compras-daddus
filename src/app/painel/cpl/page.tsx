import { FilaCpl } from "@/components/compras/FilaCpl";
import { exigirPapel } from "@/lib/auth/sessao";
import { fasesNaCpl } from "@/lib/compras";
import { obterProcessos, obterSecretarias } from "@/lib/dados";

export const dynamic = "force-dynamic";

export default async function CplPage() {
  const sessao = await exigirPapel("cpl", "admin", "gestor");
  const [{ processos }, secretarias] = await Promise.all([obterProcessos(sessao.prefeituraId), obterSecretarias(sessao.prefeituraId)]);
  // A mesa da CPL so mostra o que ja saiu do Setor de Compras.
  const naCpl = processos.filter((processo) => fasesNaCpl.includes(processo.status));
  return <FilaCpl processos={naCpl} sessao={sessao} secretarias={secretarias} />;
}
