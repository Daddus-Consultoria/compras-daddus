import { demoProcessos, findProcesso } from "@/lib/compras";
import { bancoConfigurado } from "@/lib/db";
import { lerProcesso, listarProcessos } from "@/lib/repositorio/processos";

export type OrigemDados = "postgres" | "memoria";

/**
 * Le do Postgres quando ele existe. Se o banco nao estiver configurado ou
 * responder com erro, cai nos processos de demonstracao e devolve a origem,
 * para a interface poder avisar que aquilo nao esta sendo gravado.
 */
export async function obterProcessos() {
  if (!bancoConfigurado()) return { origem: "memoria" as OrigemDados, processos: demoProcessos, detalhe: "DATABASE_URL nao configurada." };
  try {
    return { origem: "postgres" as OrigemDados, processos: await listarProcessos(), detalhe: "" };
  } catch (erro) {
    return { origem: "memoria" as OrigemDados, processos: demoProcessos, detalhe: (erro as Error).message };
  }
}

export async function obterProcesso(numero: string) {
  if (!bancoConfigurado()) return { origem: "memoria" as OrigemDados, processo: findProcesso(numero) ?? null };
  try {
    return { origem: "postgres" as OrigemDados, processo: await lerProcesso(numero) };
  } catch {
    return { origem: "memoria" as OrigemDados, processo: findProcesso(numero) ?? null };
  }
}
