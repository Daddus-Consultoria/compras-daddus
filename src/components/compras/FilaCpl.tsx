"use client";

import { AppShell } from "@/components/compras/AppShell";
import { TramitesCpl } from "@/components/compras/TramitesCpl";
import type { Sessao } from "@/lib/auth/sessao";
import {
  loteTotal,
  money,
  nomeSecretaria,
  processoStatusLabels,
  statusDescricoes,
  statusTone,
  type Processo,
  type SecretariaInfo,
} from "@/lib/compras";
import { ArrowUpRight, CalendarClock, FileCheck2, Inbox, Stamp } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

/**
 * A mesa da comissao: os processos que sairam do Setor de Compras e ainda nao
 * viraram contrato cadastrado. Cada linha abre a tramitacao do processo, que e
 * onde a CPL registra o que fez — e o registro e que move a fase.
 */
export function FilaCpl({ processos, sessao, secretarias }: { processos: Processo[]; sessao: Sessao; secretarias: SecretariaInfo[] }) {
  const [aberto, setAberto] = useState<string | null>(processos[0]?.id ?? null);

  const aguardando = processos.filter((processo) => processo.status === "enviado_licitacao");
  const emAndamento = processos.filter((processo) => processo.status === "em_cpl");
  const devolvidos = processos.filter((processo) => processo.status === "contrato_recebido");
  const valor = processos.reduce((total, processo) => total + loteTotal(processo.itens, processo.metodoPreco), 0);
  const selecionado = processos.find((processo) => processo.id === aberto) ?? null;

  return (
    <AppShell sessao={sessao} titulo="Comissao Permanente de Licitacao">
      <div className="daddus-page-heading">
        <span className="daddus-overline">Operacao municipal</span>
        <h2>Mesa da CPL</h2>
        <p>
          {processos.length} {processos.length === 1 ? "processo na comissao" : "processos na comissao"} · valor de referencia {money(valor)}
        </p>
      </div>

      <section className="daddus-metric-grid">
        <Metric icon={<Inbox />} label="Aguardando recebimento" value={aguardando.length} note="Mapa enviado pelo Setor de Compras" tone={aguardando.length ? "warning" : ""} />
        <Metric icon={<Stamp />} label="Em processamento" value={emAndamento.length} note="Sob conducao da comissao" />
        <Metric icon={<FileCheck2 />} label="Devolvidos" value={devolvidos.length} note="Aguardando o cadastro do contrato" />
        <Metric icon={<CalendarClock />} label="Processos na mesa" value={processos.length} note="Total sob responsabilidade da CPL" />
      </section>

      <section className="daddus-table-card">
        <div className="daddus-card-heading">
          <div>
            <span className="daddus-overline">Fila</span>
            <h3>Processos na comissao</h3>
          </div>
        </div>
        <div className="daddus-table-wrap">
          <table className="daddus-table">
            <thead>
              <tr><th>Processo</th><th>Objeto</th><th>Secretaria</th><th>Prazo</th><th>Valor de referencia</th><th>Fase</th><th></th></tr>
            </thead>
            <tbody>
              {processos.map((processo) => (
                <tr key={processo.id} className={processo.id === aberto ? "daddus-linha-ativa" : ""}>
                  <td><strong>{processo.id}</strong><small>{processo.itens.length} {processo.itens.length === 1 ? "item" : "itens"}</small></td>
                  <td>{processo.objeto}</td>
                  <td>{nomeSecretaria(secretarias, processo.secretariaSolicitante)}</td>
                  <td><span className="deadline"><CalendarClock size={14} /> {processo.prazoLimite}</span></td>
                  <td>{money(loteTotal(processo.itens, processo.metodoPreco))}</td>
                  <td><span className={`daddus-status ${statusTone(processo.status)}`}>{processoStatusLabels[processo.status]}</span></td>
                  <td>
                    <button type="button" className="daddus-row-action" onClick={() => setAberto(processo.id === aberto ? null : processo.id)}>
                      {processo.id === aberto ? "Fechar" : "Tramitar"} <Stamp size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {!processos.length && (
                <tr><td colSpan={7} className="daddus-empty">Nenhum processo aguardando a comissao.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selecionado && (
        <>
          <div className="daddus-notice">
            <Stamp size={19} />
            <div>
              <strong>{selecionado.id} · {processoStatusLabels[selecionado.status]}</strong>
              <span>{statusDescricoes[selecionado.status]}</span>
            </div>
            <Link href={`/painel/compras/processo/${encodeURIComponent(selecionado.id)}`}>
              Ver o lote e o mapa <ArrowUpRight size={15} />
            </Link>
          </div>
          <TramitesCpl
            key={selecionado.id}
            numero={selecionado.id}
            status={selecionado.status}
            papel={sessao.papel}
            demonstracao={sessao.demonstracao}
          />
        </>
      )}
    </AppShell>
  );
}

function Metric({ icon, label, value, note, tone = "" }: { icon: React.ReactNode; label: string; value: number; note: string; tone?: string }) {
  return (
    <article className={`daddus-metric ${tone}`}>
      <span className="daddus-metric-icon">{icon}</span>
      <span>{label}</span>
      <strong>{String(value).padStart(2, "0")}</strong>
      <small>{note}</small>
    </article>
  );
}
