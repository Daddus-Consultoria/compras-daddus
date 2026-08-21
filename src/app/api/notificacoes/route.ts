import { modoDemonstracao, obterSessao } from "@/lib/auth/sessao";
import { obterContratos, obterPedidos, obterProcessos, obterSituacaoDosEtps } from "@/lib/dados";
import { montarNotificacoes } from "@/lib/notificacoes";
import { esquecerNotificacoes, lerNotificacoesLidas, marcarNotificacoesLidas } from "@/lib/repositorio/notificacoes";
import { listarSolicitacoes } from "@/lib/repositorio/solicitacoes";
import { listarTarefas } from "@/lib/repositorio/tarefas";
import { NextResponse } from "next/server";

export async function GET() {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ error: "Sessao nao encontrada." }, { status: 401 });

  const semBanco = modoDemonstracao() || !sessao.id || sessao.prefeituraId === null;
  try {
    const [{ processos }, { contratos }, { pedidos }, etps] = await Promise.all([
      obterProcessos(sessao.prefeituraId),
      obterContratos(sessao.prefeituraId),
      // O secretario so e avisado do que a propria secretaria pediu.
      obterPedidos(sessao.prefeituraId, { secretaria: sessao.papel === "secretario" ? sessao.secretariaChave : null }),
      obterSituacaoDosEtps(sessao.prefeituraId),
    ]);
    // Sem banco o sino continua util: mostra os avisos dos dados de exemplo,
    // apenas sem guardar o que ja foi lido.
    const [solicitacoes, tarefas, lidas] = semBanco
      ? [[], [], new Set<string>()]
      : await Promise.all([
          listarSolicitacoes(sessao.prefeituraId!, sessao.papel === "secretario" ? sessao.secretariaId : null),
          listarTarefas(sessao.id),
          lerNotificacoesLidas(sessao.id),
        ]);

    const notificacoes = montarNotificacoes({
      papel: sessao.papel,
      secretaria: sessao.secretariaChave,
      processos,
      solicitacoes,
      tarefas,
      pedidos,
      contratos,
      etps,
      lidas,
    });

    if (!semBanco && lidas.size) {
      // Marcacoes de avisos que sumiram nao servem para mais nada.
      await esquecerNotificacoes(sessao.id, notificacoes.map((aviso) => aviso.chave)).catch(() => {});
    }

    return NextResponse.json({
      notificacoes,
      naoLidas: notificacoes.filter((aviso) => !aviso.lida).length,
      somenteLeitura: semBanco,
    });
  } catch (erro) {
    return NextResponse.json({ error: (erro as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ error: "Sessao nao encontrada." }, { status: 401 });
  if (modoDemonstracao() || !sessao.id) {
    return NextResponse.json({ error: "Banco de dados nao configurado: nada foi gravado." }, { status: 503 });
  }

  let corpo: Record<string, unknown>;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisicao invalido." }, { status: 400 });
  }

  const chaves = Array.isArray(corpo.chaves) ? corpo.chaves.map(String).filter(Boolean) : [];
  if (!chaves.length) return NextResponse.json({ error: "Nenhuma notificacao informada." }, { status: 400 });

  try {
    const marcadas = await marcarNotificacoesLidas(sessao.id, chaves);
    return NextResponse.json({ marcadas });
  } catch (erro) {
    return NextResponse.json({ error: (erro as Error).message }, { status: 500 });
  }
}
