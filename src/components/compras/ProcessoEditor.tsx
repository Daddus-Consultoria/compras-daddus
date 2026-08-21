"use client";

import { ExportLicitacaoPDF } from "@/components/ExportLicitacaoPDF";
import { AppShell } from "@/components/compras/AppShell";
import { PainelCotacoes } from "@/components/compras/PainelCotacoes";
import { podeEditarLote, podeEditarTodasAsColunas } from "@/lib/auth/papeis";
import type { Sessao } from "@/lib/auth/sessao";
import {
  cotacoesEditaveis,
  cotacoesValidas,
  estruturaEditavel,
  itemPendente,
  itemTotalQuantity,
  loteTotal,
  metodoLabels,
  minimoDeCotacoes,
  money,
  nextItemNumber,
  nomeCurtoSecretaria,
  nomeSecretaria,
  precoUnitario,
  processoStatusLabels,
  quantidadesEditaveis,
  statusDescricoes,
  statusTone,
  toNumericValue,
  transicoesDeStatus,
  type LoteItem,
  type MetodoPreco,
  type PrefeituraConfig,
  type Processo,
  type ProcessoStatus,
  type Secretaria,
  type SecretariaInfo,
} from "@/lib/compras";
import { AlertTriangle, ArrowLeft, Check, ChevronDown, ChevronRight, ExternalLink, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useState } from "react";

