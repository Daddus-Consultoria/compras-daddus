import { NextResponse } from "next/server";
import { secretariaKeys, type LoteItem, type Secretaria } from "@/lib/compras";
import { bancoConfigurado } from "@/lib/db";
import { salvarLote } from "@/lib/repositorio/processos";

const chavesCotacao = ["bnc", "pncp", "mercado"] as const;

function numeroValido(valor: unknown) {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero >= 0;
}

/** Rejeita o lote inteiro quando qualquer item vier malformado, para nao gravar pela metade. */
function validar(corpo: unknown) {
  if (typeof corpo !== "object" || corpo === null) return "Corpo da requisicao invalido.";
  const { notas, itens } = corpo as { notas?: unknown; itens?: unknown };
  if (typeof notas !== "string") return "Campo 'notas' deve ser texto.";
  if (!Array.isArray(itens)) return "Campo 'itens' deve ser uma lista.";

  const numeros = new Set<number>();
  for (const bruto of itens) {
    const item = bruto as Partial<LoteItem>;
    if (!Number.isInteger(item.item) || Number(item.item) < 1) return "Cada item precisa de um numero inteiro positivo.";
    if (numeros.has(Number(item.item))) return `Numero de item repetido: ${item.item}.`;
    numeros.add(Number(item.item));
    if (typeof item.especificacao !== "string") return `Especificacao invalida no item ${item.item}.`;
    if (typeof item.unidade !== "string" || !item.unidade.trim()) return `Unidade obrigatoria no item ${item.item}.`;
    for (const chave of secretariaKeys) {
      if (!numeroValido(item.quantidades?.[chave as Secretaria])) return `Quantidade invalida em ${chave}, item ${item.item}.`;
    }
    for (const chave of chavesCotacao) {
      if (!numeroValido(item.cotacoes?.[chave])) return `Cotacao invalida em ${chave}, item ${item.item}.`;
    }
  }
  return null;
}

export async function PUT(request: Request, { params }: { params: Promise<{ numero: string }> }) {
  const { numero } = await params;
  if (!bancoConfigurado()) {
    return NextResponse.json({ error: "Banco de dados nao configurado: o lote nao pode ser gravado." }, { status: 503 });
  }

  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisicao invalido." }, { status: 400 });
  }

  const problema = validar(corpo);
  if (problema) return NextResponse.json({ error: problema }, { status: 400 });

  try {
    const dados = corpo as { notas: string; itens: LoteItem[] };
    const gravou = await salvarLote(numero, dados);
    if (!gravou) return NextResponse.json({ error: `Processo ${numero} nao encontrado.` }, { status: 404 });
    return NextResponse.json({ ok: true, itens: dados.itens.length });
  } catch (erro) {
    return NextResponse.json({ error: (erro as Error).message }, { status: 500 });
  }
}
