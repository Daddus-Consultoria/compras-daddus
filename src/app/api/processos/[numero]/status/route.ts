import { podeEditarTodasAsColunas, podeOperarCpl } from "@/lib/auth/papeis";
import { modoDemonstracao, obterSessao } from "@/lib/auth/sessao";
import { metodoLabels, money, podeMoverParaFase, processoStatusLabels, situacaoDoLancamento, transicoesDeStatus, type MetodoPreco, type ProcessoStatus } from "@/lib/compras";
import { alterarStatus, definirMetodo, lerProcesso } from "@/lib/repositorio/processos";
import { listarSecretarias } from "@/lib/repositorio/secretarias";
import { NextResponse } from "next/server";

/**
 * Muda a fase do processo e/ou o metodo de calculo do preco de referencia.
 * As transicoes validas estao em transicoesDeStatus: nao da para pular etapas.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ numero: string }> }) {
  const { numero } = await params;
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ error: "Sessao nao encontrada." }, { status: 401 });
  if (modoDemonstracao() || sessao.prefeituraId === null) {
    return NextResponse.json({ error: "Banco de dados nao configurado: nada foi gravado." }, { status: 503 });
  }
  // As fases da comissao ficam de fora daqui: quem as move e o registro de
  // tramite da CPL, nao uma escolha de fase na tela de compras.
  if (!podeEditarTodasAsColunas(sessao.papel) && !podeOperarCpl(sessao.papel)) {
    return NextResponse.json({ error: "Somente o Setor de Compras conduz o andamento do processo." }, { status: 403 });
  }

  let corpo: Record<string, unknown>;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisicao invalido." }, { status: 400 });
  }

  const processo = await lerProcesso(sessao.prefeituraId, numero);
  if (!processo) return NextResponse.json({ error: `Processo ${numero} nao encontrado.` }, { status: 404 });

  try {
    if (corpo.metodo !== undefined) {
      if (!podeEditarTodasAsColunas(sessao.papel)) {
        return NextResponse.json({ error: "O metodo de calculo do preco e definido pelo Setor de Compras." }, { status: 403 });
      }
      const metodo = String(corpo.metodo) as MetodoPreco;
      if (!(metodo in metodoLabels)) return NextResponse.json({ error: `Metodo invalido: ${metodo}.` }, { status: 400 });
      await definirMetodo(sessao.prefeituraId, numero, metodo, String(corpo.justificativaMetodo ?? processo.justificativaMetodo));
    }

    if (corpo.status !== undefined) {
      const novo = String(corpo.status) as ProcessoStatus;
      if (!(novo in processoStatusLabels)) return NextResponse.json({ error: `Fase invalida: ${novo}.` }, { status: 400 });
      if (novo !== processo.status && !transicoesDeStatus[processo.status].includes(novo)) {
        const possiveis = transicoesDeStatus[processo.status].map((fase) => processoStatusLabels[fase]).join(", ");
        return NextResponse.json(
          { error: `De "${processoStatusLabels[processo.status]}" so da para ir para: ${possiveis || "nenhuma fase"}.` },
          { status: 409 },
        );
      }
      if (novo !== processo.status) {
        /**
         * Sair da coleta com secretaria pendente e possivel, mas nao em
         * silencio: quem fica de fora do lote nao aparece depois, e o mapa sai
         * com uma quantidade menor do que a prefeitura precisa. Uma secretaria
         * pode legitimamente nao ter o que pedir — por isso a saida existe, e
         * por isso ela pede o motivo por escrito, que fica no historico da fase.
         */
        if (processo.status === "coleta_quantidades" && novo === "em_cotacao") {
          const situacao = situacaoDoLancamento(processo, await listarSecretarias(sessao.prefeituraId));
          const observacao = String(corpo.observacao ?? "").trim();
          if (situacao.pendentes.length && observacao.length < 10) {
            const nomes = situacao.pendentes.map((secretaria) => secretaria.nome).join(", ");
            return NextResponse.json(
              {
                error: `${situacao.pendentes.length} de ${situacao.total} secretaria(s) ainda nao concluiram o lancamento: ${nomes}. `
                  + "Para seguir assim mesmo, registre o motivo (ao menos 10 caracteres) na observacao da mudanca de fase.",
                pendentes: situacao.pendentes.map((secretaria) => secretaria.nome),
              },
              { status: 422 },
            );
          }
        }
        if (!podeMoverParaFase(sessao.papel, novo)) {
          return NextResponse.json(
            { error: `"${processoStatusLabels[novo]}" e registrada pela CPL, na tramitacao do processo.` },
            { status: 403 },
          );
        }
        const movido = await alterarStatus(sessao.prefeituraId, numero, novo, sessao.id || null, String(corpo.observacao ?? "").trim());
        if ("erro" in movido && movido.erro === "contrato-ativo") {
          return NextResponse.json(
            {
              error: `O contrato ${movido.contrato} ainda esta ativo, com ${money(movido.saldo ?? 0)} de saldo a consumir. `
                + `Encerre o contrato antes de ${novo === "cancelado" ? "cancelar" : "encerrar"} o processo.`,
              contrato: movido.contrato,
            },
            { status: 409 },
          );
        }
        if ("erro" in movido) {
          return NextResponse.json({ error: `Processo ${numero} nao encontrado.` }, { status: 404 });
        }
      }
    }

    return NextResponse.json(await lerProcesso(sessao.prefeituraId, numero));
  } catch (erro) {
    return NextResponse.json({ error: (erro as Error).message }, { status: 500 });
  }
}
