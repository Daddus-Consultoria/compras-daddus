import { FormularioLogin } from "@/components/compras/FormularioLogin";
import { modoDemonstracao } from "@/lib/auth/sessao";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { de } = await searchParams;
  const destino = typeof de === "string" && de.startsWith("/painel") ? de : "/painel";
  return <FormularioLogin destino={destino} demonstracao={modoDemonstracao()} />;
}
