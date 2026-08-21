"use client";

import { AppShell } from "@/components/compras/AppShell";
import { podeAbrirSolicitacao, podeEditarTodasAsColunas } from "@/lib/auth/papeis";
import type { Sessao } from "@/lib/auth/sessao";
import { nomeCurtoSecretaria, solicitacaoStatusLabels, type Secretaria, type SecretariaInfo, type SolicitacaoStatus } from "@/lib/compras";
import { AlertTriangle, ArrowUpRight, CheckCircle2, Paperclip, Send } from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

type Solicitacao = {
  id: string;
  objeto: string;
  justificativa: string;
  secretaria: Secretaria | null;
  status: SolicitacaoStatus;
  createdAt: string;
};

function formatarData(valor: string) {
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? "-" : data.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function SolicitacoesSecretaria({ sessao, secretarias }: { sessao: Sessao; secretarias: SecretariaInfo[] }) {
  const podeEnviar = podeAbrirSolicitacao(sessao.papel);
  const podeVirarProcesso = podeEditarTodasAsColunas(sessao.papel);
  const secretariaFixa = sessao.papel === "secretario" ? sessao.secretariaChave : null;
  const [enviadas, setEnviadas] = useState<Solicitacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [sucesso, setSucesso] = useState(false);
  const [erro, setErro] = useState("");

  const buscarSolicitacoes = useCallback(async (): Promise<Solicitacao[]> => {
    try {
      const response = await fetch("/api/solicitacoes", { cache: "no-store" });
      if (!response.ok) throw new Error(`A API respondeu ${response.status}.`);
      const dados = await response.json();
      return Array.isArray(dados) ? dados : [];
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    buscarSolicitacoes().then(setEnviadas).finally(() => setCarregando(false));
  }, [buscarSolicitacoes]);

  useEffect(() => {
    if (!sucesso) return;
    const timer = setTimeout(() => setSucesso(false), 4000);
    return () => clearTimeout(timer);
  }, [sucesso]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // O React zera event.currentTarget ao fim do handler: guardar antes do await.
    const form = event.currentTarget;
    const data = new FormData(form);
    setEnviando(true);
    setErro("");
    try {
      const response = await fetch("/api/solicitacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objeto: data.get("objeto"), justificativa: data.get("justificativa"), secretaria: secretariaFixa ?? data.get("secretaria") }),
      });
      if (!response.ok) throw new Error(`A API respondeu ${response.status}.`);
      form.reset();
      setSucesso(true);
      setEnviadas(await buscarSolicitacoes());
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Nao foi possivel enviar a solicitacao.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <AppShell sessao={sessao}>
      <div className="daddus-page-heading">
        <div>
          <span className="daddus-overline">{secretariaFixa ? nomeCurtoSecretaria(secretarias, secretariaFixa) : sessao.prefeituraNome}</span>
          <h2>{podeEnviar ? "Solicitar abertura de compra" : "Solicitacoes recebidas"}</h2>
          <p>{podeEnviar
            ? "Envie ao Setor de Compras as informacoes iniciais para abrir um novo processo."
            : "Acompanhe os pedidos enviados pelas secretarias."}</p>
        </div>
      </div>

      {podeEnviar && (
      <div className="daddus-split-layout">
        <form className="daddus-form-card" onSubmit={submit}>
          <div className="daddus-form-section">
            <div>
              <h3>Nova solicitacao</h3>
              <p>Descreva o que sua secretaria precisa contratar.</p>
            </div>
            <div className="daddus-form-grid single">
              <label>Secretaria
                {secretariaFixa ? (
                  <input name="secretaria" value={nomeCurtoSecretaria(secretarias, secretariaFixa)} readOnly title="Sua secretaria e definida pelo seu usuario" />
                ) : (
                  <select name="secretaria" defaultValue="educacao">
                    {secretarias.filter((secretaria) => secretaria.ativa).map((secretaria) => <option key={secretaria.chave} value={secretaria.chave}>{secretaria.nome}</option>)}
                  </select>
                )}
              </label>
              <label>Objeto da compra
                <textarea name="objeto" rows={3} placeholder="Ex.: Material escolar para o ano letivo de 2026" required />
              </label>
              <label>Justificativa
                <textarea name="justificativa" rows={5} placeholder="Explique a necessidade e o interesse publico da compra." required />
              </label>
              <label className="file-input"><Paperclip size={17} /> Termo de referencia (opcional)
                <input name="termo" type="file" accept=".pdf,.doc,.docx" />
                <small>PDF ou DOCX · ate 10 MB · o anexo passa a ser enviado com a integracao de arquivos</small>
              </label>
            </div>
          </div>
          <div className="daddus-form-actions">
            {erro && <span className="daddus-inline-error"><AlertTriangle size={15} /> {erro}</span>}
            <button className="daddus-primary-button" type="submit" disabled={enviando}>
              <Send size={16} /> {enviando ? "Enviando..." : "Enviar solicitacao"}
            </button>
          </div>
        </form>

        <aside className="daddus-info-card">
          <span className="daddus-info-icon">i</span>
          <h3>Como funciona?</h3>
          <ol>
            <li>Preencha objeto e justificativa.</li>
            <li>Anexe o termo de referencia, se ja estiver pronto.</li>
            <li>O comprador recebe uma notificacao e inicia a cotacao.</li>
          </ol>
        </aside>
      </div>
      )}

      <section className="daddus-table-card">
        <div className="daddus-card-heading">
          <div>
            <span className="daddus-overline">Historico</span>
            <h3>Solicitacoes enviadas</h3>
          </div>
        </div>
        <div className="daddus-table-wrap">
          <table className="daddus-table">
            <thead>
              <tr><th>Enviada em</th><th>Secretaria</th><th>Objeto</th><th>Status</th>{podeVirarProcesso && <th>Acoes</th>}</tr>
            </thead>
            <tbody>
              {enviadas.map((solicitacao) => (
                <tr key={solicitacao.id}>
                  <td>{formatarData(solicitacao.createdAt)}</td>
                  <td>{nomeCurtoSecretaria(secretarias, solicitacao.secretaria)}</td>
                  <td>{solicitacao.objeto}</td>
                  <td><span className="daddus-status gray">{solicitacaoStatusLabels[solicitacao.status] || solicitacao.status}</span></td>
                  {podeVirarProcesso && (
                    <td>
                      {solicitacao.status === "pendente" ? (
                        <Link
                          href={`/painel/compras/processos?solicitacao=${solicitacao.id}&objeto=${encodeURIComponent(solicitacao.objeto)}&secretaria=${encodeURIComponent(solicitacao.secretaria ?? "")}`}
                          className="daddus-row-action"
                        >
                          Gerar processo <ArrowUpRight size={14} />
                        </Link>
                      ) : (
                        <span className="daddus-muted">atendida</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {!enviadas.length && (
                <tr><td colSpan={podeVirarProcesso ? 5 : 4} className="daddus-empty">{carregando ? "Carregando solicitacoes..." : "Nenhuma solicitacao enviada ainda."}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {sucesso && <div className="daddus-toast"><CheckCircle2 size={17} /> Solicitacao enviada ao Setor de Compras.</div>}
    </AppShell>
  );
}
