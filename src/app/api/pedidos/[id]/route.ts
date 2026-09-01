import { podeConferirPedido, podeVerPedidos } from "@/lib/auth/papeis";
import { modoDemonstracao, obterSessao } from "@/lib/auth/sessao";
import { dataBrValida } from "@/lib/compras";
import { contratoStatusLabels } from "@/lib/contratos";
import {
  acoesDoPedido,
  impedimentoLabels,
  impedimentoParaAutorizar,
  pedidoStatusLabels,
  podeFazer,
  type AcaoPedido,
  type ContextoDeAcao,
} from "@/lib/pedidos";
import { decidirPedido, lerPedido } from "@/lib/repositorio/pedidos";
import { regrasDeAutorizacao } from "@/lib/repositorio/prefeituras";
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
 * Conferir, devolver, autorizar, recusar, cancelar ou estornar. Cada ato tem um
 * dono: a conferencia e do Setor de Compras, a autorizacao e do ordenador — o
 * secretario da pasta ate a alcada da prefeitura, o gabinete acima dela — e o
 * cancelamento e a retirada da secretaria que abriu.
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

  // A alcada e lida do banco, e o valor do pedido e somado no servidor a partir
  // dos itens do contrato: nem um nem outro chegam pelo navegador.
  const regras = await regrasDeAutorizacao(sessao.prefeituraId);
  const impedimento = impedimentoParaAutorizar(
    { id: sessao.id, papel: sessao.papel, ordenador: sessao.ordenador, secretariaChave: sessao.secretariaChave },
    pedido,
    regras,
  );
  const contexto: ContextoDeAcao = {
    confere: podeConferirPedido(sessao.papel),
    autoriza: impedimento === null,
    daPropriaSecretaria: sessao.papel === "secretario" && pedido.secretaria === sessao.secretariaChave,
  };
  if (!podeFazer(acao, contexto)) {
    return NextResponse.json({ error: vetoDe(acao, impedimento) }, { status: 403 });
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

/**
 * Por que a acao foi barrada. Nas tres acoes do ordenador a resposta e o
 * impedimento apurado — dizer "voce nao pode" sem dizer quem pode faria a
 * secretaria ligar para o Setor de Compras perguntar.
 */
function vetoDe(acao: AcaoPedido, impedimento: ReturnType<typeof impedimentoParaAutorizar>) {
  if (acao === "autorizar" || acao === "recusar" || acao === "estornar") {
    return impedimento ? impedimentoLabels[impedimento] : "Seu perfil nao decide a despesa deste pedido.";
  }
  if (acao === "cancelar") return "Cancelar o pedido cabe a secretaria que o abriu.";
  return `Conferir e devolver sao do Setor de Compras: seu perfil nao pode ${acoesDoPedido[acao].label.toLowerCase()} um pedido.`;
}
