import { GestaoUsuarios } from "@/components/compras/GestaoUsuarios";
import { exigirPapel, modoDemonstracao } from "@/lib/auth/sessao";
import { lerPrefeitura } from "@/lib/repositorio/prefeituras";
import { listarSecretarias, listarUsuarios } from "@/lib/repositorio/usuarios";

export const dynamic = "force-dynamic";

export default async function PrefeituraPage() {
  const sessao = await exigirPapel("admin");
  if (modoDemonstracao() || !sessao.prefeituraId) {
    return <GestaoUsuarios sessao={sessao} usuarios={[]} prefeituras={[]} secretarias={{}} />;
  }
  const [usuarios, prefeitura, secretarias] = await Promise.all([
    listarUsuarios(sessao.prefeituraId),
    lerPrefeitura(sessao.prefeituraId),
    listarSecretarias(sessao.prefeituraId),
  ]);
  return (
    <GestaoUsuarios
      sessao={sessao}
      usuarios={usuarios}
      prefeituras={prefeitura ? [prefeitura] : []}
      secretarias={{ [sessao.prefeituraId]: secretarias }}
    />
  );
}
