"use client";

import { AppShell } from "@/components/compras/AppShell";
import { ExportDfdPDF } from "@/components/compras/ExportDfdPDF";
import { podeEditarDemanda } from "@/lib/auth/papeis";
import type { Sessao } from "@/lib/auth/sessao";
import { solicitacaoStatusLabels, type PrefeituraConfig } from "@/lib/compras";
import {
  lacunasDoDfd,
  prioridadeLabels,
  prioridadesEmOrdem,
  prioridadeTone,
  quantidadeTotal,
  type Dfd,
  type Prioridade,
} from "@/lib/dfd";
import { AlertTriangle, ArrowLeft, Check, FileSearch, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type LinhaItem = { item: number; descricao: string; unidade: string; quantidade: string; memoria: string };

/**
 * A ficha da demanda. Editavel enquanto ela nao virou processo — depois disso o
 * DFD e peca do processo administrativo, e reescreve-lo mudaria a origem de um
 * lote que ja esta em cotacao. Quem so le, le e baixa o PDF.
 */
export function FichaDemanda({ dfd, sessao, prefeitura }: { dfd: Dfd; sessao: Sessao; prefeitura: PrefeituraConfig }) {
  const router = useRouter();
  const daPropriaSecretaria = sessao.papel !== "secretario" || dfd.secretaria === sessao.secretariaChave;
  const editavel =
    podeEditarDemanda(sessao.papel) && daPropriaSecretaria && !sessao.demonstracao && dfd.status === "pendente" && !dfd.processo;

  const [campos, setCampos] = useState({
    objeto: dfd.objeto,
    justificativa: dfd.justificativa,
    prioridade: dfd.prioridade,
    dataPretendida: dfd.dataPretendida ?? "",
    previsaoPca: dfd.previsaoPca,
    resultados: dfd.resultados,
    vinculacao: dfd.vinculacao,
    responsavel: dfd.responsavel,
  });
  const [itens, setItens] = useState<LinhaItem[]>(
    dfd.itens.map((item) => ({
      item: item.item,
      descricao: item.descricao,
      unidade: item.unidade,
      quantidade: String(item.quantidade),
      memoria: item.memoria,
    })),
  );
  const [sujo, setSujo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");

  const mudarCampo = <C extends keyof typeof campos>(campo: C, valor: (typeof campos)[C]) => {
    setCampos((atual) => ({ ...atual, [campo]: valor }));
    setSujo(true);
  };

  const mudarItem = (item: number, campo: keyof LinhaItem, valor: string) => {
    setItens((atual) => atual.map((linha) => (linha.item === item ? { ...linha, [campo]: valor } : linha)));
    setSujo(true);
  };

  const salvar = async () => {
    setSalvando(true);
    setErro("");
    setAviso("");
    try {
      const resposta = await fetch(`/api/dfd/${encodeURIComponent(dfd.numero)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...campos,
          dataPretendida: campos.dataPretendida || null,
          origemItens: dfd.origemItens,
          itens: itens
            .filter((linha) => linha.descricao.trim())
            .map((linha, indice) => ({
              item: indice + 1,
              descricao: linha.descricao,
              unidade: linha.unidade,
              quantidade: Number(String(linha.quantidade).replace(",", ".")) || 0,
              memoria: linha.memoria,
            })),
        }),
      });
      const corpo = (await resposta.json().catch(() => ({}))) as { error?: string };
      if (!resposta.ok) {
        setErro(corpo.error || `A API respondeu ${resposta.status}.`);
        return;
      }
      setSujo(false);
      setAviso("Demanda gravada.");
      router.refresh();
    } catch {
      setErro("Falha de conexao com o servidor.");
    } finally {
      setSalvando(false);
    }
  };

  const lacunas = lacunasDoDfd(dfd);
  const atual: Dfd = {
    ...dfd,
    ...campos,
    dataPretendida: campos.dataPretendida || null,
    itens: itens.map((linha, indice) => ({
      id: indice + 1,
      item: indice + 1,
      descricao: linha.descricao,
      unidade: linha.unidade,
      quantidade: Number(String(linha.quantidade).replace(",", ".")) || 0,
      memoria: linha.memoria,
    })),
  };

  return (
    <AppShell sessao={sessao} titulo={`DFD ${dfd.numero}`}>
      <Link href="/painel/secretario/solicitacoes" className="daddus-back-link"><ArrowLeft size={15} /> Voltar as demandas</Link>

      <div className="daddus-page-heading daddus-page-heading-actions">
        <div>
          <span className="daddus-overline">{dfd.secretariaNome} · Lei 14.133/2021, art. 12, VII</span>
          <h2>Documento de Formalizacao da Demanda {dfd.numero}</h2>
          <p>{atual.objeto || "Sem objeto informado"}</p>
        </div>
        <div className="daddus-heading-actions">
          {/* O PDF sai do que esta na tela: o comprador confere antes de anexar. */}
          <ExportDfdPDF dfd={atual} prefeitura={prefeitura} />
          {dfd.processo && (
            <Link href={`/painel/compras/etp/${encodeURIComponent(dfd.processo)}`} className="daddus-secondary-button">
              <FileSearch size={15} /> Estudo tecnico
            </Link>
          )}
          {editavel && (
            <button type="button" className="daddus-confirm-button" onClick={salvar} disabled={salvando || !sujo}>
              <Check size={16} /> {salvando ? "Salvando..." : "Salvar demanda"}
            </button>
          )}
        </div>
      </div>

      <div className="daddus-process-meta">
        <div>
          <span>Situacao</span>
          <strong className="daddus-status gray">{solicitacaoStatusLabels[dfd.status]}</strong>
        </div>
        <div>
          <span>Prioridade</span>
          <strong className={`daddus-status ${prioridadeTone(atual.prioridade)}`}>{prioridadeLabels[atual.prioridade]}</strong>
        </div>
        <div><span>Processo vinculado</span><strong>{dfd.processo ? `PE ${dfd.processo}` : "Ainda nao gerado"}</strong></div>
        <div><span>Aberta em</span><strong>{dfd.criadoEm} · {dfd.autor ?? "-"}</strong></div>
      </div>

      {erro && <div className="daddus-inline-warning"><AlertTriangle size={16} /> {erro}</div>}
      {aviso && <div className="daddus-inline-success"><Check size={16} /> {aviso}</div>}
      {!editavel && (
        <div className="daddus-notice">
          <div>
            <strong>Somente leitura</strong>
            <span>
              {dfd.processo
                ? `A demanda ja gerou o processo PE ${dfd.processo}: a partir daqui ela e peca do processo administrativo.`
                : sessao.demonstracao
                  ? "O portal esta em modo de demonstracao."
                  : "Editar a demanda cabe a secretaria que a formalizou e ao Setor de Compras."}
            </span>
          </div>
        </div>
      )}
      {editavel && lacunas.length > 0 && (
        <div className="daddus-inline-warning">
          <AlertTriangle size={16} /> Para sustentar o estudo tecnico, ainda falta: {lacunas.join("; ")}.
        </div>
      )}

      <div className="daddus-form-card">
        <div className="daddus-form-section">
          <div>
            <h3>Necessidade</h3>
            <p>O texto daqui vira o inciso I do ETP: descricao da necessidade.</p>
          </div>
          <div className="daddus-form-grid single">
            <label>
              Objeto
              <textarea value={campos.objeto} rows={2} disabled={!editavel} onChange={(evento) => mudarCampo("objeto", evento.target.value)} />
            </label>
            <label>
              Justificativa
              <textarea value={campos.justificativa} rows={5} disabled={!editavel}
                        onChange={(evento) => mudarCampo("justificativa", evento.target.value)} />
            </label>
            <div className="daddus-form-grid">
              <label>
                Prioridade
                <select value={campos.prioridade} disabled={!editavel}
                        onChange={(evento) => mudarCampo("prioridade", evento.target.value as Prioridade)}>
                  {prioridadesEmOrdem.map((opcao) => (
                    <option key={opcao} value={opcao}>{prioridadeLabels[opcao]}</option>
                  ))}
                </select>
              </label>
              <label>
                Data pretendida
                <input value={campos.dataPretendida} placeholder="DD/MM/AAAA" inputMode="numeric" disabled={!editavel}
                       onChange={(evento) => mudarCampo("dataPretendida", evento.target.value)} />
              </label>
            </div>
            <label>
              Responsavel pela demanda
              <input value={campos.responsavel} disabled={!editavel} onChange={(evento) => mudarCampo("responsavel", evento.target.value)} />
            </label>
            <label>
              Resultados pretendidos
              <textarea value={campos.resultados} rows={2} disabled={!editavel}
                        onChange={(evento) => mudarCampo("resultados", evento.target.value)} />
            </label>
            <label>
              Contratacoes correlatas ou interdependentes
              <input value={campos.vinculacao} disabled={!editavel} onChange={(evento) => mudarCampo("vinculacao", evento.target.value)} />
            </label>
            <label className="daddus-checkbox">
              <input type="checkbox" checked={campos.previsaoPca} disabled={!editavel}
                     onChange={(evento) => mudarCampo("previsaoPca", evento.target.checked)} />
              Demanda prevista no plano de contratacoes anual (PCA)
            </label>
          </div>
        </div>
      </div>

      <div className="daddus-editor-toolbar">
        <div>
          <strong>Itens e memoria de calculo</strong>
          <span>
            {itens.length} {itens.length === 1 ? "item" : "itens"} · {quantidadeTotal(atual).toLocaleString("pt-BR")} unidades
            {dfd.origemItens ? ` · ${dfd.origemItens}` : ""}
          </span>
        </div>
        {editavel && (
          <div className="daddus-heading-actions">
            <button type="button" className="daddus-secondary-button"
                    onClick={() => { setItens((a) => [...a, { item: a.length + 1, descricao: "", unidade: "UN", quantidade: "", memoria: "" }]); setSujo(true); }}>
              <Plus size={15} /> Adicionar item
            </button>
          </div>
        )}
      </div>

      <div className="daddus-editor-card">
        <div className="daddus-table-wrap">
          <table className="daddus-table">
            <thead>
              <tr><th>Item</th><th>Descricao</th><th>Un.</th><th>Quantidade</th><th>Memoria de calculo</th>{editavel && <th />}</tr>
            </thead>
            <tbody>
              {itens.map((linha) => (
                <tr key={linha.item}>
                  <td className="item-number">{linha.item}</td>
                  <td>
                    <textarea className="cell-textarea" value={linha.descricao} disabled={!editavel}
                              onChange={(evento) => mudarItem(linha.item, "descricao", evento.target.value)} />
                  </td>
                  <td>
                    <input className="cell-input unit" value={linha.unidade} disabled={!editavel}
                           onChange={(evento) => mudarItem(linha.item, "unidade", evento.target.value)} />
                  </td>
                  <td>
                    <input className="cell-input quantity" type="number" min="0" step="0.001" value={linha.quantidade} disabled={!editavel}
                           onChange={(evento) => mudarItem(linha.item, "quantidade", evento.target.value)} />
                  </td>
                  <td>
                    <textarea className="cell-textarea" value={linha.memoria} disabled={!editavel}
                              placeholder="Como voce chegou a esse numero"
                              onChange={(evento) => mudarItem(linha.item, "memoria", evento.target.value)} />
                  </td>
                  {editavel && (
                    <td>
                      <button type="button" className="table-icon-button" aria-label={`Remover item ${linha.item}`}
                              onClick={() => { setItens((a) => a.filter((o) => o.item !== linha.item).map((o, i) => ({ ...o, item: i + 1 }))); setSujo(true); }}>
                        <Trash2 size={15} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {!itens.length && (
                <tr><td colSpan={editavel ? 6 : 5} className="daddus-empty">Nenhum item quantificado nesta demanda.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
