import { modoDemonstracao, obterSessao } from "@/lib/auth/sessao";
import {
  atualizarTarefa,
  criarTarefa,
  lerNotaAgenda,
  listarTarefas,
  removerTarefa,
  salvarNotaAgenda,
} from "@/lib/repositorio/tarefas";
import { NextResponse } from "next/server";

const dataBr = /^\d{2}\/\d{2}\/\d{4}$/;

/** A agenda e pessoal: nao ha papel que veja ou edite a de outro usuario. */
async function autorizar() {
  const sessao = await obterSessao();
  if (!sessao) return { erro: NextResponse.json({ error: "Sessao nao encontrada." }, { status: 401 }) };
  if (modoDemonstracao() || !sessao.id) {
    return { erro: NextResponse.json({ error: "Banco de dados nao configurado: nada foi gravado." }, { status: 503 }) };
  }
  return { sessao };
}

function validarPrazo(valor: unknown) {
  if (valor === undefined || valor === null || valor === "") return null;
  return dataBr.test(String(valor)) ? null : "O prazo deve estar no formato DD/MM/AAAA.";
}

export async function GET() {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ error: "Sessao nao encontrada." }, { status: 401 });
  if (modoDemonstracao() || !sessao.id) {
    return NextResponse.json({ tarefas: [], nota: "", somenteLeitura: true }, { headers: { "x-origem-dados": "memoria" } });
  }
  try {
    const [tarefas, nota] = await Promise.all([listarTarefas(sessao.id), lerNotaAgenda(sessao.id)]);
    return NextResponse.json({ tarefas, nota, somenteLeitura: false }, { headers: { "x-origem-dados": "postgres" } });
  } catch (erro) {
    return NextResponse.json({ error: (erro as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const autorizacao = await autorizar();
  if (autorizacao.erro) return autorizacao.erro;
  const sessao = autorizacao.sessao!;

  let corpo: Record<string, unknown>;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisicao invalido." }, { status: 400 });
  }

  const descricao = String(corpo.descricao ?? "").trim();
  if (!descricao) return NextResponse.json({ error: "Descreva a tarefa." }, { status: 400 });
  const problema = validarPrazo(corpo.dataPrazo);
  if (problema) return NextResponse.json({ error: problema }, { status: 400 });

  try {
    const tarefa = await criarTarefa({
      usuarioId: sessao.id,
      prefeituraId: sessao.prefeituraId,
      descricao,
      dataPrazo: corpo.dataPrazo ? String(corpo.dataPrazo) : null,
      processo: corpo.processo ? String(corpo.processo) : null,
      comentarios: String(corpo.comentarios ?? "").trim(),
    });
    return NextResponse.json(tarefa, { status: 201 });
  } catch (erro) {
    return NextResponse.json({ error: (erro as Error).message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const autorizacao = await autorizar();
  if (autorizacao.erro) return autorizacao.erro;
  const sessao = autorizacao.sessao!;

  let corpo: Record<string, unknown>;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisicao invalido." }, { status: 400 });
  }

  // Sem id, o PATCH mexe na nota de acompanhamento do usuario.
  if (corpo.id === undefined && corpo.nota !== undefined) {
    try {
      await salvarNotaAgenda(sessao.id, String(corpo.nota));
      return NextResponse.json({ ok: true });
    } catch (erro) {
      return NextResponse.json({ error: (erro as Error).message }, { status: 500 });
    }
  }

  const id = Number(corpo.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Tarefa invalida." }, { status: 400 });
  if (corpo.descricao !== undefined && !String(corpo.descricao).trim()) {
    return NextResponse.json({ error: "Descreva a tarefa." }, { status: 400 });
  }
  const problema = validarPrazo(corpo.dataPrazo);
  if (problema) return NextResponse.json({ error: problema }, { status: 400 });

  try {
    const alterou = await atualizarTarefa(sessao.id, id, {
      descricao: corpo.descricao === undefined ? undefined : String(corpo.descricao).trim(),
      dataPrazo: corpo.dataPrazo === undefined ? undefined : corpo.dataPrazo ? String(corpo.dataPrazo) : null,
      concluida: corpo.concluida === undefined ? undefined : corpo.concluida === true,
      comentarios: corpo.comentarios === undefined ? undefined : String(corpo.comentarios).trim(),
    });
    if (!alterou) return NextResponse.json({ error: "Tarefa nao encontrada." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (erro) {
    return NextResponse.json({ error: (erro as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const autorizacao = await autorizar();
  if (autorizacao.erro) return autorizacao.erro;

  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Tarefa invalida." }, { status: 400 });
  try {
    const removeu = await removerTarefa(autorizacao.sessao!.id, id);
    if (!removeu) return NextResponse.json({ error: "Tarefa nao encontrada." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (erro) {
    return NextResponse.json({ error: (erro as Error).message }, { status: 500 });
  }
}
