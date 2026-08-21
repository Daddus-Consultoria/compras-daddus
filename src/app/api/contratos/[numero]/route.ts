import { podeGerenciarContratos, podeVerContratos } from "@/lib/auth/papeis";
import { modoDemonstracao, obterSessao } from "@/lib/auth/sessao";
import { dataBrValida } from "@/lib/compras";
import { contratoStatusLabels, type ContratoStatus, type ItemContrato } from "@/lib/contratos";
import { obterContrato } from "@/lib/dados";
import { atualizarContrato, lerContrato, removerContrato, salvarItensContrato } from "@/lib/repositorio/contratos";
import { NextResponse } from "next/server";


export async function GET(_request: Request, { params }: { params: Promise<{ numero: string }> }) {
  const { numero } = await params;
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ error: "Sessao nao encontrada." }, { status: 401 });
  if (!podeVerContratos(sessao.papel)) {
    return NextResponse.json({ error: "Perfil sem acesso aos contratos da prefeitura." }, { status: 403 });
  }
  const { contrato } = await obterContrato(sessao.prefeituraId, numero);
  if (!contrato) return NextResponse.json({ error: `Contrato ${numero} nao encontrado.` }, { status: 404 });
  return NextResponse.json(contrato);
}

/** Aceita dados do instrumento, a lista de itens, ou os dois na mesma chamada. */
export async function PATCH(request: Request, { params }: { params: Promise<{ numero: string }> }) {
  const { numero } = await params;
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ error: "Sessao nao encontrada." }, { status: 401 });
  if (modoDemonstracao() || sessao.prefeituraId === null) {
    return NextResponse.json({ error: "Banco de dados nao configurado: nada foi gravado." }, { status: 503 });
  }
  if (!podeGerenciarContratos(sessao.papel)) {
    return NextResponse.json({ error: "Somente o Setor de Compras edita contratos." }, { status: 403 });
  }

  let corpo: Record<string, unknown>;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisicao invalido." }, { status: 400 });
  }

  const existente = await lerContrato(sessao.prefeituraId, numero);
  if (!existente) return NextResponse.json({ error: `Contrato ${numero} nao encontrado.` }, { status: 404 });

  if (corpo.status !== undefined && !(String(corpo.status) in contratoStatusLabels)) {
    return NextResponse.json({ error: `Situacao invalida: ${corpo.status}.` }, { status: 400 });
  }
  for (const campo of ["vigenciaInicio", "vigenciaFim"] as const) {
    const valor = corpo[campo];
    if (valor !== undefined && valor !== null && String(valor) && !dataBrValida(String(valor))) {
      return NextResponse.json(
        { error: `Data de vigencia invalida: ${valor}. Use uma data real, no formato DD/MM/AAAA.` },
        { status: 400 },
      );
    }
  }

  let itens: ItemContrato[] | null = null;
  if (corpo.itens !== undefined) {
    if (!Array.isArray(corpo.itens)) return NextResponse.json({ error: "A lista de itens e invalida." }, { status: 400 });
    itens = corpo.itens as ItemContrato[];
    const numeros = new Set<number>();
    for (const item of itens) {
      if (!Number.isInteger(Number(item.item)) || Number(item.item) < 1) {
        return NextResponse.json({ error: "Cada item precisa de um numero inteiro positivo." }, { status: 400 });
      }
      if (numeros.has(Number(item.item))) {
        return NextResponse.json({ error: `O item ${item.item} aparece duas vezes.` }, { status: 400 });
      }
      numeros.add(Number(item.item));
      if (Number(item.quantidadeContratada) < 0 || Number(item.valorUnitario) < 0) {
        return NextResponse.json({ error: "Quantidade e valor unitario nao podem ser negativos." }, { status: 400 });
      }
      if (!String(item.descricao ?? "").trim()) {
        return NextResponse.json({ error: `O item ${item.item} esta sem descricao.` }, { status: 400 });
      }
    }
  }

  try {
    const temDados = ["fornecedor", "cnpjFornecedor", "objeto", "vigenciaInicio", "vigenciaFim", "documento", "status"]
      .some((campo) => corpo[campo] !== undefined);
    if (temDados) {
      await atualizarContrato(sessao.prefeituraId, numero, {
        fornecedor: corpo.fornecedor === undefined ? undefined : String(corpo.fornecedor).trim(),
        cnpjFornecedor: corpo.cnpjFornecedor === undefined ? undefined : String(corpo.cnpjFornecedor).trim(),
        objeto: corpo.objeto === undefined ? undefined : String(corpo.objeto).trim(),
        vigenciaInicio: corpo.vigenciaInicio === undefined ? undefined : String(corpo.vigenciaInicio).trim(),
        vigenciaFim: corpo.vigenciaFim === undefined ? undefined : String(corpo.vigenciaFim).trim(),
        documento: corpo.documento === undefined ? undefined : String(corpo.documento).trim(),
        status: corpo.status === undefined ? undefined : (String(corpo.status) as ContratoStatus),
      });
    }
    if (itens) await salvarItensContrato(sessao.prefeituraId, numero, itens);
    return NextResponse.json(await lerContrato(sessao.prefeituraId, numero));
  } catch (erro) {
    return NextResponse.json({ error: (erro as Error).message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ numero: string }> }) {
  const { numero } = await params;
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ error: "Sessao nao encontrada." }, { status: 401 });
  if (modoDemonstracao() || sessao.prefeituraId === null) {
    return NextResponse.json({ error: "Banco de dados nao configurado: nada foi apagado." }, { status: 503 });
  }
  if (!podeGerenciarContratos(sessao.papel)) {
    return NextResponse.json({ error: "Somente o Setor de Compras exclui contratos." }, { status: 403 });
  }
  const removido = await removerContrato(sessao.prefeituraId, numero);
  if (!removido) return NextResponse.json({ error: `Contrato ${numero} nao encontrado.` }, { status: 404 });
  return NextResponse.json({ removido: numero });
}
