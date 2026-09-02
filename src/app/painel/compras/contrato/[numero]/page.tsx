import { ContratoEditor } from "@/components/compras/ContratoEditor";
import { exigirPapel } from "@/lib/auth/sessao";
import { obterContrato, obterEmpenhos, obterPedidos, obterSaldo } from "@/lib/dados";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ContratoPage({ params }: PageProps<"/painel/compras/contrato/[numero]">) {
  const sessao = await exigirPapel("compras", "gestor", "admin", "cpl", "secretario", "gabinete");
  const { numero } = await params;
  const { contrato } = await obterContrato(sessao.prefeituraId, decodeURIComponent(numero));
  if (!contrato) notFound();
  // O saldo e os pedidos vem do servidor junto com o contrato: sao a mesma
  // leitura, e a tela nunca precisa recalcular saldo por conta propria.
  const [saldo, { pedidos }, { empenhos }] = await Promise.all([
    obterSaldo(sessao.prefeituraId, contrato.numero),
    obterPedidos(sessao.prefeituraId, {
      contrato: contrato.numero,
      secretaria: sessao.papel === "secretario" ? sessao.secretariaChave : null,
    }),
    obterEmpenhos(sessao.prefeituraId, contrato.numero),
  ]);
  // A key remonta o editor ao trocar de contrato, zerando o estado do anterior.
  return <ContratoEditor key={contrato.numero} contrato={contrato} saldo={saldo} pedidos={pedidos} empenhos={empenhos} sessao={sessao} />;
}
