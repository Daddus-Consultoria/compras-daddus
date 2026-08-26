import { podeEditarLote, podeEditarTodasAsColunas } from "@/lib/auth/papeis";
import { modoDemonstracao, obterSessao } from "@/lib/auth/sessao";
import { quantidadesEditaveis, statusDescricoes } from "@/lib/compras";
import { concluirLancamento, lerProcesso, reabrirLancamento } from "@/lib/repositorio/processos";
import { listarSecretarias } from "@/lib/repositorio/secretarias";
import { NextResponse } from "next/server";

/**
 * "Terminei de lancar as quantidades da minha secretaria."
 *
 * Fica numa rota propria, e nao junto do PUT do lote, porque sao duas
 * afirmacoes diferentes: salvar diz "este e o numero por enquanto", concluir
 * diz "este e o numero final". Emendar as duas faria todo salvamento parcial
 * anunciar um fim que nao aconteceu.
 */

/** Quem pode falar pela secretaria: ela mesma, e o Setor de Compras por ela. */
async function contexto(numero: string, chaveInformada: unknown) {
  const sessao = await obterSessao();
  if (!sessao) return { erro: NextResponse.json({ error: "Sessao nao encontrada." }, { status: 401 }) };
  if (modoDemonstracao() || sessao.prefeituraId === null) {
    return { erro: NextResponse.json({ error: "Banco de dados nao configurado: nada foi gravado." }, { status: 503 }) };
  }
  if (!podeEditarLote(sessao.papel)) {
    return { erro: NextResponse.json({ error: "Seu perfil nao registra lancamento de quantidade." }, { status: 403 }) };
  }

  const compras = podeEditarTodasAsColunas(sessao.papel);
  // A secretaria e a da sessao; o Setor de Compras informa de quem esta
  // falando. Aceitar a chave do corpo para quem nao e Compras deixaria uma
  // secretaria concluir o lancamento de outra.
  const chave = compras ? String(chaveInformada ?? "").trim() : sessao.secretariaChave;
  if (!chave) {
    return { erro: NextResponse.json({ error: "Informe a secretaria do lancamento." }, { status: 400 }) };
  }

  const [processo, secretarias] = await Promise.all([
    lerProcesso(sessao.prefeituraId, numero),
    listarSecretarias(sessao.prefeituraId),
  ]);
  if (!processo) return { erro: NextResponse.json({ error: `Processo ${numero} nao encontrado.` }, { status: 404 }) };

  const secretaria = secretarias.find((opcao) => opcao.chave === chave);
  if (!secretaria) {
    return { erro: NextResponse.json({ error: `Secretaria "${chave}" nao existe nesta prefeitura.` }, { status: 404 }) };
  }

  return { sessao, processo, secretaria, compras, prefeituraId: sessao.prefeituraId };
}

export async function POST(request: Request, { params }: { params: Promise<{ numero: string }> }) {
  const { numero } = await params;
  const corpo = await request.json().catch(() => ({}));
  const dados = await contexto(numero, (corpo as { secretaria?: unknown }).secretaria);
  if ("erro" in dados) return dados.erro;
  const { processo, secretaria, prefeituraId, sessao } = dados;

  // Concluir fora da janela de lancamento nao significa nada: a fase seguinte
  // ja nao aceita a quantidade que estaria sendo declarada final.
  if (!quantidadesEditaveis(processo.status)) {
    return NextResponse.json(
      { error: `O processo esta em "${statusDescricoes[processo.status]}" e nao esta mais coletando quantidades.` },
      { status: 409 },
    );
  }
  if (!secretaria.ativa) {
    return NextResponse.json({ error: `A Secretaria de ${secretaria.nome} esta desativada.` }, { status: 409 });
  }

  const gravou = await concluirLancamento(prefeituraId, numero, secretaria.chave, sessao.id || null);
  return NextResponse.json({ ok: true, jaEstava: !gravou });
}

/** Reabre o lancamento para corrigir o que ja foi dado como final. */
export async function DELETE(request: Request, { params }: { params: Promise<{ numero: string }> }) {
  const { numero } = await params;
  const chave = new URL(request.url).searchParams.get("secretaria");
  const dados = await contexto(numero, chave);
  if ("erro" in dados) return dados.erro;
  const { processo, secretaria, prefeituraId } = dados;

  if (!quantidadesEditaveis(processo.status)) {
    return NextResponse.json(
      { error: `O processo esta em "${statusDescricoes[processo.status]}" e a coleta ja foi encerrada.` },
      { status: 409 },
    );
  }

  await reabrirLancamento(prefeituraId, numero, secretaria.chave);
  return NextResponse.json({ ok: true });
}
