import { demoProcessos, findProcesso, secretariasDemo } from "@/lib/compras";
import { modoDemonstracao } from "@/lib/auth/sessao";
import { acharContratoDemo, contratosDemo } from "@/lib/contratos";
import { lerContrato, listarContratos } from "@/lib/repositorio/contratos";
import { pedidosDemo, saldoDemo, totalContratado, totalExecutado } from "@/lib/pedidos";
import { listarPedidos, resumoDeSaldos, saldoDoContrato, type ResumoSaldo } from "@/lib/repositorio/pedidos";
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

/**
 * Pedidos de fornecimento. O secretario recebe apenas os da propria secretaria,
 * e o filtro e aplicado tanto no banco quanto nos dados de demonstracao.
 */
export async function obterPedidos(
  prefeituraId: number | null,
  filtros: { secretaria?: string | null; contrato?: string | null } = {},
) {
  const filtrarDemo = () =>
    pedidosDemo.filter(
      (pedido) =>
        (!filtros.secretaria || pedido.secretaria === filtros.secretaria) &&
        (!filtros.contrato || pedido.contrato === filtros.contrato),
    );
  if (modoDemonstracao() || prefeituraId === null) {
    return { origem: "memoria" as OrigemDados, pedidos: filtrarDemo() };
  }
  try {
    const secretariaId = filtros.secretaria
      ? (await listarSecretarias(prefeituraId)).find((secretaria) => secretaria.chave === filtros.secretaria)?.id ?? -1
      : null;
    return {
      origem: "postgres" as OrigemDados,
      pedidos: await listarPedidos(prefeituraId, { secretariaId, contrato: filtros.contrato ?? null }),
    };
  } catch {
    return { origem: "memoria" as OrigemDados, pedidos: filtrarDemo() };
  }
}

/** Saldo por item de um contrato: contratado, autorizado, em analise e o que sobra. */
export async function obterSaldo(prefeituraId: number | null, numero: string) {
  if (modoDemonstracao() || prefeituraId === null) return saldoDemo(numero);
  try {
    return await saldoDoContrato(prefeituraId, numero);
  } catch {
    return saldoDemo(numero);
  }
}

/** Um resumo em dinheiro por contrato, para as listas e as metricas. */
export async function obterResumoDeSaldos(prefeituraId: number | null) {
  const demo = () =>
    contratosDemo.map((contrato): ResumoSaldo => {
      const itens = saldoDemo(contrato.numero);
      const contratado = totalContratado(itens);
      const executado = totalExecutado(itens);
      return { contrato: contrato.numero, contratado, executado, saldo: contratado - executado };
    });
  if (modoDemonstracao() || prefeituraId === null) return demo();
  try {
    return await resumoDeSaldos(prefeituraId);
  } catch {
    return demo();
  }
}
