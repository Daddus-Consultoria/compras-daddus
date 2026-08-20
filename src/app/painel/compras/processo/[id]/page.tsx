import { ProcessoEditor } from "@/components/compras/ProcessoEditor";
import { exigirPapel } from "@/lib/auth/sessao";
import { obterProcesso } from "@/lib/dados";
import { lerPrefeitura } from "@/lib/repositorio/prefeituras";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const prefeituraVazia = { estado: "", nome: "", cnpj: "", enderecoCompras: "", logoUrl: "" };

export default async function ProcessoPage({ params }: PageProps<"/painel/compras/processo/[id]">) {
  const sessao = await exigirPapel("compras", "gestor", "admin", "secretario");
  const { id } = await params;
  const { processo } = await obterProcesso(sessao.prefeituraId, id);
  if (!processo) notFound();

  const prefeitura = sessao.prefeituraId ? (await lerPrefeitura(sessao.prefeituraId).catch(() => null)) : null;
  // A key remonta o editor ao trocar de processo, zerando o estado do anterior.
  return <ProcessoEditor key={processo.id} processo={processo} prefeitura={prefeitura ?? prefeituraVazia} sessao={sessao} />;
}
