import { podeRegistrarEmpenho, podeVerPedidos } from "@/lib/auth/papeis";
import { modoDemonstracao, obterSessao } from "@/lib/auth/sessao";
import { dataBrValida } from "@/lib/compras";
import { contratoStatusLabels } from "@/lib/contratos";
import { obterEmpenhos } from "@/lib/dados";
import { atualizarEmpenho, criarEmpenho, lerEmpenho } from "@/lib/repositorio/empenhos";
import { NextResponse } from "next/server";

/** Mesmo minimo das outras justificativas do portal: uma linha nao explica nada. */
const minimoMotivo = 10;

/**
 * As notas de empenho da prefeitura, com o saldo de cada uma.
 *
 * Quem enxerga pedido enxerga empenho: a secretaria precisa saber por que a
 * despesa dela ainda nao foi autorizada, e "a nota nao tem saldo" e uma das
 * respostas possiveis.
 */
export async function GET(request: Request) {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ error: "Sessao nao encontrada." }, { status: 401 });
  if (!podeVerPedidos(sessao.papel)) {
    return NextResponse.json({ error: "Perfil sem acesso aos empenhos da prefeitura." }, { status: 403 });
  }
  const contrato = new URL(request.url).searchParams.get("contrato");
  const { origem, empenhos } = await obterEmpenhos(sessao.prefeituraId, contrato);
  return NextResponse.json(empenhos, { headers: { "x-origem-dados": origem } });
}

type CorpoEmpenho = {
  contrato?: unknown;
  numero?: unknown;
  valor?: unknown;
  dataEmissao?: unknown;
  observacao?: unknown;
};

/**
 * Le e valida os campos comuns ao cadastro e a correcao. O valor chega como
 * texto do formulario: virgula decimal e ponto de milhar sao do pais.
 */
function lerCampos(corpo: CorpoEmpenho) {
  const numero = String(corpo.numero ?? "").trim();
  if (!numero) return { erro: "Informe o numero da nota de empenho." };

  const bruto = String(corpo.valor ?? "").trim().replace(/\./g, "").replace(",", ".");
  const valor = Number(bruto);
  if (!bruto || !Number.isFinite(valor) || valor <= 0) {
    return { erro: "Informe o valor empenhado, maior que zero." };
  }

  const dataEmissao = corpo.dataEmissao ? String(corpo.dataEmissao).trim() : "";
  if (dataEmissao && !dataBrValida(dataEmissao)) {
    return { erro: `Data de emissao invalida: ${dataEmissao}. Use uma data real, no formato DD/MM/AAAA.` };
  }

  return {
    campos: {
      numero,
      valor,
      dataEmissao: dataEmissao || null,
      observacao: String(corpo.observacao ?? "").trim(),
    },
  };
}

export async function POST(request: Request) {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ error: "Sessao nao encontrada." }, { status: 401 });
  if (modoDemonstracao() || sessao.prefeituraId === null) {
    return NextResponse.json({ error: "Banco de dados nao configurado: nada foi gravado." }, { status: 503 });
  }
  if (!podeRegistrarEmpenho(sessao.papel)) {
    return NextResponse.json({ error: "Registrar a nota de empenho e do Setor de Compras." }, { status: 403 });
  }

  let corpo: CorpoEmpenho;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisicao invalido." }, { status: 400 });
  }

  const contrato = String(corpo.contrato ?? "").trim();
  if (!contrato) return NextResponse.json({ error: "Informe o contrato da despesa empenhada." }, { status: 400 });

  const lido = lerCampos(corpo);
  if (lido.erro || !lido.campos) return NextResponse.json({ error: lido.erro }, { status: 400 });

  try {
    const resultado = await criarEmpenho(sessao.prefeituraId, sessao.id || null, { contrato, ...lido.campos });
    if (resultado.erro === "numero-em-uso") {
      return NextResponse.json(
        { error: `Ja existe uma nota de empenho ${lido.campos.numero} nesta prefeitura.` },
        { status: 409 },
      );
    }
    if (resultado.erro === "contrato-nao-encontrado") {
      return NextResponse.json({ error: `Contrato ${contrato} nao encontrado.` }, { status: 404 });
    }
    if (resultado.erro === "contrato-inativo") {
      const rotulo = contratoStatusLabels[(resultado.status ?? "encerrado") as keyof typeof contratoStatusLabels];
      return NextResponse.json(
        { error: `O contrato ${contrato} esta ${rotulo.toLowerCase()}: so contrato ativo recebe empenho.` },
        { status: 409 },
      );
    }
    return NextResponse.json(await lerEmpenho(sessao.prefeituraId, resultado.id!), { status: 201 });
  } catch (erro) {
    return NextResponse.json({ error: (erro as Error).message }, { status: 500 });
  }
}

/**
 * Corrige o cadastro da nota. O empenho e editavel — numero errado acontece —
 * mas nunca em silencio: sem motivo escrito, a correcao nao passa.
 */
export async function PATCH(request: Request) {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ error: "Sessao nao encontrada." }, { status: 401 });
  if (modoDemonstracao() || sessao.prefeituraId === null) {
    return NextResponse.json({ error: "Banco de dados nao configurado: nada foi gravado." }, { status: 503 });
  }
  if (!podeRegistrarEmpenho(sessao.papel)) {
    return NextResponse.json({ error: "Corrigir a nota de empenho e do Setor de Compras." }, { status: 403 });
  }

  let corpo: CorpoEmpenho & { id?: unknown; motivo?: unknown };
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisicao invalido." }, { status: 400 });
  }

  const id = Number(corpo.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Informe a nota a corrigir." }, { status: 400 });

  const motivo = String(corpo.motivo ?? "").trim();
  if (motivo.length < minimoMotivo) {
    return NextResponse.json(
      { error: `Escreva o motivo em pelo menos ${minimoMotivo} caracteres: corrigir uma nota de empenho exige justificativa.` },
      { status: 400 },
    );
  }

  const lido = lerCampos(corpo);
  if (lido.erro || !lido.campos) return NextResponse.json({ error: lido.erro }, { status: 400 });

  try {
    const resultado = await atualizarEmpenho(sessao.prefeituraId, id, sessao.id || null, lido.campos, motivo);
    if (resultado.erro === "empenho-nao-encontrado") {
      return NextResponse.json({ error: `Nota de empenho ${id} nao encontrada.` }, { status: 404 });
    }
    if (resultado.erro === "numero-em-uso") {
      return NextResponse.json(
        { error: `Ja existe uma nota de empenho ${lido.campos.numero} nesta prefeitura.` },
        { status: 409 },
      );
    }
    if (resultado.erro === "valor-abaixo-do-comprometido") {
      return NextResponse.json(
        {
          error: `A nota ja tem ${resultado.comprometido!.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} comprometidos em pedidos: o valor novo nao pode ficar abaixo disso.`,
        },
        { status: 409 },
      );
    }
    return NextResponse.json(await lerEmpenho(sessao.prefeituraId, id));
  } catch (erro) {
    return NextResponse.json({ error: (erro as Error).message }, { status: 500 });
  }
}
