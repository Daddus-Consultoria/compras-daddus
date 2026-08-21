import { podeAbrirPedido, podeVerPedidos } from "@/lib/auth/papeis";
import { modoDemonstracao, obterSessao } from "@/lib/auth/sessao";
import { dataBrValida } from "@/lib/compras";
import { contratoStatusLabels } from "@/lib/contratos";
import { obterPedidos } from "@/lib/dados";
import { pedidoStatusLabels, type PedidoStatus } from "@/lib/pedidos";
import { criarPedido, type ItemDoPedido } from "@/lib/repositorio/pedidos";
import { NextResponse } from "next/server";

/** Justificativa curta demais nao explica a necessidade a quem vai autorizar. */
const minimoJustificativa = 10;

export async function GET(request: Request) {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ error: "Sessao nao encontrada." }, { status: 401 });
  if (!podeVerPedidos(sessao.papel)) {
    return NextResponse.json({ error: "Perfil sem acesso aos pedidos da prefeitura." }, { status: 403 });
  }

  const parametros = new URL(request.url).searchParams;
  const status = parametros.get("status");
  if (status && !(status in pedidoStatusLabels)) {
    return NextResponse.json({ error: `Situacao invalida: ${status}.` }, { status: 400 });
  }

  // O secretario enxerga apenas o que a propria secretaria pediu; o filtro vive
  // no servidor, e nao na tela, para nao depender do que o navegador mandar.
  const { origem, pedidos } = await obterPedidos(sessao.prefeituraId, {
    secretaria: sessao.papel === "secretario" ? sessao.secretariaChave : null,
    contrato: parametros.get("contrato"),
  });
  const filtrados = status ? pedidos.filter((pedido) => pedido.status === (status as PedidoStatus)) : pedidos;
  return NextResponse.json(filtrados, { headers: { "x-origem-dados": origem } });
}

/** Abrir o pedido e da secretaria; o Setor de Compras abre indicando por quem. */
export async function POST(request: Request) {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ error: "Sessao nao encontrada." }, { status: 401 });
  if (modoDemonstracao() || sessao.prefeituraId === null) {
    return NextResponse.json({ error: "Banco de dados nao configurado: nada foi gravado." }, { status: 503 });
  }
  if (!podeAbrirPedido(sessao.papel)) {
    return NextResponse.json({ error: "Somente a secretaria e o Setor de Compras abrem pedido de fornecimento." }, { status: 403 });
  }

  let corpo: Record<string, unknown>;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisicao invalido." }, { status: 400 });
  }

  const contrato = String(corpo.contrato ?? "").trim();
  if (!contrato) return NextResponse.json({ error: "Informe o contrato do fornecimento." }, { status: 400 });

  // O secretario nunca escolhe a secretaria: ela vem da sessao, do mesmo jeito
  // que a coluna do lote. Mandar outra no corpo nao muda nada.
  const secretaria = sessao.papel === "secretario" ? sessao.secretariaChave : String(corpo.secretaria ?? "").trim();
  if (!secretaria) {
    return NextResponse.json({ error: "Informe a secretaria que vai receber o fornecimento." }, { status: 400 });
  }

  const justificativa = String(corpo.justificativa ?? "").trim();
  if (justificativa.length < minimoJustificativa) {
    return NextResponse.json(
      { error: `Explique a necessidade em pelo menos ${minimoJustificativa} caracteres.` },
      { status: 400 },
    );
  }

  const entregaPrevista = corpo.entregaPrevista ? String(corpo.entregaPrevista).trim() : "";
  if (entregaPrevista && !dataBrValida(entregaPrevista)) {
    return NextResponse.json(
      { error: `Data de entrega invalida: ${entregaPrevista}. Use uma data real, no formato DD/MM/AAAA.` },
      { status: 400 },
    );
  }

  if (!Array.isArray(corpo.itens) || !corpo.itens.length) {
    return NextResponse.json({ error: "Informe ao menos um item do contrato." }, { status: 400 });
  }
  const itens: ItemDoPedido[] = [];
  const vistos = new Set<number>();
  for (const bruto of corpo.itens as Array<Record<string, unknown>>) {
    const itemContratoId = Number(bruto?.itemContratoId);
    const quantidade = Number(bruto?.quantidade);
    if (!Number.isInteger(itemContratoId) || itemContratoId <= 0) {
      return NextResponse.json({ error: "Cada item precisa apontar para um item do contrato." }, { status: 400 });
    }
    if (vistos.has(itemContratoId)) {
      return NextResponse.json({ error: "O mesmo item do contrato aparece duas vezes no pedido." }, { status: 400 });
    }
    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      return NextResponse.json({ error: "A quantidade pedida precisa ser maior que zero." }, { status: 400 });
    }
    vistos.add(itemContratoId);
    itens.push({ itemContratoId, quantidade });
  }

  try {
    const resultado = await criarPedido(sessao.prefeituraId, sessao.id || null, {
      contrato,
      secretaria,
      justificativa,
      entregaPrevista: entregaPrevista || null,
      itens,
    });
    if (resultado.erro) return respostaDeErro(resultado, contrato);
    return NextResponse.json({ id: resultado.id, numero: resultado.numero }, { status: 201 });
  } catch (erro) {
    return NextResponse.json({ error: (erro as Error).message }, { status: 500 });
  }
}

type Falha = { erro?: string; status?: string; faltas?: Array<{ item: number; unidade: string; pedida: number; disponivel: number }> };

/** Traduz o motivo tecnico da recusa numa frase que diz o que fazer a seguir. */
function respostaDeErro(resultado: Falha, contrato: string) {
  if (resultado.erro === "contrato-nao-encontrado") {
    return NextResponse.json({ error: `Contrato ${contrato} nao encontrado.` }, { status: 404 });
  }
  if (resultado.erro === "contrato-inativo") {
    const rotulo = contratoStatusLabels[(resultado.status ?? "encerrado") as keyof typeof contratoStatusLabels];
    return NextResponse.json(
      { error: `O contrato ${contrato} esta ${rotulo.toLowerCase()}: so contrato ativo recebe pedido.` },
      { status: 409 },
    );
  }
  if (resultado.erro === "secretaria-nao-encontrada" || resultado.erro === "secretaria-inativa") {
    return NextResponse.json({ error: "Secretaria invalida ou desativada." }, { status: 400 });
  }
  if (resultado.erro === "item-de-outro-contrato") {
    return NextResponse.json({ error: "Ha item que nao pertence a este contrato." }, { status: 400 });
  }
  if (resultado.erro === "sem-saldo") {
    const lista = (resultado.faltas ?? [])
      .map((falta) => `item ${falta.item}: pedido ${falta.pedida} ${falta.unidade}, disponivel ${falta.disponivel}`)
      .join("; ");
    return NextResponse.json({ error: `Saldo insuficiente no contrato (${lista}).`, faltas: resultado.faltas }, { status: 409 });
  }
  return NextResponse.json({ error: "Outro pedido tomou o numero neste instante. Tente novamente." }, { status: 409 });
}