export function ProcessoEditor({
  processo,
  prefeitura,
  sessao,
  secretarias,
}: {
  processo: Processo;
  prefeitura: PrefeituraConfig;
  sessao: Sessao;
  secretarias: SecretariaInfo[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<LoteItem[]>(processo.itens);
  const [notes, setNotes] = useState(processo.notas);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [dirty, setDirty] = useState(false);

  const compras = podeEditarTodasAsColunas(sessao.papel);
  const minhaSecretaria: Secretaria | null = compras ? null : sessao.secretariaChave;
  const podeEstrutura = compras && estruturaEditavel(processo.status);
  const podeQuantidade = podeEditarLote(sessao.papel) && quantidadesEditaveis(processo.status);
  const podeCotacao = compras && cotacoesEditaveis(processo.status);
  const metodo = processo.metodoPreco;

  const colunaEditavel = (chave: Secretaria) => {
    const secretaria = secretarias.find((opcao) => opcao.chave === chave);
    if (!podeQuantidade || (secretaria && !secretaria.ativa)) return false;
    return compras || chave === minhaSecretaria;
  };

  useEffect(() => {
    if (!aviso) return;
    const timer = setTimeout(() => setAviso(""), 4000);
    return () => clearTimeout(timer);
  }, [aviso]);

  const patchItem = (id: string, patch: (item: LoteItem) => LoteItem) => {
    setItems((current) => current.map((item) => (item.id === id ? patch(item) : item)));
    setDirty(true);
  };

  const updateText = (id: string, field: "especificacao" | "unidade", value: string) => patchItem(id, (item) => ({ ...item, [field]: value }));
  const updateQuantity = (id: string, secretaria: Secretaria, value: string) =>
    patchItem(id, (item) => ({ ...item, quantidades: { ...item.quantidades, [secretaria]: toNumericValue(value) } }));

  const addItem = () => {
    setItems((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        item: nextItemNumber(current),
        especificacao: "",
        unidade: "UN",
        quantidades: Object.fromEntries(secretarias.map((secretaria) => [secretaria.chave, 0])),
        cotacoes: [],
      },
    ]);
    setDirty(true);
  };

  const removeItem = (id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
    setDirty(true);
  };

  const chamar = async (url: string, opcoes: RequestInit, mensagem: string) => {
    setErro("");
    const resposta = await fetch(url, opcoes);
    const corpo = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      setErro(corpo.error || `A API respondeu ${resposta.status}.`);
      return false;
    }
    setAviso(mensagem);
    router.refresh();
    return true;
  };

  const salvarLote = async () => {
    setSalvando(true);
    const ok = await chamar(
      `/api/processos/${encodeURIComponent(processo.id)}/lote`,
      { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notas: notes, itens: items }) },
      "Lote salvo.",
    );
    if (ok) setDirty(false);
    setSalvando(false);
  };

  /**
   * Cotacao e gravada na hora, mas as quantidades ficam em estado local ate o
   * "Salvar lote". Por isso a sincronizacao troca so as cotacoes de cada item,
   * preservando o que a pessoa digitou e ainda nao salvou.
   */
  const sincronizarCotacoes = async () => {
    const resposta = await fetch(`/api/processos/${encodeURIComponent(processo.id)}`, { cache: "no-store" });
    if (!resposta.ok) return;
    const atualizado: Processo = await resposta.json();
    setItems((current) =>
      current.map((item) => {
        const fresco = atualizado.itens.find((linha) => linha.item === item.item);
        return fresco ? { ...item, cotacoes: fresco.cotacoes } : item;
      }),
    );
  };

  const rotaCotacoes = `/api/processos/${encodeURIComponent(processo.id)}/cotacoes`;
  const criarCotacao = async (dados: Record<string, unknown>) => {
    if (await chamar(rotaCotacoes, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dados) }, "Cotacao lancada.")) await sincronizarCotacoes();
  };
  const alterarCotacao = async (id: number, dados: Record<string, unknown>) => {
    if (await chamar(rotaCotacoes, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...dados }) }, "Cotacao atualizada.")) await sincronizarCotacoes();
  };
  const removerCotacao = async (id: number) => {
    if (await chamar(`${rotaCotacoes}?id=${id}`, { method: "DELETE" }, "Cotacao removida.")) await sincronizarCotacoes();
  };

  const mudarFase = async (novo: ProcessoStatus) => {
    const observacao = window.prompt(`Mover para "${processoStatusLabels[novo]}".\n${statusDescricoes[novo]}\n\nObservacao (opcional):`) ?? "";
    await chamar(
      `/api/processos/${encodeURIComponent(processo.id)}/status`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: novo, observacao }) },
      `Processo movido para ${processoStatusLabels[novo]}.`,
    );
  };

  const mudarMetodo = async (novo: MetodoPreco) => {
    let justificativa = processo.justificativaMetodo;
    if (novo !== "media") {
      justificativa = window.prompt(`Justifique a adocao de "${metodoLabels[novo]}" (art. 6 da IN 65/2021):`, justificativa) ?? "";
      if (!justificativa.trim()) return;
    }
    await chamar(
      `/api/processos/${encodeURIComponent(processo.id)}/status`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ metodo: novo, justificativaMetodo: justificativa }) },
      `Metodo alterado para ${metodoLabels[novo]}.`,
    );
  };

  const pendentes = items.filter(itemPendente).length;
  const total = loteTotal(items, metodo);

  return (
    <AppShell sessao={sessao}>
      <div className="daddus-page-heading daddus-page-heading-actions">
        <div>
          <Link href="/painel/compras" className="daddus-back-link"><ArrowLeft size={15} /> Voltar para processos</Link>
          <span className="daddus-overline">Processo PE {processo.id}</span>
          <h2>Composicao do lote</h2>
          <p>{processo.objeto} · {nomeSecretaria(secretarias, processo.secretariaSolicitante)}</p>
        </div>
        <div className="daddus-heading-actions">
          <ExportLicitacaoPDF items={items} prefeitura={prefeitura} processo={processo} secretarias={secretarias} notas={notes} />
          {(podeQuantidade || podeEstrutura) && (
            <button className="daddus-primary-button" type="button" onClick={salvarLote} disabled={salvando}>
              <Check size={16} /> {salvando ? "Salvando..." : "Salvar lote"}
            </button>
          )}
        </div>
      </div>

      <div className="daddus-process-meta">
        <div>
          <span>Fase</span>
          <strong className={`daddus-status ${statusTone(processo.status)}`}>{processoStatusLabels[processo.status]}</strong>
        </div>
        <div><span>Prazo limite</span><strong>{processo.prazoLimite}</strong></div>
        <div><span>Responsavel</span><strong>{processo.responsavel}</strong></div>
        <div><span>Ultima atualizacao</span><strong>{dirty ? "Alteracoes nao salvas" : processo.atualizadoEm}</strong></div>
      </div>

      <div className="daddus-fase">
        <div>
          <strong>{processoStatusLabels[processo.status]}</strong>
          <span>{statusDescricoes[processo.status]}</span>
        </div>
        {compras && transicoesDeStatus[processo.status].length > 0 && (
          <div className="daddus-linha-acoes">
            {transicoesDeStatus[processo.status].map((fase) => (
              <button key={fase} type="button" className="daddus-secondary-button" onClick={() => mudarFase(fase)}>
                {processoStatusLabels[fase]} <ChevronRight size={14} />
              </button>
            ))}
          </div>
        )}
      </div>

      {erro && <div className="daddus-inline-warning"><AlertTriangle size={16} /> {erro}</div>}
      {aviso && <div className="daddus-inline-success"><Check size={16} /> {aviso}</div>}

      <div className="daddus-editor-toolbar">
        <div>
          <strong>Itens do lote</strong>
          <span>
            {items.length} {items.length === 1 ? "item" : "itens"} · Valor de referencia {money(total)} ({metodoLabels[metodo].toLowerCase()})
          </span>
        </div>
        <div className="daddus-heading-actions">
          {compras && (
            <label className="daddus-metodo">
              Metodo
              <select value={metodo} onChange={(event) => mudarMetodo(event.target.value as MetodoPreco)} disabled={!podeCotacao}>
                {(Object.keys(metodoLabels) as MetodoPreco[]).map((opcao) => (
                  <option key={opcao} value={opcao}>{metodoLabels[opcao]}</option>
                ))}
              </select>
            </label>
          )}
          {podeEstrutura && (
            <button className="daddus-secondary-button" type="button" onClick={addItem}><Plus size={15} /> Adicionar item</button>
          )}
        </div>
      </div>

      {processo.justificativaMetodo && (
        <div className="daddus-inline-warning">
          <AlertTriangle size={16} /> Metodo justificado: {processo.justificativaMetodo}
        </div>
      )}
      {podeCotacao && pendentes > 0 && (
        <div className="daddus-inline-warning">
          <AlertTriangle size={16} /> {pendentes} {pendentes === 1 ? "item tem" : "itens tem"} menos de {minimoDeCotacoes} cotacoes validas.
        </div>
      )}

      <div className="daddus-editor-card">
        <div className="daddus-permission-note">
          <span className="daddus-info-icon">i</span>
          {!podeQuantidade && !podeEstrutura && !podeCotacao ? (
            <span>Este processo esta em <strong>somente leitura</strong> para o seu perfil nesta fase.</span>
          ) : compras ? (
            <span>Voce conduz o processo como <strong>Setor de Compras</strong>. Nesta fase da para editar {[
              podeEstrutura && "os itens", podeQuantidade && "as quantidades", podeCotacao && "as cotacoes",
            ].filter(Boolean).join(", ")}.</span>
          ) : (
            <span>Voce lanca as quantidades da <strong>Secretaria de {nomeCurtoSecretaria(secretarias, minhaSecretaria)}</strong>. As demais colunas e as cotacoes ficam bloqueadas.</span>
          )}
          <ChevronDown size={15} />
        </div>
        <div className="daddus-table-wrap">
          <table className="daddus-table lot-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Especificacao detalhada</th>
                <th>Un.</th>
                {secretarias.map((secretaria) => (
                  <th key={secretaria.chave} title={secretaria.ativa ? undefined : "Secretaria desativada"}>
                    {secretaria.nome}{secretaria.ativa ? "" : " *"}
                  </th>
                ))}
                <th>Qtd. total</th>
                <th>Cotacoes</th>
                <th>Preco unitario</th>
                <th>Valor total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const unitario = precoUnitario(item, metodo);
                const validas = cotacoesValidas(item).length;
                const aberto = expandido === item.id;
                return (
                  <Fragment key={item.id}>
                    <tr className={aberto ? "expandida" : ""}>
                      <td className="item-number">{item.item}</td>
                      <td>
                        <textarea className="cell-textarea" value={item.especificacao} placeholder="Descreva o item"
                                  disabled={!podeEstrutura} onChange={(event) => updateText(item.id, "especificacao", event.target.value)} />
                      </td>
                      <td>
                        <input className="cell-input unit" value={item.unidade} disabled={!podeEstrutura}
                               onChange={(event) => updateText(item.id, "unidade", event.target.value)} />
                      </td>
                      {secretarias.map((secretaria) => (
                        <td key={secretaria.chave}>
                          <input
                            className="cell-input quantity"
                            type="number"
                            min="0"
                            value={item.quantidades[secretaria.chave] || ""}
                            disabled={!colunaEditavel(secretaria.chave)}
                            onChange={(event) => updateQuantity(item.id, secretaria.chave, event.target.value)}
                            title={colunaEditavel(secretaria.chave) ? undefined : `Somente a Secretaria de ${secretaria.nome} pode editar nesta fase`}
                          />
                        </td>
                      ))}
                      <td className="calculated">{itemTotalQuantity(item)}</td>
                      <td>
                        <button type="button" className={`daddus-row-action ${validas < minimoDeCotacoes ? "pendente" : ""}`}
                                onClick={() => setExpandido(aberto ? null : item.id)}>
                          {aberto ? <ChevronDown size={13} /> : <ChevronRight size={13} />} {validas} de {minimoDeCotacoes}
                        </button>
                      </td>
                      <td className="calculated">{money(unitario)}</td>
                      <td className="calculated total">{money(unitario * itemTotalQuantity(item))}</td>
                      <td>
                        {podeEstrutura && (
                          <button type="button" className="table-icon-button" aria-label={`Remover item ${item.item}`} onClick={() => removeItem(item.id)}>
                            <Trash2 size={15} />
                          </button>
                        )}
                      </td>
                    </tr>
                    {aberto && (
                      <tr className="linha-cotacoes">
                        <td colSpan={secretarias.length + 8}>
                          <PainelCotacoes item={item} editavel={podeCotacao} aoCriar={criarCotacao} aoAlterar={alterarCotacao} aoRemover={removerCotacao} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {items.length === 0 && (
                <tr><td colSpan={secretarias.length + 8} className="daddus-empty">Nenhum item no lote. Use &ldquo;Adicionar item&rdquo; para comecar.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="daddus-process-bottom">
        <label className="daddus-notes">
          <span>Comentarios / notas do processo</span>
          <textarea value={notes} disabled={!compras} onChange={(event) => { setNotes(event.target.value); setDirty(true); }}
                    placeholder="Registre premissas, contatos com fornecedores ou observacoes internas..." />
        </label>
        <div className="daddus-reference-card">
          <ExternalLink size={18} />
          <div>
            <strong>Portal Nacional de Contratacoes Publicas</strong>
            <span>Consulte referencias de precos e especificacoes publicas.</span>
          </div>
          <a href="https://www.gov.br/pncp/pt-br" target="_blank" rel="noreferrer">Abrir PNCP</a>
        </div>
      </div>
    </AppShell>
  );
}
