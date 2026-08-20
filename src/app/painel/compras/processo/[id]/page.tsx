import { ProcessoEditor } from "@/components/compras/ProcessoEditor";
import { obterProcesso } from "@/lib/dados";
import { lerConfigOuPadrao } from "@/lib/repositorio/config";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ProcessoPage({ params }: PageProps<"/painel/compras/processo/[id]">) {
  const { id } = await params;
  const [{ processo }, prefeitura] = await Promise.all([obterProcesso(id), lerConfigOuPadrao()]);
  if (!processo) notFound();
  // A key remonta o editor ao trocar de processo, zerando o estado do anterior.
  return <ProcessoEditor key={processo.id} processo={processo} prefeitura={prefeitura} />;
}
