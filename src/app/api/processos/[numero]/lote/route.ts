import { podeEditarLote, podeEditarTodasAsColunas } from "@/lib/auth/papeis";
import { modoDemonstracao, obterSessao } from "@/lib/auth/sessao";
import { ajusteDeQuantidadePermitido, ajusteExigeJustificativa, diferencasDeQuantidade, estruturaEditavel, quantidadesEditaveis, statusDescricoes, type LoteItem, type Secretaria } from "@/lib/compras";
import { lerProcesso, salvarLote } from "@/lib/repositorio/processos";
import { listarSecretarias } from "@/lib/repositorio/secretarias";
import { NextResponse } from "next/server";

function numeroValido(valor: unknown) {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero >= 0;
}

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
  }
  return null;
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
    const atual = await lerProcesso(sessao.prefeituraId, numero);
    if (!atual) return NextResponse.json({ error: `Processo ${numero} nao encontrado.` }, { status: 404 });

    const enviado = corpo as { notas: string; itens: LoteItem[] };
    const compras = podeEditarTodasAsColunas(sessao.papel);
    const podeEstrutura = compras && estruturaEditavel(atual.status);
    // Compras tambem corrige quantidade durante a cotacao; secretaria, so ate a coleta.
    const podeQuantidade = compras ? ajusteDeQuantidadePermitido(atual.status) : quantidadesEditaveis(atual.status);

    if (!podeQuantidade && !podeEstrutura) {
      return NextResponse.json(
        { error: `O lote esta na fase "${statusDescricoes[atual.status]}" e nao aceita alteracao de quantidade.` },
        { status: 409 },
      );
    }
    if (!compras && !sessao.secretariaChave) {
      return NextResponse.json({ error: "Seu usuario nao esta vinculado a uma secretaria." }, { status: 403 });
    }

    // As colunas que a pessoa pode mexer nesta fase; as demais vem do que esta gravado.
    const colunasLiberadas: Secretaria[] = !podeQuantidade
      ? []
      : compras
        ? secretarias.map((secretaria) => secretaria.chave)
        : [sessao.secretariaChave as Secretaria];

    const enviadoPorNumero = new Map(enviado.itens.map((item) => [item.item, item]));

    if (!podeEstrutura) {
      const mesmaEstrutura =
        enviado.itens.length === atual.itens.length && atual.itens.every((item) => enviadoPorNumero.has(item.item));
      if (!mesmaEstrutura) {
        return NextResponse.json(
          { error: compras
              ? "Itens so podem ser incluidos ou removidos enquanto o processo esta em elaboracao."
              : "Somente o Setor de Compras pode incluir ou remover itens do lote." },
          { status: 409 },
        );
      }
    }

    const base = podeEstrutura ? enviado.itens : atual.itens;
    const itens = base.map((item) => {
      const referencia = podeEstrutura ? item : (atual.itens.find((linha) => linha.item === item.item) ?? item);
      const recebido = enviadoPorNumero.get(item.item);
      const quantidades = { ...referencia.quantidades };
      for (const chave of colunasLiberadas) {
        if (recebido) quantidades[chave] = Number(recebido.quantidades?.[chave] ?? 0);
      }
      return { ...referencia, quantidades };
    });

    // Quando o Setor de Compras mexe num numero lancado por uma secretaria, o
    // que muda precisa vir com motivo — e fica registrado item a item.
    let ajustes = null;
    if (compras && !podeEstrutura) {
      const mudancas = diferencasDeQuantidade(atual.itens, itens, colunasLiberadas);
      if (mudancas.length) {
        const justificativa = String((corpo as { justificativaQuantidades?: unknown }).justificativaQuantidades ?? "").trim();
        if (ajusteExigeJustificativa(atual.status) && justificativa.length < 10) {
          const resumo = mudancas
            .slice(0, 5)
            .map((mudanca) => `item ${mudanca.item}/${mudanca.secretaria}: ${mudanca.anterior} para ${mudanca.nova}`)
            .join("; ");
          return NextResponse.json(
            {
              error: "Alterar quantidade lancada por uma secretaria exige justificativa de ao menos 10 caracteres.",
              mudancas,
              resumo,
            },
            { status: 422 },
          );
        }
        if (justificativa) ajustes = { justificativa, mudancas };
      }
    }

    // As notas do processo pertencem ao Setor de Compras.
    const notas = compras ? enviado.notas : atual.notas;
    const gravou = await salvarLote(sessao.prefeituraId, numero, { notas, itens }, sessao.id || null, ajustes);
    if (!gravou) return NextResponse.json({ error: `Processo ${numero} nao encontrado.` }, { status: 404 });
    return NextResponse.json({ ok: true, itens: itens.length, ajustes: ajustes?.mudancas.length ?? 0 });
  } catch (erro) {
    return NextResponse.json({ error: (erro as Error).message }, { status: 500 });
  }
}
