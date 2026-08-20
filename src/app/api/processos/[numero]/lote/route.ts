import { podeEditarLote, podeEditarTodasAsColunas } from "@/lib/auth/papeis";
import { modoDemonstracao, obterSessao } from "@/lib/auth/sessao";
import type { LoteItem, Secretaria } from "@/lib/compras";
import { listarSecretarias } from "@/lib/repositorio/secretarias";
import { lerProcesso, salvarLote } from "@/lib/repositorio/processos";
import { NextResponse } from "next/server";

const chavesCotacao = ["bnc", "pncp", "mercado"] as const;

function numeroValido(valor: unknown) {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero >= 0;
}

/** Rejeita o lote inteiro quando qualquer item vier malformado, para nao gravar pela metade. */
function validar(corpo: unknown, chaves: string[]) {
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
    for (const chave of chaves) {
      // Secretaria criada depois do lote nao aparece nos itens antigos: falta = zero.
      if (!numeroValido(item.quantidades?.[chave] ?? 0)) return `Quantidade invalida em ${chave}, item ${item.item}.`;
    }
    for (const chave of chavesCotacao) {
      if (!numeroValido(item.cotacoes?.[chave])) return `Cotacao invalida em ${chave}, item ${item.item}.`;
    }
  }
  return null;
}

/**
 * Secretario so pode mexer na quantidade da propria secretaria. Em vez de
 * confiar no que a tela enviou, o lote e remontado a partir do que esta
 * gravado, trocando apenas aquela coluna.
 */
function limitarAoEscopoDoSecretario(gravado: LoteItem[], enviado: LoteItem[], secretaria: Secretaria) {
  const porNumero = new Map(enviado.map((item) => [item.item, item]));
  if (enviado.length !== gravado.length || gravado.some((item) => !porNumero.has(item.item))) {
    return { erro: "Somente o Setor de Compras pode incluir ou remover itens do lote." };
  }
  return {
    itens: gravado.map((item) => ({
      ...item,
      quantidades: { ...item.quantidades, [secretaria]: porNumero.get(item.item)!.quantidades[secretaria] },
    })),
  };
}

export async function PUT(request: Request, { params }: { params: Promise<{ numero: string }> }) {
  const { numero } = await params;
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ error: "Sessao nao encontrada." }, { status: 401 });
  if (modoDemonstracao() || sessao.prefeituraId === null) {
    return NextResponse.json({ error: "Banco de dados nao configurado: o lote nao pode ser gravado." }, { status: 503 });
  }
  if (!podeEditarLote(sessao.papel)) {
    return NextResponse.json({ error: "Seu perfil nao pode editar lotes." }, { status: 403 });
  }

  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisicao invalido." }, { status: 400 });
  }

  const secretarias = await listarSecretarias(sessao.prefeituraId);
  const problema = validar(corpo, secretarias.map((secretaria) => secretaria.chave));
  if (problema) return NextResponse.json({ error: problema }, { status: 400 });

  try {
    let dados = corpo as { notas: string; itens: LoteItem[] };

    if (!podeEditarTodasAsColunas(sessao.papel)) {
      if (!sessao.secretariaChave) {
        return NextResponse.json({ error: "Seu usuario nao esta vinculado a uma secretaria." }, { status: 403 });
      }
      const atual = await lerProcesso(sessao.prefeituraId, numero);
      if (!atual) return NextResponse.json({ error: `Processo ${numero} nao encontrado.` }, { status: 404 });
      const limitado = limitarAoEscopoDoSecretario(atual.itens, dados.itens, sessao.secretariaChave);
      if (limitado.erro) return NextResponse.json({ error: limitado.erro }, { status: 403 });
      // As notas do processo tambem pertencem ao Setor de Compras.
      dados = { notas: atual.notas, itens: limitado.itens! };
    }

    const gravou = await salvarLote(sessao.prefeituraId, numero, dados, sessao.id || null);
    if (!gravou) return NextResponse.json({ error: `Processo ${numero} nao encontrado.` }, { status: 404 });
    return NextResponse.json({ ok: true, itens: dados.itens.length });
  } catch (erro) {
    return NextResponse.json({ error: (erro as Error).message }, { status: 500 });
  }
}
