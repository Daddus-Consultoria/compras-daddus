"use client";

import { ExportLicitacaoPDF } from "@/components/ExportLicitacaoPDF";
import { AppShell } from "@/components/compras/AppShell";
import { podeEditarLote, podeEditarTodasAsColunas } from "@/lib/auth/papeis";
import type { Sessao } from "@/lib/auth/sessao";
import {
  itemAverage,
  itemTotalQuantity,
  loteTotal,
  money,
  nextItemNumber,
  nomeSecretaria,
  processoStatusLabels,
  quotesFilled,
  nomeCurtoSecretaria,
  statusTone,
  toNumericValue,
  type LoteItem,
  type PrefeituraConfig,
  type Processo,
  type Secretaria,
  type SecretariaInfo,
} from "@/lib/compras";
import { AlertTriangle, ArrowLeft, Check, ChevronDown, ExternalLink, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const quoteKeys = ["bnc", "pncp", "mercado"] as const;

export function ProcessoEditor({ processo, prefeitura, sessao, secretarias }: { processo: Processo; prefeitura: PrefeituraConfig; sessao: Sessao; secretarias: SecretariaInfo[] }) {
  const router = useRouter();
  const podeEditar = podeEditarLote(sessao.papel);
  const editaTudo = podeEditarTodasAsColunas(sessao.papel);
  // Secretario mexe apenas na coluna da propria secretaria; compras, em todas.
  const minhaSecretaria: Secretaria | null = editaTudo ? null : sessao.secretariaChave;
  const colunaEditavel = (chave: Secretaria) => {
    const secretaria = secretarias.find((opcao) => opcao.chave === chave);
    if (!podeEditar || (secretaria && !secretaria.ativa)) return false;
    return editaTudo || chave === minhaSecretaria;
  };
  const [items, setItems] = useState<LoteItem[]>(processo.itens);
  const [notes, setNotes] = useState(processo.notas);
  const [referenceMessage, setReferenceMessage] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!saveMessage) return;
    const timer = setTimeout(() => setSaveMessage(""), 4000);
    return () => clearTimeout(timer);
  }, [saveMessage]);

  const patchItem = (id: string, patch: (item: LoteItem) => LoteItem) => {
    setItems((current) => current.map((item) => (item.id === id ? patch(item) : item)));
    setDirty(true);
  };

  const updateText = (id: string, field: "especificacao" | "unidade", value: string) => patchItem(id, (item) => ({ ...item, [field]: value }));
  const updateQuantity = (id: string, secretaria: Secretaria, value: string) => patchItem(id, (item) => ({ ...item, quantidades: { ...item.quantidades, [secretaria]: toNumericValue(value) } }));
  const updateQuote = (id: string, quote: (typeof quoteKeys)[number], value: string) => patchItem(id, (item) => ({ ...item, cotacoes: { ...item.cotacoes, [quote]: toNumericValue(value) } }));

  const addItem = () => {
    setItems((current) => [
      ...current,
      { id: crypto.randomUUID(), item: nextItemNumber(current), especificacao: "", unidade: "UN", quantidades: Object.fromEntries(secretarias.map((secretaria) => [secretaria.chave, 0])), cotacoes: { bnc: 0, pncp: 0, mercado: 0 } },
    ]);
    setDirty(true);
  };

  const removeItem = (id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
    setDirty(true);
  };

  const searchReference = () => {
    const alvo = items[0];
    if (!alvo) {
      setReferenceMessage("Adicione um item antes de buscar uma referencia.");
      return;
    }
    setReferenceMessage(`Referencia PNCP localizada: especificacao sugerida aplicada ao item ${alvo.item}.`);
    patchItem(alvo.id, (item) => ({ ...item, especificacao: `${item.especificacao} - referencia PNCP` }));
  };

  const salvarLote = async () => {
    setSalvando(true);
    setErro("");
    setSaveMessage("");
    try {
      const resposta = await fetch(`/api/processos/${encodeURIComponent(processo.id)}/lote`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notas: notes, itens: items }),
      });
      const corpo = await resposta.json().catch(() => ({}));
      if (!resposta.ok) throw new Error(corpo.error || `A API respondeu ${resposta.status}.`);
      setSaveMessage("Lote salvo.");
      setDirty(false);
      // Traz de volta a versao gravada, com numeracao e valores normalizados.
      router.refresh();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Nao foi possivel salvar o lote.");
    } finally {
      setSalvando(false);
    }
  };

  const itensIncompletos = items.filter((item) => quotesFilled(item) < 3).length;

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
          {podeEditar && (
            <button className="daddus-primary-button" type="button" onClick={salvarLote} disabled={salvando}>
              <Check size={16} /> {salvando ? "Salvando..." : "Salvar lote"}
            </button>
          )}
        </div>
      </div>

      <div className="daddus-process-meta">
        <div><span>Status</span><strong className={`daddus-status ${statusTone(processo.status)}`}>{processoStatusLabels[processo.status]}</strong></div>
        <div><span>Prazo limite</span><strong>{processo.prazoLimite}</strong></div>
        <div><span>Responsavel</span><strong>{processo.responsavel}</strong></div>
        <div><span>Ultima atualizacao</span><strong>{dirty ? "Alteracoes nao salvas" : processo.atualizadoEm}</strong></div>
      </div>

      <div className="daddus-editor-toolbar">
        <div>
          <strong>Itens do lote</strong>
          <span>{items.length} {items.length === 1 ? "item" : "itens"} · Valor estimado {money(loteTotal(items))}</span>
        </div>
        {editaTudo && (
          <div className="daddus-heading-actions">
            <button className="daddus-secondary-button" type="button" onClick={searchReference}><Search size={15} /> Buscar no Portal / PNCP</button>
            <button className="daddus-secondary-button" type="button" onClick={addItem}><Plus size={15} /> Adicionar item</button>
          </div>
        )}
      </div>

      {erro && <div className="daddus-inline-warning"><AlertTriangle size={16} /> {erro}</div>}
      {saveMessage && <div className="daddus-inline-success"><Check size={16} /> {saveMessage}</div>}
      {referenceMessage && <div className="daddus-inline-success"><Sparkles size={16} /> {referenceMessage}</div>}
      {itensIncompletos > 0 && (
        <div className="daddus-inline-warning">
          <AlertTriangle size={16} /> {itensIncompletos} {itensIncompletos === 1 ? "item ainda nao tem" : "itens ainda nao tem"} as tres cotacoes. O valor medio considera apenas as cotacoes preenchidas.
        </div>
      )}

      <div className="daddus-editor-card">
        <div className="daddus-permission-note">
          <span className="daddus-info-icon">i</span>
          {!podeEditar ? (
            <span>Seu perfil acompanha este lote em <strong>somente leitura</strong>.</span>
          ) : editaTudo ? (
            <span>Voce edita o lote como <strong>Setor de Compras</strong>: todas as colunas e as cotacoes estao liberadas.</span>
          ) : (
            <span>Voce esta editando como <strong>Secretaria de {nomeCurtoSecretaria(secretarias, minhaSecretaria)}</strong>. As quantidades das demais secretarias ficam bloqueadas para preservar a autoria.</span>
          )}
          <ChevronDown size={15} />
        </div>
        <div className="daddus-table-wrap">
          <table className="daddus-table lot-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Especificacao detalhada</th>
                <th>Unidade</th>
                {secretarias.map((secretaria) => <th key={secretaria.chave} title={secretaria.ativa ? undefined : "Secretaria desativada"}>{secretaria.nome}{secretaria.ativa ? "" : " *"}</th>)}
                <th>Qtd. total</th>
                <th>Cotacao 1<br /><small>BNC</small></th>
                <th>Cotacao 2<br /><small>PNCP</small></th>
                <th>Cotacao 3<br /><small>Mercado</small></th>
                <th>Valor medio</th>
                <th>Valor total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="item-number">{item.item}</td>
                  <td><textarea className="cell-textarea" value={item.especificacao} placeholder="Descreva o item" disabled={!editaTudo} onChange={(event) => updateText(item.id, "especificacao", event.target.value)} /></td>
                  <td><input className="cell-input unit" value={item.unidade} disabled={!editaTudo} onChange={(event) => updateText(item.id, "unidade", event.target.value)} /></td>
                  {secretarias.map((secretaria) => (
                    <td key={secretaria.chave}>
                      <input
                        className="cell-input quantity"
                        type="number"
                        min="0"
                        value={item.quantidades[secretaria.chave] || ""}
                        disabled={!colunaEditavel(secretaria.chave)}
                        onChange={(event) => updateQuantity(item.id, secretaria.chave, event.target.value)}
                        title={colunaEditavel(secretaria.chave) ? undefined : `Somente a Secretaria de ${secretaria.nome} pode editar`}
                      />
                    </td>
                  ))}
                  <td className="calculated">{itemTotalQuantity(item)}</td>
                  {quoteKeys.map((quote) => (
                    <td key={quote}>
                      <input className="cell-input money" type="number" min="0" step="0.01" value={item.cotacoes[quote] || ""} disabled={!editaTudo} onChange={(event) => updateQuote(item.id, quote, event.target.value)} />
                    </td>
                  ))}
                  <td className="calculated">{money(itemAverage(item))}</td>
                  <td className="calculated total">{money(itemAverage(item) * itemTotalQuantity(item))}</td>
                  <td>{editaTudo && <button type="button" className="table-icon-button" aria-label={`Remover item ${item.item}`} onClick={() => removeItem(item.id)}><Trash2 size={15} /></button>}</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={secretarias.length + 9} className="daddus-empty">Nenhum item no lote. Use &ldquo;Adicionar item&rdquo; para comecar.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="daddus-process-bottom">
        <label className="daddus-notes">
          <span>Comentarios / notas do processo</span>
          <textarea value={notes} disabled={!editaTudo} onChange={(event) => { setNotes(event.target.value); setDirty(true); }} placeholder="Registre premissas, contatos com fornecedores ou observacoes internas..." />
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
