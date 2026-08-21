import { podeOperarCpl } from "@/lib/auth/papeis";
import { modoDemonstracao, obterSessao } from "@/lib/auth/sessao";
import { processoStatusLabels } from "@/lib/compras";
import { tramiteLabels, type TramiteTipo } from "@/lib/contratos";
import { registrarTramite, tramitesDoProcesso } from "@/lib/repositorio/cpl";
import { NextResponse } from "next/server";

const dataBr = /^\d{2}\/\d{2}\/\d{4}$/;

/** A tramitacao e publica dentro da prefeitura: quem ve o processo, ve por onde ele andou. */
export async function GET(_request: Request, { params }: { params: Promise<{ numero: string }> }) {
  const { numero } = await params;
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ error: "Sessao nao encontrada." }, { status: 401 });
  if (modoDemonstracao() || sessao.prefeituraId === null) return NextResponse.json([]);
  return NextResponse.json(await tramitesDoProcesso(sessao.prefeituraId, numero));
}

/** Registrar tramite e ato da CPL, e e ele que move o processo de fase. */
export async function POST(request: Request, { params }: { params: Promise<{ numero: string }> }) {
  const { numero } = await params;
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ error: "Sessao nao encontrada." }, { status: 401 });
  if (modoDemonstracao() || sessao.prefeituraId === null) {
    return NextResponse.json({ error: "Banco de dados nao configurado: nada foi gravado." }, { status: 503 });
  }
  if (!podeOperarCpl(sessao.papel)) {
    return NextResponse.json({ error: "Somente a CPL registra a tramitacao do processo." }, { status: 403 });
  }

  let corpo: Record<string, unknown>;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisicao invalido." }, { status: 400 });
  }

  const tipo = String(corpo.tipo ?? "") as TramiteTipo;
  if (!(tipo in tramiteLabels)) return NextResponse.json({ error: `Tipo de tramite invalido: ${tipo}.` }, { status: 400 });

  const data = corpo.data ? String(corpo.data).trim() : "";
  if (data && !dataBr.test(data)) {
    return NextResponse.json({ error: "A data do tramite deve estar no formato DD/MM/AAAA." }, { status: 400 });
  }

  const observacao = String(corpo.observacao ?? "").trim();
  // Diligencia e retorno mudam o rumo do processo; sem o motivo escrito o
  // historico nao explica por que o processo voltou.
  if (tipo !== "recebimento" && !observacao) {
    return NextResponse.json({ error: `Descreva o motivo: ${tramiteLabels[tipo].toLowerCase()} exige observacao.` }, { status: 400 });
  }

  try {
    const resultado = await registrarTramite(sessao.prefeituraId, numero, sessao.id || null, {
      tipo,
      data: data || null,
      documento: String(corpo.documento ?? "").trim(),
      observacao,
    });
    if ("erro" in resultado) {
      if (resultado.erro === "processo-nao-encontrado") {
        return NextResponse.json({ error: `Processo ${numero} nao encontrado.` }, { status: 404 });
      }
      return NextResponse.json(
        { error: `"${tramiteLabels[tipo]}" nao cabe num processo em "${processoStatusLabels[resultado.status]}".` },
        { status: 409 },
      );
    }
    return NextResponse.json({ status: resultado.status }, { status: 201 });
  } catch (erro) {
    return NextResponse.json({ error: (erro as Error).message }, { status: 500 });
  }
}
