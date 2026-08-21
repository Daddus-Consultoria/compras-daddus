import { FichaDemanda } from "@/components/compras/FichaDemanda";
import { exigirPapel } from "@/lib/auth/sessao";
import { obterDfd } from "@/lib/dados";
import { lerPrefeitura } from "@/lib/repositorio/prefeituras";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const prefeituraVazia = { estado: "", nome: "", cnpj: "", enderecoCompras: "", logoUrl: "" };

export default async function DfdPage({ params }: PageProps<"/painel/compras/dfd/[numero]">) {
  const sessao = await exigirPapel("secretario", "compras", "admin", "gestor", "cpl");
  const { numero } = await params;
  const dfd = await obterDfd(sessao.prefeituraId, decodeURIComponent(numero));
  // Demanda de outra secretaria nao existe para o secretario.
  if (!dfd || (sessao.papel === "secretario" && dfd.secretaria !== sessao.secretariaChave)) notFound();

  const prefeitura = sessao.prefeituraId ? await lerPrefeitura(sessao.prefeituraId).catch(() => null) : null;
  return <FichaDemanda key={dfd.numero} dfd={dfd} sessao={sessao} prefeitura={prefeitura ?? prefeituraVazia} />;
}
