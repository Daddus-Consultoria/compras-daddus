"use client";

import { AgendaPessoal } from "@/components/compras/AgendaPessoal";
import { AppShell } from "@/components/compras/AppShell";
import { ListaProcessos } from "@/components/compras/ListaProcessos";
import { NovoProcesso } from "@/components/compras/NovoProcesso";
import { podeAbrirSolicitacao, podeEditarTodasAsColunas } from "@/lib/auth/papeis";
import type { Sessao } from "@/lib/auth/sessao";
import { loteTotal, money, type Processo, type SecretariaInfo } from "@/lib/compras";
import { ArrowUpRight, BellRing, CheckCircle2, ClipboardList, FileText, Plus, Timer } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

/** "28/08/2026" -> data comparavel, sem depender do fuso do navegador. */
function parseDataBr(valor: string) {
  const [dia, mes, ano] = valor.split("/").map(Number);
  if (!ano) return Number.POSITIVE_INFINITY;
  return new Date(ano, (mes || 1) - 1, dia || 1).getTime();
}

export function CentralCompras({ processos, sessao, secretarias }: { processos: Processo[]; sessao: Sessao; secretarias: SecretariaInfo[] }) {
  const [solicitacoes, setSolicitacoes] = useState<unknown[]>([]);
  const [abrindoProcesso, setAbrindoProcesso] = useState(false);

  useEffect(() => {
    fetch("/api/solicitacoes", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then((dados) => setSolicitacoes(Array.isArray(dados) ? dados : []))
      .catch(() => setSolicitacoes([]));
  }, []);

  const emCotacao = processos.filter((processo) => processo.status === "em_cotacao").length;
  const valorEstimado = processos.reduce((total, processo) => total + loteTotal(processo.itens, processo.metodoPreco), 0);
  const proximoPrazo = [...processos].sort((a, b) => parseDataBr(a.prazoLimite) - parseDataBr(b.prazoLimite))[0];

  return (
    <AppShell sessao={sessao} titulo="Central de compras">
      <div className="daddus-page-heading daddus-page-heading-actions">
        <div>
          <span className="daddus-overline">Operacao municipal</span>
          <h2>Central do Setor de Compras</h2>
          <p>Monitore solicitacoes, processos e prazos da prefeitura.</p>
        </div>
        <div className="daddus-heading-actions">
          {podeAbrirSolicitacao(sessao.papel) && (
            <Link href="/painel/secretario/solicitacoes" className="daddus-secondary-button"><Plus size={16} /> Nova solicitacao</Link>
          )}
          {podeEditarTodasAsColunas(sessao.papel) && (
            <button type="button" className="daddus-primary-button" onClick={() => setAbrindoProcesso(true)}>
              <Plus size={16} /> Abrir processo
            </button>
          )}
        </div>
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
        <ListaProcessos
          processos={processos}
          secretarias={secretarias}
          rodape={
            <Link href="/painel/compras/processos" className="daddus-card-rodape">
              Ver todos os processos e lotes <ArrowUpRight size={14} />
            </Link>
          }
        />

        <AgendaPessoal processos={processos} />

      </div>

      {abrindoProcesso && <NovoProcesso secretarias={secretarias} aoFechar={() => setAbrindoProcesso(false)} />}
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
