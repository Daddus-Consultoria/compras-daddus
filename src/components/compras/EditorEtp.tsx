"use client";

import { AppShell } from "@/components/compras/AppShell";
import { ExportEtpPDF } from "@/components/compras/ExportEtpPDF";
import { podeEditarEtp } from "@/lib/auth/papeis";
import type { Sessao } from "@/lib/auth/sessao";
import { money, processoStatusLabels, type PrefeituraConfig, type Processo } from "@/lib/compras";
import type { Dfd } from "@/lib/dfd";
import {
  camposDoEtp,
  etpStatusLabels,
  incisos,
  incisosOmitidos,
  type CampoEtp,
  type Etp,
  type InstantaneoEtp,
} from "@/lib/etp";
import { AlertTriangle, ArrowLeft, Check, Lock, RotateCcw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Campos = Record<CampoEtp | "omissoes", string>;

/**
 * O editor do ETP. Cinco incisos o portal responde sozinho — necessidade,
 * quantidades, mercado e valor saem do DFD, do lote e das cotacoes — e por isso
 * aparecem como texto apurado, sem campo. Os demais sao decisao de quem compra.
 *
 * Concluir congela o apurado num instantaneo: dai em diante, editar uma cotacao
 * nao muda mais o estudo assinado.
 */
export function EditorEtp({
  processo,
  etp,
  derivado,
  demanda,
  sugestoesIniciais,
  sessao,
  prefeitura,
}: {
  processo: Processo;
  etp: Etp;
  derivado: InstantaneoEtp;
  demanda: Dfd | null;
  sugestoesIniciais: Partial<Record<CampoEtp, string>>;
  sessao: Sessao;
  prefeitura: PrefeituraConfig;
}) {
  const router = useRouter();
  const concluido = etp.status === "concluido";
  const editavel = podeEditarEtp(sessao.papel) && !sessao.demonstracao && !concluido;

  const [campos, setCampos] = useState<Campos>(() => {
    const inicial = {} as Campos;
    for (const campo of [...camposDoEtp, "omissoes" as const]) inicial[campo] = etp[campo] ?? "";
    return inicial;
  });
  const [sujo, setSujo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [faltas, setFaltas] = useState<string[]>([]);

  const mudar = (campo: keyof Campos, valor: string) => {
    setCampos((atual) => ({ ...atual, [campo]: valor }));
    setSujo(true);
  };

  const salvar = async () => {
    setSalvando(true);
    setErro("");
    setAviso("");
    try {
      const resposta = await fetch(`/api/etp/${encodeURIComponent(processo.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(campos),
      });
      const corpo = (await resposta.json().catch(() => ({}))) as { error?: string };
      if (!resposta.ok) {
        setErro(corpo.error || `A API respondeu ${resposta.status}.`);
        return;
      }
      setSujo(false);
      setAviso("Estudo gravado.");
      router.refresh();
    } catch {
      setErro("Falha de conexao com o servidor.");
    } finally {
      setSalvando(false);
    }
  };

  const decidir = async (acao: "concluir" | "reabrir") => {
    if (acao === "concluir" && sujo) {
      setErro("Grave as alteracoes antes de concluir o estudo.");
      return;
    }
    if (acao === "reabrir" && !window.confirm("Reabrir o estudo descarta o instantaneo assinado e volta ao calculo vivo. Continuar?")) {
      return;
    }
    setSalvando(true);
    setErro("");
    setAviso("");
    setFaltas([]);
    try {
      const resposta = await fetch(`/api/etp/${encodeURIComponent(processo.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao }),
      });
      const corpo = (await resposta.json().catch(() => ({}))) as { error?: string; faltas?: string[] };
      if (!resposta.ok) {
        setErro(corpo.error || `A API respondeu ${resposta.status}.`);
        setFaltas(corpo.faltas ?? []);
        return;
      }
      router.refresh();
    } catch {
      setErro("Falha de conexao com o servidor.");
    } finally {
      setSalvando(false);
    }
  };

  const omitidos = incisosOmitidos({ ...etp, ...campos });
  const paraPdf: Etp = { ...etp, ...campos };

  return (
    <AppShell sessao={sessao} titulo={`ETP · PE ${processo.id}`}>
      <Link href={`/painel/compras/processo/${encodeURIComponent(processo.id)}`} className="daddus-back-link">
        <ArrowLeft size={15} /> Voltar ao processo
      </Link>

      <div className="daddus-page-heading daddus-page-heading-actions">
        <div>
          <span className="daddus-overline">Lei 14.133/2021, art. 18 · IN SEGES/ME 58/2022</span>
          <h2>Estudo Tecnico Preliminar</h2>
          <p>PE {processo.id} · {processo.objeto}</p>
        </div>
        <div className="daddus-heading-actions">
          <ExportEtpPDF processo={processo.id} objeto={processo.objeto} etp={paraPdf} derivado={derivado}
                        demanda={demanda} prefeitura={prefeitura} />
          {podeEditarEtp(sessao.papel) && !sessao.demonstracao && (
            concluido ? (
              <button type="button" className="daddus-secondary-button" onClick={() => decidir("reabrir")} disabled={salvando}>
                <RotateCcw size={15} /> Reabrir estudo
              </button>
            ) : (
              <>
                <button type="button" className="daddus-secondary-button" onClick={() => decidir("concluir")} disabled={salvando}>
                  <Lock size={15} /> Concluir estudo
                </button>
                <button type="button" className="daddus-primary-button" onClick={salvar} disabled={salvando || !sujo}>
                  <Check size={16} /> {salvando ? "Salvando..." : "Salvar"}
                </button>
              </>
            )
          )}
        </div>
      </div>

      <div className="daddus-process-meta">
        <div>
          <span>Situacao do estudo</span>
          <strong className={`daddus-status ${concluido ? "green" : "yellow"}`}>{etpStatusLabels[etp.status]}</strong>
        </div>
        <div><span>Valor estimado</span><strong>{money(derivado.valorTotal)}</strong></div>
        <div>
          <span>Demanda de origem</span>
          <strong>
            {demanda ? <Link href={`/painel/compras/dfd/${encodeURIComponent(demanda.numero)}`}>DFD {demanda.numero}</Link> : "Sem DFD no portal"}
          </strong>
        </div>
        <div>
          <span>{concluido ? "Concluido em" : "Fase do processo"}</span>
          <strong>{concluido ? `${etp.concluidoEm} · ${etp.concluidoPor ?? "-"}` : processoStatusLabels[processo.status]}</strong>
        </div>
      </div>

      {erro && (
        <div className="daddus-inline-warning">
          <AlertTriangle size={16} />
          <span>
            {erro}
            {faltas.length > 0 && (
              <ul className="daddus-faltas">{faltas.map((falta) => <li key={falta}>{falta}</li>)}</ul>
            )}
          </span>
        </div>
      )}
      {aviso && <div className="daddus-inline-success"><Check size={16} /> {aviso}</div>}

      {concluido && (
        <div className="daddus-notice">
          <Lock size={19} />
          <div>
            <strong>Estudo concluido</strong>
            <span>
              Os numeros abaixo sao o instantaneo congelado na conclusao: editar uma cotacao no processo nao muda mais
              este documento. Para alterar o estudo, reabra — e a reabertura descarta o instantaneo.
            </span>
          </div>
        </div>
      )}
      {!concluido && !podeEditarEtp(sessao.papel) && (
        <div className="daddus-notice">
          <div>
            <strong>Somente leitura</strong>
            <span>O estudo e elaborado pelo Setor de Compras. Voce pode acompanhar e baixar o documento.</span>
          </div>
        </div>
      )}

      <div className="daddus-form-card">
        {incisos.map((inciso) => {
          const derivadoTexto = !inciso.campo
            ? inciso.numero === "I" ? derivado.necessidade
              : inciso.numero === "IV" ? derivado.quantidades
              : inciso.numero === "V" ? derivado.mercado
              : derivado.valor
            : null;
          const sugestao = inciso.campo ? sugestoesIniciais[inciso.campo] : undefined;
          return (
            <div className="daddus-form-section" key={inciso.numero}>
              <div>
                <h3>
                  {inciso.numero}. {inciso.titulo}
                  {inciso.obrigatorio && <span className="daddus-obrigatorio"> obrigatorio</span>}
                </h3>
                <p>{inciso.ajuda}</p>
              </div>
              <div className="daddus-form-grid single">
                {derivadoTexto !== null ? (
                  <div className="daddus-derivado">
                    <span className="daddus-overline">Apurado pelo portal</span>
                    <p>{derivadoTexto}</p>
                    {inciso.numero === "IV" && derivado.itens.length > 0 && (
                      <div className="daddus-table-wrap">
                        <table className="daddus-table">
                          <thead><tr><th>Item</th><th>Descricao</th><th>Un.</th><th>Quantidade</th><th>Memoria</th></tr></thead>
                          <tbody>
                            {derivado.itens.map((item) => (
                              <tr key={item.item}>
                                <td className="item-number">{item.item}</td>
                                <td>{item.descricao}</td>
                                <td>{item.unidade}</td>
                                <td>{item.quantidade.toLocaleString("pt-BR")}</td>
                                <td>{item.memoria || "Quantidade consolidada das secretarias."}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {inciso.numero === "VI" && derivado.itens.length > 0 && (
                      <div className="daddus-table-wrap">
                        <table className="daddus-table">
                          <thead><tr><th>Item</th><th>Quantidade</th><th>Cot.</th><th>Preco unitario</th><th>Total</th></tr></thead>
                          <tbody>
                            {derivado.itens.map((item) => (
                              <tr key={item.item}>
                                <td className="item-number">{item.item}</td>
                                <td>{item.quantidade.toLocaleString("pt-BR")}</td>
                                <td>{item.cotacoes}</td>
                                <td>{money(item.valorUnitario)}</td>
                                <td className="calculated total">{money(item.total)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ) : (
                  <label>
                    <textarea
                      value={campos[inciso.campo!]}
                      rows={4}
                      disabled={!editavel}
                      placeholder={sugestao ? `Sugestao: ${sugestao}` : "Descreva neste inciso."}
                      onChange={(evento) => mudar(inciso.campo!, evento.target.value)}
                    />
                    {editavel && sugestao && !campos[inciso.campo!] && (
                      <button type="button" className="daddus-sugestao" onClick={() => mudar(inciso.campo!, sugestao)}>
                        <Sparkles size={13} /> Usar sugestao
                      </button>
                    )}
                  </label>
                )}
              </div>
            </div>
          );
        })}

        {omitidos.length > 0 && (
          <div className="daddus-form-section">
            <div>
              <h3>Justificativa dos incisos nao contemplados<span className="daddus-obrigatorio"> obrigatorio</span></h3>
              <p>
                Art. 18, par. 2: o ETP pode deixar de contemplar os incisos nao obrigatorios, desde que diga por que.
                Em aberto: {omitidos.map((inciso) => inciso.numero).join(", ")}.
              </p>
            </div>
            <div className="daddus-form-grid single">
              <label>
                <textarea value={campos.omissoes} rows={3} disabled={!editavel}
                          placeholder="Ex.: os incisos X e XII nao se aplicam por se tratar de aquisicao de material de consumo, sem instalacao e sem residuo perigoso."
                          onChange={(evento) => mudar("omissoes", evento.target.value)} />
              </label>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
