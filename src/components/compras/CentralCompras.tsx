"use client";

import { AppShell } from "@/components/compras/AppShell";
import { podeAbrirSolicitacao } from "@/lib/auth/papeis";
import type { Sessao } from "@/lib/auth/sessao";
import { loadRascunho, loteTotal, money, nomeSecretaria, processoStatusLabels, saveRascunho, statusTone, type Processo, type SecretariaInfo } from "@/lib/compras";
import { ArrowUpRight, BellRing, CalendarClock, CheckCircle2, ClipboardList, FileText, Plus, Search, Timer } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type AgendaRascunho = { nota: string; concluidas: string[] };

const agendaKey = "daddus-compras:agenda";
const tarefas = [
  { id: "cotacoes", title: "Revisar cotacoes do PE 2026-0142", date: "Hoje, 16:00" },
  { id: "fornecedor", title: "Solicitar proposta ao fornecedor", date: "Amanha, 10:30" },
  { id: "termo", title: "Conferir termo de referencia", date: "28 ago" },
];

/** "28/08/2026" -> data comparavel, sem depender do fuso do navegador. */
function parseDataBr(valor: string) {
  const [dia, mes, ano] = valor.split("/").map(Number);
  if (!ano) return Number.POSITIVE_INFINITY;
  return new Date(ano, (mes || 1) - 1, dia || 1).getTime();
}

