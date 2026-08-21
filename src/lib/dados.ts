import { demoProcessos, findProcesso, secretariasDemo } from "@/lib/compras";
import { modoDemonstracao } from "@/lib/auth/sessao";
import { acharContratoDemo, contratosDemo } from "@/lib/contratos";
import { lerContrato, listarContratos } from "@/lib/repositorio/contratos";
import { acharDfdDemo, dfdsDemo } from "@/lib/dfd";
import { etpVazio } from "@/lib/etp";
import { pedidosDemo, saldoDemo, totalContratado, totalExecutado } from "@/lib/pedidos";
import { dfdDoProcesso, lerDfd, listarDfds } from "@/lib/repositorio/dfd";
import { lerEtp, situacaoDosEtps } from "@/lib/repositorio/etp";
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

/**
 * Demandas (DFD). O secretario recebe apenas as da propria secretaria, com o
 * recorte feito no servidor — a mesma regra dos pedidos e das solicitacoes.
 */
export async function obterDfds(prefeituraId: number | null, secretaria: string | null = null) {
  const demo = () => (secretaria ? dfdsDemo.filter((dfd) => dfd.secretaria === secretaria) : dfdsDemo);
  if (modoDemonstracao() || prefeituraId === null) return demo();
  try {
    const secretariaId = secretaria
      ? (await listarSecretarias(prefeituraId)).find((opcao) => opcao.chave === secretaria)?.id ?? -1
      : null;
    return await listarDfds(prefeituraId, secretariaId);
  } catch {
    return demo();
  }
}

export async function obterDfd(prefeituraId: number | null, numero: string) {
  if (modoDemonstracao() || prefeituraId === null) return acharDfdDemo(numero);
  try {
    return await lerDfd(prefeituraId, numero);
  } catch {
    return acharDfdDemo(numero);
  }
}

/** A demanda que originou o processo; e dela que sai o inciso I do ETP. */
export async function obterDfdDoProcesso(prefeituraId: number | null, numeroProcesso: string) {
  if (modoDemonstracao() || prefeituraId === null) {
    return dfdsDemo.find((dfd) => dfd.processo === numeroProcesso) ?? null;
  }
  try {
    return await dfdDoProcesso(prefeituraId, numeroProcesso);
  } catch {
    return null;
  }
}

/** Sem banco o estudo abre vazio: da para ver a estrutura, nao para gravar. */
export async function obterEtp(prefeituraId: number | null, numeroProcesso: string) {
  if (modoDemonstracao() || prefeituraId === null) return etpVazio(numeroProcesso);
  try {
    return (await lerEtp(prefeituraId, numeroProcesso)) ?? etpVazio(numeroProcesso);
  } catch {
    return etpVazio(numeroProcesso);
  }
}

export async function obterSituacaoDosEtps(prefeituraId: number | null) {
  if (modoDemonstracao() || prefeituraId === null) return [];
  try {
    return await situacaoDosEtps(prefeituraId);
  } catch {
    return [];
  }
}
