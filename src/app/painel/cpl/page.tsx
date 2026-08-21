import { FilaCpl } from "@/components/compras/FilaCpl";
import { exigirPapel } from "@/lib/auth/sessao";
import { fasesNaCpl } from "@/lib/compras";
import { obterDfds, obterProcessos, obterSecretarias, obterSituacaoDosEtps } from "@/lib/dados";
import type { EtpStatus } from "@/lib/etp";

export const dynamic = "force-dynamic";

export default async function CplPage() {
  const sessao = await exigirPapel("cpl", "admin", "gestor");
  const [{ processos }, secretarias, demandas, etps] = await Promise.all([
    obterProcessos(sessao.prefeituraId),
    obterSecretarias(sessao.prefeituraId),
    obterDfds(sessao.prefeituraId),
    obterSituacaoDosEtps(sessao.prefeituraId),
  ]);

  // A comissao precisa dos dois documentos a mao: e com eles que ela instrui a
  // licitacao. Aqui so o indice — o download fica na pagina de cada documento.
  const documentos: Record<string, { dfd: string | null; etp: EtpStatus | null }> = {};
  for (const processo of processos) {
    documentos[processo.id] = {
      dfd: demandas.find((demanda) => demanda.processo === processo.id)?.numero ?? null,
      etp: etps.find((etp) => etp.processo === processo.id)?.status ?? null,
    };
  }

  // A mesa da CPL so mostra o que ja saiu do Setor de Compras.
  const naCpl = processos.filter((processo) => fasesNaCpl.includes(processo.status));
  return <FilaCpl processos={naCpl} sessao={sessao} secretarias={secretarias} documentos={documentos} />;
}