export function CentralCompras({ processos, sessao, secretarias }: { processos: Processo[]; sessao: Sessao; secretarias: SecretariaInfo[] }) {
  const [busca, setBusca] = useState("");
  const [solicitacoes, setSolicitacoes] = useState<unknown[]>([]);
  const [nota, setNota] = useState("");
  const [concluidas, setConcluidas] = useState<string[]>([]);
  const [notaSalva, setNotaSalva] = useState(false);

  useEffect(() => {
    fetch("/api/solicitacoes", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then((dados) => setSolicitacoes(Array.isArray(dados) ? dados : []))
      .catch(() => setSolicitacoes([]));
  }, []);

  useEffect(() => {
    const rascunho = loadRascunho<AgendaRascunho>(agendaKey);
    if (!rascunho) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage so existe no cliente; ler no efeito evita divergencia de hidratacao
    setNota(rascunho.nota || "");
    setConcluidas(rascunho.concluidas || []);
  }, []);

  useEffect(() => {
    if (!notaSalva) return;
    const timer = setTimeout(() => setNotaSalva(false), 3000);
    return () => clearTimeout(timer);
  }, [notaSalva]);

  const processosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return processos;
    return processos.filter((processo) =>
      [processo.id, processo.objeto, nomeSecretaria(secretarias, processo.secretariaSolicitante), processoStatusLabels[processo.status]]
        .some((campo) => campo.toLowerCase().includes(termo)),
    );
  }, [busca, processos, secretarias]);

  const emCotacao = processos.filter((processo) => processo.status === "em_cotacao").length;
  const valorEstimado = processos.reduce((total, processo) => total + loteTotal(processo.itens, processo.metodoPreco), 0);
  const proximoPrazo = [...processos].sort((a, b) => parseDataBr(a.prazoLimite) - parseDataBr(b.prazoLimite))[0];

  const alternarTarefa = (id: string) => {
    setConcluidas((current) => {
      const proximas = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      saveRascunho<AgendaRascunho>(agendaKey, { nota, concluidas: proximas });
      return proximas;
    });
  };

  const salvarNota = () => {
    setNotaSalva(saveRascunho<AgendaRascunho>(agendaKey, { nota, concluidas }));
  };

  return (
    <AppShell sessao={sessao}>
      <div className="daddus-page-heading daddus-page-heading-actions">
        <div>
          <span className="daddus-overline">Operacao municipal</span>
          <h2>Central do Setor de Compras</h2>
          <p>Monitore solicitacoes, processos e prazos da prefeitura.</p>
        </div>
        {podeAbrirSolicitacao(sessao.papel) && (
          <Link href="/painel/secretario/solicitacoes" className="daddus-primary-button"><Plus size={16} /> Nova solicitacao</Link>
        )}
      </div>

      {solicitacoes.length > 0 && (
        <div className="daddus-notice">
          <BellRing size={19} />
          <div>
            <strong>{solicitacoes.length} {solicitacoes.length === 1 ? "solicitacao de orcamento" : "solicitacoes de orcamento"}</strong>
            <span>Secretarias enviaram pedidos que aguardam analise.</span>
          </div>
          <Link href="/painel/secretario/solicitacoes">Ver solicitacoes <ArrowUpRight size={15} /></Link>
        </div>
      )}

      <section className="daddus-metric-grid">
        <Metric icon={<ClipboardList />} label="Processos ativos" value={String(processos.length).padStart(2, "0")} note={`${emCotacao} em fase de cotacao`} />
        <Metric icon={<Timer />} label="Proximo prazo" value={proximoPrazo?.prazoLimite ?? "-"} note={proximoPrazo ? `PE ${proximoPrazo.id}` : "Nenhum processo aberto"} tone="warning" />
        <Metric icon={<FileText />} label="Solicitacoes recebidas" value={String(solicitacoes.length).padStart(2, "0")} note="Enviadas pelas secretarias" />
        <Metric icon={<CheckCircle2 />} label="Valor estimado" value={money(valorEstimado)} note="Somatorio dos lotes abertos" />
      </section>

      <div className="daddus-content-grid">
        <section className="daddus-table-card" id="processos">
          <div className="daddus-card-heading">
            <div>
              <span className="daddus-overline">Acompanhamento</span>
              <h3>Lista mestra de processos e lotes</h3>
            </div>
            <div className="daddus-search">
              <Search size={15} />
              <input value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Buscar processo ou objeto" aria-label="Buscar processo ou objeto" />
            </div>
          </div>
          <div className="daddus-table-wrap">
            <table className="daddus-table">
              <thead>
                <tr><th>Nº Processo</th><th>Objeto</th><th>Prazo limite</th><th>Status</th><th>Acoes</th></tr>
              </thead>
              <tbody>
                {processosFiltrados.map((processo) => (
                  <tr key={processo.id}>
                    <td><strong>PE {processo.id}</strong><small>{nomeSecretaria(secretarias, processo.secretariaSolicitante)}</small></td>
                    <td>{processo.objeto}</td>
                    <td><span className="deadline"><CalendarClock size={14} /> {processo.prazoLimite}</span></td>
                    <td><span className={`daddus-status ${statusTone(processo.status)}`}>{processoStatusLabels[processo.status]}</span></td>
                    <td><Link href={`/painel/compras/processo/${processo.id}`} className="daddus-row-action">Abrir <ArrowUpRight size={14} /></Link></td>
                  </tr>
                ))}
                {!processosFiltrados.length && (
                  <tr><td colSpan={5} className="daddus-empty">{processos.length ? `Nenhum processo encontrado para “${busca}”.` : "Nenhum processo cadastrado."}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="daddus-task-card">
          <div className="daddus-card-heading">
            <div>
              <span className="daddus-overline">Minha agenda</span>
              <h3>Tarefas pessoais</h3>
            </div>
          </div>
          {tarefas.map((tarefa) => (
            <div className="daddus-task" key={tarefa.id}>
              <input type="checkbox" checked={concluidas.includes(tarefa.id)} onChange={() => alternarTarefa(tarefa.id)} aria-label={tarefa.title} />
              <div>
                <strong>{tarefa.title}</strong>
                <span><CalendarClock size={12} /> {tarefa.date}</span>
              </div>
            </div>
          ))}
          <label className="daddus-notes">
            <span>Comentarios / notas do processo</span>
            <textarea value={nota} onChange={(event) => setNota(event.target.value)} placeholder="Registre um acompanhamento interno..." />
          </label>
          {notaSalva && <span className="daddus-success"><CheckCircle2 size={15} /> Nota salva</span>}
          <button className="daddus-secondary-button" type="button" onClick={salvarNota}>Salvar nota</button>
        </section>
      </div>
    </AppShell>
  );
}

function Metric({ icon, label, value, note, tone = "" }: { icon: React.ReactNode; label: string; value: string; note: string; tone?: string }) {
  return (
    <article className={`daddus-metric ${tone}`}>
      <span className="daddus-metric-icon">{icon}</span>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}
