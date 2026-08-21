import { demoProcessos, findProcesso, secretariasDemo } from "@/lib/compras";
import { modoDemonstracao } from "@/lib/auth/sessao";
import { acharContratoDemo, contratosDemo } from "@/lib/contratos";
import { lerContrato, listarContratos } from "@/lib/repositorio/contratos";
import { lerProcesso, listarProcessos } from "@/lib/repositorio/processos";
import { listarSecretarias } from "@/lib/repositorio/secretarias";

export type OrigemDados = "postgres" | "memoria";

/**
 * Em demonstracao (sem banco ou sem segredo de sessao) devolve os processos de
 * exemplo. Com banco, so devolve o que pertence a prefeitura informada.
 */
export async function obterProcessos(prefeituraId: number | null) {
  if (modoDemonstracao() || prefeituraId === null) {
    return { origem: "memoria" as OrigemDados, processos: demoProcessos };
  }
  try {
    return { origem: "postgres" as OrigemDados, processos: await listarProcessos(prefeituraId) };
  } catch {
    return { origem: "memoria" as OrigemDados, processos: demoProcessos };
  }
}

export async function obterProcesso(prefeituraId: number | null, numero: string) {
  if (modoDemonstracao() || prefeituraId === null) {
    return { origem: "memoria" as OrigemDados, processo: findProcesso(numero) ?? null };
  }
  try {
    return { origem: "postgres" as OrigemDados, processo: await lerProcesso(prefeituraId, numero) };
  } catch {
    return { origem: "memoria" as OrigemDados, processo: findProcesso(numero) ?? null };
  }
}

/** Secretarias da prefeitura da sessao, com as de exemplo no modo demonstracao. */
export async function obterSecretarias(prefeituraId: number | null) {
  if (modoDemonstracao() || prefeituraId === null) return secretariasDemo;
  try {
    return await listarSecretarias(prefeituraId);
  } catch {
    return secretariasDemo;
  }
}

/** Mesma regra dos processos: sem banco, os contratos de exemplo. */
export async function obterContratos(prefeituraId: number | null) {
  if (modoDemonstracao() || prefeituraId === null) {
    return { origem: "memoria" as OrigemDados, contratos: contratosDemo };
  }
  try {
    return { origem: "postgres" as OrigemDados, contratos: await listarContratos(prefeituraId) };
  } catch {
    return { origem: "memoria" as OrigemDados, contratos: contratosDemo };
  }
}

export async function obterContrato(prefeituraId: number | null, numero: string) {
  if (modoDemonstracao() || prefeituraId === null) {
    return { origem: "memoria" as OrigemDados, contrato: acharContratoDemo(numero) };
  }
  try {
    return { origem: "postgres" as OrigemDados, contrato: await lerContrato(prefeituraId, numero) };
  } catch {
    return { origem: "memoria" as OrigemDados, contrato: acharContratoDemo(numero) };
  }
}
