"use client";

import {
  cotacoesValidas,
  fasesEmOrdem,
  minimoDeCotacoes,
  nomeSecretaria,
  processoStatusLabels,
  statusTone,
  type Processo,
  type ProcessoStatus,
  type SecretariaInfo,
} from "@/lib/compras";
import { ArrowUpRight, CalendarClock, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

/** Itens do lote que ainda nao alcancaram o minimo de precos da IN 65/2021. */
function itensSemPreco(processo: Processo) {
  return processo.itens.filter((item) => cotacoesValidas(item).length < minimoDeCotacoes).length;
}

/**
 * A lista mestra de processos, usada tanto no resumo da central quanto na
 * pagina propria do menu "Processos e lotes".
 */
export function ListaProcessos({
  processos,
  secretarias,
  titulo = "Lista mestra de processos e lotes",
  chapeu = "Acompanhamento",
  comFiltroDeFase = false,
  rodape,
}: {
  processos: Processo[];
  secretarias: SecretariaInfo[];
  titulo?: string;
  chapeu?: string;
  /** Na pagina dedicada da para filtrar por fase; no resumo da central, nao. */
  comFiltroDeFase?: boolean;
  rodape?: React.ReactNode;
}) {
  const [busca, setBusca] = useState("");
  const [fase, setFase] = useState<ProcessoStatus | "todas">("todas");

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return processos.filter((processo) => {
      if (fase !== "todas" && processo.status !== fase) return false;
      if (!termo) return true;
      return [processo.id, processo.objeto, nomeSecretaria(secretarias, processo.secretariaSolicitante), processoStatusLabels[processo.status]]
        .some((campo) => campo.toLowerCase().includes(termo));
    });
  }, [busca, fase, processos, secretarias]);

  const semResultado = fase !== "todas" || busca.trim();

  return (
    <section className="daddus-table-card" id="processos">
      <div className="daddus-card-heading">
        <div>
          <span className="daddus-overline">{chapeu}</span>
          <h3>{titulo}</h3>
        </div>
        <div className="daddus-heading-actions">
          {comFiltroDeFase && (
            <label className="daddus-metodo">
              Fase
              <select value={fase} onChange={(evento) => setFase(evento.target.value as ProcessoStatus | "todas")}>
                <option value="todas">Todas</option>
                {fasesEmOrdem.map((opcao) => (
                  <option key={opcao} value={opcao}>{processoStatusLabels[opcao]}</option>
                ))}
              </select>
            </label>
          )}
          <div className="daddus-search">
            <Search size={15} />
            <input value={busca} onChange={(evento) => setBusca(evento.target.value)} placeholder="Buscar processo ou objeto" aria-label="Buscar processo ou objeto" />
          </div>
        </div>
      </div>
      <div className="daddus-table-wrap">
        <table className="daddus-table">
          <thead>
            <tr><th>Nº Processo</th><th>Objeto</th><th>Prazo limite</th><th>Status</th><th>Cotacoes</th><th>Acoes</th></tr>
          </thead>
          <tbody>
            {filtrados.map((processo) => (
              <tr key={processo.id}>
                <td><strong>PE {processo.id}</strong><small>{nomeSecretaria(secretarias, processo.secretariaSolicitante)}</small></td>
                <td>{processo.objeto}</td>
                <td><span className="deadline"><CalendarClock size={14} /> {processo.prazoLimite}</span></td>
                <td><span className={`daddus-status ${statusTone(processo.status)}`}>{processoStatusLabels[processo.status]}</span></td>
                <td>
                  {itensSemPreco(processo) > 0 ? (
                    <Link href={`/painel/compras/processo/${processo.id}`} className="daddus-row-action pendente">
                      {itensSemPreco(processo)} {itensSemPreco(processo) === 1 ? "item sem preco" : "itens sem preco"}
                    </Link>
                  ) : (
                    <span className="daddus-status gray">{processo.itens.length ? "precos completos" : "lote vazio"}</span>
                  )}
                </td>
                <td><Link href={`/painel/compras/processo/${processo.id}`} className="daddus-row-action">Abrir <ArrowUpRight size={14} /></Link></td>
              </tr>
            ))}
            {!filtrados.length && (
              <tr>
                <td colSpan={6} className="daddus-empty">
                  {processos.length
                    ? semResultado
                      ? "Nenhum processo encontrado para esse filtro."
                      : "Nenhum processo cadastrado."
                    : "Nenhum processo cadastrado."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {rodape}
    </section>
  );
}
