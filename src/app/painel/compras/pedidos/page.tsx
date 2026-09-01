import { PaginaPedidos } from "@/components/compras/PaginaPedidos";
import { exigirPapel } from "@/lib/auth/sessao";
import { obterContratos, obterPedidos, obterRegrasDeAutorizacao, obterSecretarias } from "@/lib/dados";

export const dynamic = "force-dynamic";

export default async function PedidosPage() {
  const sessao = await exigirPapel("compras", "secretario", "gabinete", "gestor", "admin", "cpl");
  const [{ pedidos }, { contratos }, secretarias, regras] = await Promise.all([
    // O recorte do secretario e feito aqui, no servidor, e nao na tela.
    obterPedidos(sessao.prefeituraId, { secretaria: sessao.papel === "secretario" ? sessao.secretariaChave : null }),
    obterContratos(sessao.prefeituraId),
    obterSecretarias(sessao.prefeituraId),
    obterRegrasDeAutorizacao(sessao.prefeituraId),
  ]);
  return <PaginaPedidos pedidos={pedidos} contratos={contratos} secretarias={secretarias} regras={regras} sessao={sessao} />;
}
