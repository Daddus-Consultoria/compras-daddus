import { podeGerenciarContratos, podeVerContratos } from "@/lib/auth/papeis";
import { modoDemonstracao, obterSessao } from "@/lib/auth/sessao";
import { dataBrValida } from "@/lib/compras";
import { contratoStatusLabels, type ContratoStatus } from "@/lib/contratos";
import { obterContratos } from "@/lib/dados";
import { criarContrato, proximoNumeroContrato } from "@/lib/repositorio/contratos";
import { NextResponse } from "next/server";


export async function GET(request: Request) {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ error: "Sessao nao encontrada." }, { status: 401 });
  if (!podeVerContratos(sessao.papel)) {
    return NextResponse.json({ error: "Perfil sem acesso aos contratos da prefeitura." }, { status: 403 });
  }

  // ?sugerirNumero=1 devolve o proximo numero livre do ano, para o formulario.
  if (new URL(request.url).searchParams.has("sugerirNumero")) {
    const ano = new Date().getFullYear();
    if (modoDemonstracao() || sessao.prefeituraId === null) return NextResponse.json({ numero: `001/${ano}` });
    return NextResponse.json({ numero: await proximoNumeroContrato(sessao.prefeituraId, ano) });
  }

  const { origem, contratos } = await obterContratos(sessao.prefeituraId);
  return NextResponse.json(contratos, { headers: { "x-origem-dados": origem } });
}

/** Cadastrar o contrato que voltou da CPL e trabalho do Setor de Compras. */
export async function POST(request: Request) {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ error: "Sessao nao encontrada." }, { status: 401 });
  if (modoDemonstracao() || sessao.prefeituraId === null) {
    return NextResponse.json({ error: "Banco de dados nao configurado: nada foi gravado." }, { status: 503 });
  }
  if (!podeGerenciarContratos(sessao.papel)) {
    return NextResponse.json({ error: "Somente o Setor de Compras cadastra contratos." }, { status: 403 });
  }

  let corpo: Record<string, unknown>;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisicao invalido." }, { status: 400 });
  }

  const numero = String(corpo.numero ?? "").trim();
  const fornecedor = String(corpo.fornecedor ?? "").trim();
  const vigenciaInicio = corpo.vigenciaInicio ? String(corpo.vigenciaInicio).trim() : "";
  const vigenciaFim = corpo.vigenciaFim ? String(corpo.vigenciaFim).trim() : "";
  const status = String(corpo.status ?? "ativo") as ContratoStatus;

  if (!numero) return NextResponse.json({ error: "Informe o numero do contrato." }, { status: 400 });
  if (numero.length > 40) return NextResponse.json({ error: "O numero do contrato e longo demais." }, { status: 400 });
  if (!fornecedor) return NextResponse.json({ error: "Informe o fornecedor contratado." }, { status: 400 });
  if (!(status in contratoStatusLabels)) return NextResponse.json({ error: `Situacao invalida: ${status}.` }, { status: 400 });
  for (const [rotulo, valor] of [["inicio", vigenciaInicio], ["fim", vigenciaFim]] as const) {
    if (valor && !dataBrValida(valor)) {
      return NextResponse.json(
        { error: `Data de ${rotulo} da vigencia invalida: ${valor}. Use uma data real, no formato DD/MM/AAAA.` },
        { status: 400 },
      );
    }
  }
  if (vigenciaInicio && vigenciaFim) {
    // Comparacao por data ISO, que ordena certo — a string DD/MM/AAAA, nao.
    const iso = (valor: string) => valor.split("/").reverse().join("-");
    if (iso(vigenciaFim) < iso(vigenciaInicio)) {
      return NextResponse.json({ error: "A vigencia termina antes de comecar." }, { status: 400 });
    }
  }

  try {
    const resultado = await criarContrato(sessao.prefeituraId, sessao.id || null, {
      numero,
      fornecedor,
      cnpjFornecedor: String(corpo.cnpjFornecedor ?? "").trim(),
      objeto: String(corpo.objeto ?? "").trim(),
      vigenciaInicio: vigenciaInicio || null,
      vigenciaFim: vigenciaFim || null,
      documento: String(corpo.documento ?? "").trim(),
      status,
      processoNumero: corpo.processo ? String(corpo.processo).trim() : null,
      copiarItens: corpo.copiarItens !== false,
    });
    if ("erro" in resultado) {
      if (resultado.erro === "numero-duplicado") {
        return NextResponse.json({ error: `Ja existe um contrato com o numero ${numero}.` }, { status: 409 });
      }
      return NextResponse.json({ error: `Processo ${corpo.processo} nao encontrado.` }, { status: 404 });
    }
    return NextResponse.json({ numero: resultado.numero }, { status: 201 });
  } catch (erro) {
    return NextResponse.json({ error: (erro as Error).message }, { status: 500 });
  }
}
