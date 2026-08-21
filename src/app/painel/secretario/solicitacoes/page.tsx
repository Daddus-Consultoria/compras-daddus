import { PainelDemandas } from "@/components/compras/PainelDemandas";
import { exigirPapel } from "@/lib/auth/sessao";
import { obterDfds, obterSecretarias } from "@/lib/dados";
import { lerPrefeitura } from "@/lib/repositorio/prefeituras";

export const dynamic = "force-dynamic";

const prefeituraVazia = { estado: "", nome: "", cnpj: "", enderecoCompras: "", logoUrl: "" };

export default async function DemandasPage() {
  const sessao = await exigirPapel("secretario", "compras", "admin", "gestor", "cpl");
  // O recorte do secretario e feito no servidor, como no resto do portal.
  const [demandas, secretarias, prefeitura] = await Promise.all([
    obterDfds(sessao.prefeituraId, sessao.papel === "secretario" ? sessao.secretariaChave : null),
    obterSecretarias(sessao.prefeituraId),
    sessao.prefeituraId ? lerPrefeitura(sessao.prefeituraId).catch(() => null) : Promise.resolve(null),
  ]);
  return (
    <PainelDemandas demandas={demandas} secretarias={secretarias} sessao={sessao} prefeitura={prefeitura ?? prefeituraVazia} />
  );
}
