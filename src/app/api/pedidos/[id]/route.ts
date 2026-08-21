import { podeDecidirPedido, podeVerPedidos } from "@/lib/auth/papeis";
import { modoDemonstracao, obterSessao } from "@/lib/auth/sessao";
import { dataBrValida } from "@/lib/compras";
import { contratoStatusLabels } from "@/lib/contratos";
import { acoesDoPedido, pedidoStatusLabels, type AcaoPedido } from "@/lib/pedidos";
import { decidirPedido, lerPedido } from "@/lib/repositorio/pedidos";
import { NextResponse } from "next/server";

/** Mesmo minimo do ajuste de quantidade: motivo de uma linha nao explica nada. */
const minimoMotivo = 10;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ error: "Sessao nao encontrada." }, { status: 401 });
  if (!podeVerPedidos(sessao.papel)) {
    return NextResponse.json({ error: "Perfil sem acesso aos pedidos da prefeitura." }, { status: 403 });
  }
  if (modoDemonstracao() || sessao.prefeituraId === null) {
    return NextResponse.json({ error: "Banco de dados nao configurado." }, { status: 503 });
  }

  const pedido = await lerPedido(sessao.prefeituraId, Number(id));
  // Pedido de outra secretaria nao existe para o secretario: 404, e nao 403,
  // para nao confirmar o que ele nao deveria enxergar.
  if (!pedido || (sessao.papel === "secretario" && pedido.secretaria !== sessao.secretariaChave)) {
    return NextResponse.json({ error: `Pedido ${id} nao encontrado.` }, { status: 404 });
  }
  return NextResponse.json(pedido);
}

/**
 * Autorizar, recusar, cancelar ou estornar. A autorizacao e o ato que baixa o
 * saldo, entao ela e do Setor de Compras; cancelar, so enquanto pendente, cabe
 * tambem a secretaria que abriu.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ error: "Sessao nao encontrada." }, { status: 401 });
  if (modoDemonstracao() || sessao.prefeituraId === null) {
    return NextResponse.json({ error: "Banco de dados nao configurado: nada foi gravado." }, { status: 503 });
  }

  let corpo: Record<string, unknown>;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisicao invalido." }, { status: 400 });
  }

  const acao = String(corpo.acao ?? "") as AcaoPedido;
  if (!(acao in acoesDoPedido)) return NextResponse.json({ error: `Acao invalida: ${acao}.` }, { status: 400 });

  const pedido = await lerPedido(sessao.prefeituraId, Number(id));
  if (!pedido || (sessao.papel === "secretario" && pedido.secretaria !== sessao.secretariaChave)) {
    return NextResponse.json({ error: `Pedido ${id} nao encontrado.` }, { status: 404 });
  }

  const daPropriaSecretaria = sessao.papel === "secretario" && pedido.secretaria === sessao.secretariaChave;
  const permitido = acao === "cancelar"
    ? podeDecidirPedido(sessao.papel) || daPropriaSecretaria
    : podeDecidirPedido(sessao.papel);
  if (!permitido) {
    return NextResponse.json(
      {
        error: acao === "cancelar"
          ? "Cancelar o pedido cabe a secretaria que o abriu ou ao Setor de Compras."
          : `Somente o Setor de Compras pode ${acoesDoPedido[acao].label.toLowerCase()} um pedido.`,
      },
      { status: 403 },
    );
  }

  const motivo = String(corpo.motivo ?? "").trim();
  if (acoesDoPedido[acao].exigeMotivo && motivo.length < minimoMotivo) {
    return NextResponse.json(
      { error: `Escreva o motivo em pelo menos ${minimoMotivo} caracteres: ${acoesDoPedido[acao].label.toLowerCase()} exige justificativa.` },
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

  try {
    const resultado = await decidirPedido(sessao.prefeituraId, Number(id), sessao.id || null, {
      acao,
      motivo,
      empenho: String(corpo.empenho ?? "").trim(),
      entregaPrevista: entregaPrevista || null,
    });
    if (resultado.erro === "pedido-nao-encontrado") {
      return NextResponse.json({ error: `Pedido ${id} nao encontrado.` }, { status: 404 });
    }
    if (resultado.erro === "acao-incompativel") {
      return NextResponse.json(
        {
          error: `"${acoesDoPedido[acao].label}" nao cabe num pedido em "${pedidoStatusLabels[resultado.status!]}".`,
        },
        { status: 409 },
      );
    }
    if (resultado.erro === "contrato-inativo" || resultado.erro === "contrato-nao-encontrado") {
      const rotulo = resultado.status ? contratoStatusLabels[resultado.status as keyof typeof contratoStatusLabels] : "";
      return NextResponse.json(
        {
          error: rotulo
            ? `O contrato ${pedido.contrato} esta ${rotulo.toLowerCase()}: reative-o antes de autorizar o fornecimento.`
            : `Contrato ${pedido.contrato} nao encontrado.`,
        },
        { status: 409 },
      );
    }
    if (resultado.erro === "sem-saldo") {
      const lista = (resultado.faltas ?? [])
        .map((falta) => `item ${falta.item}: pedido ${falta.pedida} ${falta.unidade}, saldo ${falta.disponivel}`)
        .join("; ");
      return NextResponse.json(
        { error: `O contrato nao tem mais saldo para este pedido (${lista}).`, faltas: resultado.faltas },
        { status: 409 },
      );
    }
    return NextResponse.json(await lerPedido(sessao.prefeituraId, Number(id)));
  } catch (erro) {
    return NextResponse.json({ error: (erro as Error).message }, { status: 500 });
  }
}
