import { GestaoUsuarios } from "@/components/compras/GestaoUsuarios";
import { exigirPapel, modoDemonstracao } from "@/lib/auth/sessao";
import { listarPrefeituras } from "@/lib/repositorio/prefeituras";
import { listarSecretarias, listarUsuarios } from "@/lib/repositorio/usuarios";

export const dynamic = "force-dynamic";

export default async function SuperadminUsuariosPage() {
  const sessao = await exigirPapel("superadmin");
  if (modoDemonstracao()) return <GestaoUsuarios sessao={sessao} usuarios={[]} prefeituras={[]} secretarias={{}} />;

  const [usuarios, prefeituras] = await Promise.all([listarUsuarios(null), listarPrefeituras()]);
  // As secretarias de cada prefeitura vao juntas, para o formulario poder
  // trocar a lista sem uma ida extra ao servidor.
  const listas = await Promise.all(prefeituras.map((prefeitura) => listarSecretarias(prefeitura.id)));
  const secretarias = Object.fromEntries(prefeituras.map((prefeitura, indice) => [prefeitura.id, listas[indice]]));
  return <GestaoUsuarios sessao={sessao} usuarios={usuarios} prefeituras={prefeituras} secretarias={secretarias} />;
}
