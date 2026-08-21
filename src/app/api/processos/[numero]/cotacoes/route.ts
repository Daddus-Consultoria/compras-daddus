import { podeEditarTodasAsColunas } from "@/lib/auth/papeis";
import { modoDemonstracao, obterSessao } from "@/lib/auth/sessao";
import { cotacoesEditaveis, fonteLabels, statusDescricoes, type FonteCotacao } from "@/lib/compras";
import { atualizarCotacao, criarCotacao, lerProcesso, removerCotacao } from "@/lib/repositorio/processos";
import { NextResponse } from "next/server";

const dataBr = /^\d{2}\/\d{2}\/\d{4}$/;

/** Cotacao e trabalho do Setor de Compras, e so na fase de cotacao. */
async function autorizar(numero: string) {
  const sessao = await obterSessao();
  if (!sessao) return { erro: NextResponse.json({ error: "Sessao nao encontrada." }, { status: 401 }) };
  if (modoDemonstracao() || sessao.prefeituraId === null) {
    return { erro: NextResponse.json({ error: "Banco de dados nao configurado: nada foi gravado." }, { status: 503 }) };
  }
  if (!podeEditarTodasAsColunas(sessao.papel)) {
    return { erro: NextResponse.json({ error: "Somente o Setor de Compras lanca cotacoes." }, { status: 403 }) };
  }
  const processo = await lerProcesso(sessao.prefeituraId, numero);
  if (!processo) return { erro: NextResponse.json({ error: `Processo ${numero} nao encontrado.` }, { status: 404 }) };
  if (!cotacoesEditaveis(processo.status)) {
    return {
      erro: NextResponse.json(
        { error: `O processo esta na fase "${statusDescricoes[processo.status]}" e nao aceita novas cotacoes.` },
        { status: 409 },
      ),
    };
  }
  return { sessao, processo };
}

function validarCotacao(corpo: Record<string, unknown>, exigirTudo: boolean) {
  const fonte = String(corpo.fonte ?? "");
  if ((exigirTudo || corpo.fonte !== undefined) && !(fonte in fonteLabels)) return `Fonte invalida: ${fonte || "nao informada"}.`;
  if (corpo.valorUnitario !== undefined || exigirTudo) {
    const valor = Number(corpo.valorUnitario);
    if (!Number.isFinite(valor) || valor <= 0) return "O valor unitario precisa ser maior que zero.";
  }
  if (exigirTudo && !String(corpo.descricao ?? "").trim()) return "Informe o fornecedor ou a origem da cotacao.";
  const data = corpo.dataCotacao;
  if (data !== undefined && data !== null && data !== "" && !dataBr.test(String(data))) {
    return "A data da cotacao deve estar no formato DD/MM/AAAA.";
  }
  // Desconsiderar exige motivo: e o que a IN 65/2021 pede ao excluir um preco.
  if (corpo.desconsiderada === true && !String(corpo.justificativa ?? "").trim()) {
    return "Para desconsiderar uma cotacao, registre a justificativa.";
  }
  return null;
}

export async function POST(request: Request, { params }: { params: Promise<{ numero: string }> }) {
  const { numero } = await params;
  const autorizacao = await autorizar(numero);
  if (autorizacao.erro) return autorizacao.erro;
  const { sessao, processo } = autorizacao;

  let corpo: Record<string, unknown>;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisicao invalido." }, { status: 400 });
  }

  const numeroItem = Number(corpo.item);
  if (!processo!.itens.some((item) => item.item === numeroItem)) {
    return NextResponse.json({ error: `Item ${corpo.item ?? "?"} nao existe neste lote.` }, { status: 400 });
  }
  const problema = validarCotacao(corpo, true);
  if (problema) return NextResponse.json({ error: problema }, { status: 400 });

  try {
    const id = await criarCotacao(sessao!.prefeituraId!, numero, numeroItem, {
      fonte: String(corpo.fonte) as FonteCotacao,
      descricao: String(corpo.descricao ?? "").trim(),
      documento: String(corpo.documento ?? "").trim(),
      valorUnitario: Number(corpo.valorUnitario),
      dataCotacao: corpo.dataCotacao ? String(corpo.dataCotacao) : null,
      desconsiderada: corpo.desconsiderada === true,
      justificativa: String(corpo.justificativa ?? "").trim(),
    });
    if (!id) return NextResponse.json({ error: "Item nao encontrado." }, { status: 404 });
    return NextResponse.json({ id }, { status: 201 });
  } catch (erro) {
    return NextResponse.json({ error: (erro as Error).message }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ numero: string }> }) {
  const { numero } = await params;
  const autorizacao = await autorizar(numero);
  if (autorizacao.erro) return autorizacao.erro;

  let corpo: Record<string, unknown>;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisicao invalido." }, { status: 400 });
  }
  const id = Number(corpo.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Cotacao invalida." }, { status: 400 });
  const problema = validarCotacao(corpo, false);
  if (problema) return NextResponse.json({ error: problema }, { status: 400 });

  try {
    const alterou = await atualizarCotacao(autorizacao.sessao!.prefeituraId!, id, {
      fonte: corpo.fonte === undefined ? undefined : (String(corpo.fonte) as FonteCotacao),
      descricao: corpo.descricao === undefined ? undefined : String(corpo.descricao).trim(),
      documento: corpo.documento === undefined ? undefined : String(corpo.documento).trim(),
      valorUnitario: corpo.valorUnitario === undefined ? undefined : Number(corpo.valorUnitario),
      dataCotacao: corpo.dataCotacao === undefined || !corpo.dataCotacao ? undefined : String(corpo.dataCotacao),
      desconsiderada: corpo.desconsiderada === undefined ? undefined : corpo.desconsiderada === true,
      justificativa: corpo.justificativa === undefined ? undefined : String(corpo.justificativa).trim(),
    });
    if (!alterou) return NextResponse.json({ error: "Cotacao nao encontrada neste processo." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (erro) {
    return NextResponse.json({ error: (erro as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ numero: string }> }) {
  const { numero } = await params;
  const autorizacao = await autorizar(numero);
  if (autorizacao.erro) return autorizacao.erro;

  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Cotacao invalida." }, { status: 400 });
  try {
    const removeu = await removerCotacao(autorizacao.sessao!.prefeituraId!, id);
    if (!removeu) return NextResponse.json({ error: "Cotacao nao encontrada neste processo." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (erro) {
    return NextResponse.json({ error: (erro as Error).message }, { status: 500 });
  }
}
