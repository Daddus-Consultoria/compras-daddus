"use client";

import { AppShell } from "@/components/compras/AppShell";
import { NovoContrato } from "@/components/compras/NovoContrato";
import { podeGerenciarContratos } from "@/lib/auth/papeis";
import type { Sessao } from "@/lib/auth/sessao";
import { money, type Processo } from "@/lib/compras";
import {
  contratoStatusEmOrdem,
  contratoStatusLabels,
  contratoTone,
  diasParaVencer,
  vigenciaCritica,
  type Contrato,
  type ContratoStatus,
} from "@/lib/contratos";
import { limiteDeAlerta } from "@/lib/pedidos";
import type { ResumoSaldo } from "@/lib/repositorio/pedidos";
import { AlertTriangle, ArrowUpRight, CalendarClock, FileSignature, Plus, Search, Wallet } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

/**
 * Os contratos da prefeitura. O valor de cada linha e sempre a soma dos itens
 * contratados, e a execucao ao lado dele e a soma dos pedidos autorizados: as
 * duas colunas vem da mesma base, entao contrato e saldo nao tem como divergir.
 */
export function PaginaContratos({
  contratos,
  processos,
  saldos,
  sessao,
}: {
  contratos: Contrato[];
  processos: Processo[];
  saldos: ResumoSaldo[];
  sessao: Sessao;
}) {
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState<ContratoStatus | "todas">("todas");
  const [cadastrando, setCadastrando] = useState<{ processo?: string } | null>(null);
  const podeCadastrar = podeGerenciarContratos(sessao.papel);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return contratos.filter((contrato) => {
      if (situacao !== "todas" && contrato.status !== situacao) return false;
      if (!termo) return true;
      return [contrato.numero, contrato.fornecedor, contrato.objeto, contrato.processo ?? ""]
        .some((campo) => campo.toLowerCase().includes(termo));
    });
  }, [busca, contratos, situacao]);

  const execucao = useMemo(() => new Map(saldos.map((resumo) => [resumo.contrato, resumo])), [saldos]);
  const ativos = contratos.filter((contrato) => contrato.status === "ativo");
  const vencendo = contratos.filter(vigenciaCritica);
  const contratado = ativos.reduce((total, contrato) => total + contrato.valorTotal, 0);
  // Processos que a CPL devolveu e ainda nao viraram contrato: e o que o Setor
  // de Compras tem de pendencia real nesta tela.
  const aguardandoCadastro = processos.filter((processo) => processo.status === "contrato_recebido");
  const executado = ativos.reduce((total, contrato) => total + (execucao.get(contrato.numero)?.executado ?? 0), 0);
  // Contrato quase todo consumido e decisao de gestao: aditivo ou novo processo.
  const noLimite = ativos.filter((contrato) => {
    const resumo = execucao.get(contrato.numero);
    return resumo && resumo.contratado > 0 && resumo.executado / resumo.contratado >= limiteDeAlerta;
  });

  return (
    <AppShell sessao={sessao} titulo="Contratos">
      <div className="daddus-page-heading daddus-page-heading-actions">
        <div>
          <span className="daddus-overline">Operacao municipal</span>
          <h2>Contratos</h2>
          <p>
            {contratos.length} {contratos.length === 1 ? "contrato cadastrado" : "contratos cadastrados"} · {ativos.length} em vigencia · valor contratado {money(contratado)}
          </p>
        </div>
        {podeCadastrar && (
          <div className="daddus-heading-actions">
            <button type="button" className="daddus-primary-button" onClick={() => setCadastrando({})}>
              <Plus size={16} /> Cadastrar contrato
            </button>
          </div>
        )}
      </div>

      {podeCadastrar && aguardandoCadastro.length > 0 && (
        <div className="daddus-notice">
          <FileSignature size={19} />
          <div>
            <strong>
              {aguardandoCadastro.length} {aguardandoCadastro.length === 1 ? "contrato devolvido pela CPL" : "contratos devolvidos pela CPL"}
            </strong>
            <span>{aguardandoCadastro.map((processo) => processo.id).join(", ")} — aguardando o cadastro do instrumento.</span>
          </div>
          <button type="button" className="daddus-row-action" onClick={() => setCadastrando({ processo: aguardandoCadastro[0].id })}>
            Cadastrar agora <ArrowUpRight size={15} />
          </button>
        </div>
      )}

      {noLimite.length > 0 && (
        <div className="daddus-notice">
          <AlertTriangle size={19} />
          <div>
            <strong>
              {noLimite.length} {noLimite.length === 1 ? "contrato passou" : "contratos passaram"} de {Math.round(limiteDeAlerta * 100)}% do valor executado
            </strong>
            <span>{noLimite.map((contrato) => contrato.numero).join(", ")} — decida entre aditivo e novo processo antes de faltar saldo.</span>
          </div>
        </div>
      )}

      <section className="daddus-metric-grid">
        <Metric icon={<FileSignature />} label="Contratos ativos" value={String(ativos.length).padStart(2, "0")} note={`${contratos.length} no total`} />
        <Metric icon={<Wallet />} label="Valor contratado" value={money(contratado)} note={`${money(executado)} ja executados`} />
        <Metric icon={<AlertTriangle />} label="Vigencia a vencer" value={String(vencendo.length).padStart(2, "0")} note="Em ate 30 dias" tone={vencendo.length ? "warning" : ""} />
        <Metric icon={<CalendarClock />} label="Aguardando cadastro" value={String(aguardandoCadastro.length).padStart(2, "0")} note="Devolvidos pela CPL" />
      </section>

      <section className="daddus-table-card">
        <div className="daddus-card-heading">
          <div>
            <span className="daddus-overline">Acompanhamento</span>
            <h3>Contratos da prefeitura</h3>
          </div>
          <div className="daddus-heading-actions">
            <label className="daddus-metodo">
              Situacao
              <select value={situacao} onChange={(evento) => setSituacao(evento.target.value as ContratoStatus | "todas")}>
                <option value="todas">Todas</option>
                {contratoStatusEmOrdem.map((opcao) => (
                  <option key={opcao} value={opcao}>{contratoStatusLabels[opcao]}</option>
                ))}
              </select>
            </label>
            <div className="daddus-search">
              <Search size={15} />
              <input
                value={busca}
                onChange={(evento) => setBusca(evento.target.value)}
                placeholder="Buscar contrato, fornecedor ou objeto"
                aria-label="Buscar contrato, fornecedor ou objeto"
              />
            </div>
          </div>
        </div>

        <div className="daddus-table-wrap">
          <table className="daddus-table">
            <thead>
              <tr><th>Contrato</th><th>Fornecedor</th><th>Objeto</th><th>Vigencia</th><th>Valor</th><th>Execucao</th><th>Situacao</th><th></th></tr>
            </thead>
            <tbody>
              {filtrados.map((contrato) => {
                const dias = diasParaVencer(contrato.vigenciaFim);
                const resumo = execucao.get(contrato.numero);
                const consumo = resumo && resumo.contratado > 0 ? resumo.executado / resumo.contratado : 0;
                return (
                  <tr key={contrato.numero}>
                    <td>
                      <strong>{contrato.numero}</strong>
                      <small>{contrato.processo ? `Processo ${contrato.processo}` : "Sem processo no portal"}</small>
                    </td>
                    <td>{contrato.fornecedor}<small>{contrato.cnpjFornecedor || "CNPJ nao informado"}</small></td>
                    <td>{contrato.objeto || "-"}</td>
                    <td>
                      <span className="deadline"><CalendarClock size={14} /> {contrato.vigenciaFim ?? "-"}</span>
                      {dias !== null && contrato.status === "ativo" && (
                        <small>{dias < 0 ? `vencida ha ${Math.abs(dias)} dias` : `${dias} dias restantes`}</small>
                      )}
                    </td>
                    <td>{money(contrato.valorTotal)}<small>{contrato.itens.length} {contrato.itens.length === 1 ? "item" : "itens"}</small></td>
                    <td>
                      {money(resumo?.executado ?? 0)}
                      <small>
                        {`${(consumo * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% · saldo ${money(resumo?.saldo ?? contrato.valorTotal)}`}
                      </small>
                    </td>
                    <td><span className={`daddus-status ${contratoTone(contrato.status)}`}>{contratoStatusLabels[contrato.status]}</span></td>
                    <td>
                      <Link href={`/painel/compras/contrato/${encodeURIComponent(contrato.numero)}`} className="daddus-row-action">
                        Abrir <ArrowUpRight size={14} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {!filtrados.length && (
                <tr>
                  <td colSpan={8} className="daddus-empty">
                    {contratos.length ? "Nenhum contrato encontrado com esse filtro." : "Nenhum contrato cadastrado ainda."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {cadastrando && (
        <NovoContrato processos={processos} processoSugerido={cadastrando.processo} aoFechar={() => setCadastrando(null)} />
      )}
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
