"use client";

import { AppShell } from "@/components/compras/AppShell";
import { NovoPedido } from "@/components/compras/NovoPedido";
import { podeAbrirPedido, podeDecidirPedido } from "@/lib/auth/papeis";
import type { Sessao } from "@/lib/auth/sessao";
import { money, type SecretariaInfo } from "@/lib/compras";
import type { Contrato } from "@/lib/contratos";
import {
  acoesDoPedido,
  acoesPossiveis,
  pedidoStatusEmOrdem,
  pedidoStatusLabels,
  pedidoTone,
  valorDoPedido,
  type AcaoPedido,
  type Pedido,
  type PedidoStatus,
} from "@/lib/pedidos";
import { AlertTriangle, CalendarClock, ChevronDown, ChevronRight, ClipboardCheck, Hourglass, PackageCheck, Plus, Search, Wallet } from "lucide-react";
import { useMemo, useState } from "react";

/**
 * A fila de pedidos de fornecimento. Para o Setor de Compras e uma caixa de
 * entrada: cada pendente e um saldo que ainda nao caiu. Para a secretaria e o
 * acompanhamento do que ela pediu — e so do que ela pediu, porque o recorte vem
 * do servidor.
 */
export function PaginaPedidos({
  pedidos,
  contratos,
  secretarias,
  sessao,
}: {
  pedidos: Pedido[];
  contratos: Contrato[];
  secretarias: SecretariaInfo[];
  sessao: Sessao;
}) {
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState<PedidoStatus | "todas">("todas");
  const [abrindo, setAbrindo] = useState(false);
  const [aberto, setAberto] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [erro, setErro] = useState("");

  const decide = podeDecidirPedido(sessao.papel);
  const podeAbrir = podeAbrirPedido(sessao.papel) && !sessao.demonstracao;

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return pedidos.filter((pedido) => {
      if (situacao !== "todas" && pedido.status !== situacao) return false;
      if (!termo) return true;
      return [pedido.numero, pedido.contrato, pedido.fornecedor, pedido.secretariaNome, pedido.justificativa]
        .some((campo) => (campo ?? "").toLowerCase().includes(termo));
    });
  }, [busca, pedidos, situacao]);

  const pendentes = pedidos.filter((pedido) => pedido.status === "pendente");
  const autorizados = pedidos.filter((pedido) => pedido.status === "autorizado");
  const valorAutorizado = autorizados.reduce((total, pedido) => total + valorDoPedido(pedido), 0);
  const valorEmAnalise = pendentes.reduce((total, pedido) => total + valorDoPedido(pedido), 0);

  const decidir = async (pedido: Pedido, acao: AcaoPedido) => {
    const regra = acoesDoPedido[acao];
    let motivo = "";
    if (regra.exigeMotivo) {
      motivo = window.prompt(`${regra.label} o pedido ${pedido.numero}.\n\nEscreva o motivo (minimo 10 caracteres):`) ?? "";
      if (!motivo.trim()) return;
    } else if (acao === "cancelar") {
      if (!window.confirm(`Cancelar o pedido ${pedido.numero}? Ele nao sera mais analisado.`)) return;
    }

    // O empenho e opcional: nem toda prefeitura empenha no mesmo momento em que
    // libera o fornecimento, e obrigar aqui travaria a autorizacao.
    let empenho = "";
    if (acao === "autorizar") {
      empenho = window.prompt(`Autorizar o pedido ${pedido.numero}.\n\nNumero do empenho (opcional):`, pedido.empenho) ?? "";
    }

    setOcupado(pedido.id);
    setErro("");
    try {
      const resposta = await fetch(`/api/pedidos/${pedido.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao, motivo, empenho }),
      });
      const corpo = (await resposta.json().catch(() => ({}))) as { error?: string };
      if (!resposta.ok) {
        setErro(corpo.error || `A API respondeu ${resposta.status}.`);
        return;
      }
      window.location.reload();
    } catch {
      setErro("Falha de conexao com o servidor.");
    } finally {
      setOcupado(null);
    }
  };

  return (
    <AppShell sessao={sessao} titulo="Pedidos de fornecimento">
      <div className="daddus-page-heading daddus-page-heading-actions">
        <div>
          <span className="daddus-overline">Execucao do contrato</span>
          <h2>Pedidos de fornecimento</h2>
          <p>
            {sessao.papel === "secretario"
              ? "O que a sua secretaria pediu dentro dos contratos da prefeitura."
              : "Cada pedido autorizado baixa o saldo do contrato. Recusa e estorno exigem motivo."}
          </p>
        </div>
        {podeAbrir && (
          <div className="daddus-heading-actions">
            <button type="button" className="daddus-primary-button" onClick={() => setAbrindo(true)}>
              <Plus size={16} /> Novo pedido
            </button>
          </div>
        )}
      </div>

      {erro && <div className="daddus-inline-warning"><AlertTriangle size={16} /> {erro}</div>}

      {decide && pendentes.length > 0 && (
        <div className="daddus-notice">
          <Hourglass size={19} />
          <div>
            <strong>{pendentes.length} {pendentes.length === 1 ? "pedido aguardando" : "pedidos aguardando"} autorizacao</strong>
            <span>{money(valorEmAnalise)} em analise — o saldo do contrato so cai quando voce autoriza.</span>
          </div>
        </div>
      )}

      <section className="daddus-metric-grid">
        <Metric icon={<Hourglass />} label="Aguardando autorizacao" value={String(pendentes.length).padStart(2, "0")}
                note={money(valorEmAnalise)} tone={pendentes.length ? "warning" : ""} />
        <Metric icon={<PackageCheck />} label="Autorizados" value={String(autorizados.length).padStart(2, "0")} note="Consumindo saldo" />
        <Metric icon={<Wallet />} label="Valor autorizado" value={money(valorAutorizado)} note="Somatorio dos pedidos vivos" />
        <Metric icon={<ClipboardCheck />} label="Pedidos no total" value={String(pedidos.length).padStart(2, "0")} note="Todas as situacoes" />
      </section>

      <section className="daddus-table-card">
        <div className="daddus-card-heading">
          <div>
            <span className="daddus-overline">Acompanhamento</span>
            <h3>{sessao.papel === "secretario" ? "Pedidos da minha secretaria" : "Pedidos da prefeitura"}</h3>
          </div>
          <div className="daddus-heading-actions">
            <label className="daddus-metodo">
              Situacao
              <select value={situacao} onChange={(evento) => setSituacao(evento.target.value as PedidoStatus | "todas")}>
                <option value="todas">Todas</option>
                {pedidoStatusEmOrdem.map((opcao) => (
                  <option key={opcao} value={opcao}>{pedidoStatusLabels[opcao]}</option>
                ))}
              </select>
            </label>
            <div className="daddus-search">
              <Search size={15} />
              <input value={busca} onChange={(evento) => setBusca(evento.target.value)}
                     placeholder="Buscar pedido, contrato ou secretaria" aria-label="Buscar pedido, contrato ou secretaria" />
            </div>
          </div>
        </div>

        <div className="daddus-table-wrap">
          <table className="daddus-table">
            <thead>
              <tr><th /><th>Pedido</th><th>Contrato</th><th>Secretaria</th><th>Itens</th><th>Entrega</th><th>Situacao</th><th /></tr>
            </thead>
            <tbody>
              {filtrados.map((pedido) => {
                const expandido = aberto === pedido.id;
                const acoes = acoesPossiveis(pedido.status).filter((acao) =>
                  acao === "cancelar" ? decide || sessao.papel === "secretario" : decide,
                );
                return (
                  <Fragmento key={pedido.id}>
                    <tr className={expandido ? "daddus-linha-ativa" : ""}>
                      <td>
                        <button type="button" className="table-icon-button" aria-label={`Detalhar pedido ${pedido.numero}`}
                                onClick={() => setAberto(expandido ? null : pedido.id)}>
                          {expandido ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                        </button>
                      </td>
                      <td><strong>{pedido.numero}</strong><small>{pedido.criadoEm} · {pedido.solicitante ?? "sem autor"}</small></td>
                      <td><strong>{pedido.contrato}</strong><small>{pedido.fornecedor}</small></td>
                      <td>{pedido.secretariaNome}</td>
                      <td>
                        {pedido.itens.length} {pedido.itens.length === 1 ? "item" : "itens"}
                        <small>{money(valorDoPedido(pedido))}</small>
                      </td>
                      <td>
                        <span className="deadline"><CalendarClock size={14} /> {pedido.entregaPrevista ?? "-"}</span>
                        {pedido.empenho && <small>empenho {pedido.empenho}</small>}
                      </td>
                      <td><span className={`daddus-status ${pedidoTone(pedido.status)}`}>{pedidoStatusLabels[pedido.status]}</span></td>
                      <td>
                        <div className="daddus-linha-acoes">
                          {acoes.map((acao) => (
                            <button key={acao} type="button" className="daddus-row-action" disabled={ocupado === pedido.id || sessao.demonstracao}
                                    onClick={() => decidir(pedido, acao)}>
                              {acoesDoPedido[acao].label}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                    {expandido && (
                      <tr>
                        <td colSpan={8}>
                          <div className="daddus-pedido-detalhe">
                            <p><strong>Justificativa</strong> {pedido.justificativa || "-"}</p>
                            {pedido.motivoDecisao && (
                              <p><strong>Motivo da decisao</strong> {pedido.motivoDecisao}</p>
                            )}
                            {pedido.decididoEm && (
                              <p className="daddus-muted">
                                {pedidoStatusLabels[pedido.status]} por {pedido.decisor ?? "-"} em {pedido.decididoEm}.
                              </p>
                            )}
                            <table className="daddus-table">
                              <thead>
                                <tr><th>Item</th><th>Descricao</th><th>Un.</th><th>Quantidade</th><th>Valor un.</th><th>Total</th></tr>
                              </thead>
                              <tbody>
                                {pedido.itens.map((item) => (
                                  <tr key={item.id}>
                                    <td className="item-number">{item.item}</td>
                                    <td>{item.descricao}</td>
                                    <td>{item.unidade}</td>
                                    <td>{item.quantidade.toLocaleString("pt-BR")}</td>
                                    <td>{money(item.valorUnitario)}</td>
                                    <td className="calculated total">{money(item.quantidade * item.valorUnitario)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragmento>
                );
              })}
              {!filtrados.length && (
                <tr>
                  <td colSpan={8} className="daddus-empty">
                    {pedidos.length ? "Nenhum pedido com esse filtro." : "Nenhum pedido de fornecimento registrado ainda."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {abrindo && (
        <NovoPedido contratos={contratos} secretarias={secretarias} sessao={sessao} aoFechar={() => setAbrindo(false)} />
      )}
    </AppShell>
  );
}

/** Duas linhas por pedido (a da tabela e a do detalhe) precisam de um pai so. */
function Fragmento({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
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
