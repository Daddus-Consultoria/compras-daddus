import { ContratoEditor } from "@/components/compras/ContratoEditor";
import { exigirPapel } from "@/lib/auth/sessao";
import { obterContrato } from "@/lib/dados";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ContratoPage({ params }: PageProps<"/painel/compras/contrato/[numero]">) {
  const sessao = await exigirPapel("compras", "gestor", "admin", "cpl", "secretario");
  const { numero } = await params;
  const { contrato } = await obterContrato(sessao.prefeituraId, decodeURIComponent(numero));
  if (!contrato) notFound();
  // A key remonta o editor ao trocar de contrato, zerando o estado do anterior.
  return <ContratoEditor key={contrato.numero} contrato={contrato} sessao={sessao} />;
}
