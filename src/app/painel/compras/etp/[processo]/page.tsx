import { EditorEtp } from "@/components/compras/EditorEtp";
import { exigirPapel } from "@/lib/auth/sessao";
import { obterDfdDoProcesso, obterEtp, obterProcesso, obterSecretarias } from "@/lib/dados";
import { derivarEtp, sugestoes } from "@/lib/etp";
import { lerPrefeitura } from "@/lib/repositorio/prefeituras";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const prefeituraVazia = { estado: "", nome: "", cnpj: "", enderecoCompras: "", logoUrl: "" };

export default async function EtpPage({ params }: PageProps<"/painel/compras/etp/[processo]">) {
  const sessao = await exigirPapel("compras", "cpl", "gestor", "admin", "secretario");
  const { processo: numero } = await params;
  const id = decodeURIComponent(numero);
  const [{ processo }, demanda, secretarias, etp, prefeitura] = await Promise.all([
    obterProcesso(sessao.prefeituraId, id),
    obterDfdDoProcesso(sessao.prefeituraId, id),
    obterSecretarias(sessao.prefeituraId),
    obterEtp(sessao.prefeituraId, id),
    sessao.prefeituraId ? lerPrefeitura(sessao.prefeituraId).catch(() => null) : Promise.resolve(null),
  ]);
  if (!processo) notFound();

  // Rascunho mostra o calculo vivo; concluido, o instantaneo congelado na assinatura.
  const vivo = derivarEtp({ processo, dfd: demanda, secretarias });
  const derivado = etp.status === "concluido" && etp.instantaneo ? etp.instantaneo : vivo;

  return (
    <EditorEtp
      key={`${processo.id}-${etp.status}`}
      processo={processo}
      etp={etp}
      derivado={derivado}
      demanda={demanda}
      sugestoesIniciais={sugestoes(processo, secretarias)}
      sessao={sessao}
      prefeitura={prefeitura ?? prefeituraVazia}
    />
  );
}
