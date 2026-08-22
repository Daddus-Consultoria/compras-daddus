"use client";

import { AppShell } from "@/components/compras/AppShell";
import { SaldoDoContrato } from "@/components/compras/SaldoDoContrato";
import { podeGerenciarContratos } from "@/lib/auth/papeis";
import type { Sessao } from "@/lib/auth/sessao";
import { money } from "@/lib/compras";
import {
  contratoStatusEmOrdem,
  contratoStatusLabels,
  contratoTone,
  diasParaVencer,
  totalDoItem,
  totalDosItens,
  type Contrato,
  type ContratoStatus,
  type ItemContrato,
} from "@/lib/contratos";
import type { Pedido, SaldoItem } from "@/lib/pedidos";
import { AlertTriangle, ArrowLeft, Check, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Campos = {
  fornecedor: string;
  cnpjFornecedor: string;
  objeto: string;
  vigenciaInicio: string;
  vigenciaFim: string;
  documento: string;
  status: ContratoStatus;
};

/**
 * A ficha do contrato, a lista do que foi contratado e o saldo que sobra dela.
 * Nem o valor nem o saldo sao digitados: o valor e a soma dos itens, recalculada
 * no banco a cada gravacao, e o saldo e o contratado menos o que os pedidos de
 * fornecimento ja consumiram. Por isso a tabela de saldo nao tem campo editavel
 * — corrigir saldo se faz estornando o pedido, e nao sobrescrevendo o numero.
 */
export function ContratoEditor({
  contrato,
  saldo,
  pedidos,
  sessao,
}: {
  contrato: Contrato;
  saldo: SaldoItem[];
  pedidos: Pedido[];
  sessao: Sessao;
}) {
  const router = useRouter();
  const editavel = podeGerenciarContratos(sessao.papel) && !sessao.demonstracao;
  const [campos, setCampos] = useState<Campos>({
    fornecedor: contrato.fornecedor,
    cnpjFornecedor: contrato.cnpjFornecedor,
    objeto: contrato.objeto,
    vigenciaInicio: contrato.vigenciaInicio ?? "",
    vigenciaFim: contrato.vigenciaFim ?? "",
    documento: contrato.documento,
    status: contrato.status,
  });
  const [itens, setItens] = useState<ItemContrato[]>(contrato.itens);
  const [sujo, setSujo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");

  const total = totalDosItens(itens);
  const dias = diasParaVencer(campos.vigenciaFim || null);

  const mudarCampo = <C extends keyof Campos>(campo: C, valor: Campos[C]) => {
    setCampos((atual) => ({ ...atual, [campo]: valor }));
    setSujo(true);
  };

  const mudarItem = (id: number, campo: keyof ItemContrato, valor: string) => {
    setItens((atual) =>
      atual.map((item) =>
        item.id === id
          ? { ...item, [campo]: campo === "descricao" || campo === "unidade" ? valor : Number(valor.replace(",", ".")) || 0 }
          : item,
      ),
    );
    setSujo(true);
  };

  const adicionarItem = () => {
    const proximo = itens.reduce((maior, item) => Math.max(maior, item.item), 0) + 1;
    // Id negativo marca item que ainda nao existe no banco; a gravacao reconcilia
    // pelo numero do item, entao ele nunca chega ao servidor.
    setItens((atual) => [...atual, { id: -proximo, item: proximo, descricao: "", unidade: "UN", quantidadeContratada: 0, valorUnitario: 0 }]);
    setSujo(true);
  };

  const removerItem = (id: number) => {
    setItens((atual) => atual.filter((item) => item.id !== id));
    setSujo(true);
  };

  const salvar = async () => {
    setSalvando(true);
    setErro("");
    setAviso("");
    try {
      const resposta = await fetch(`/api/contratos/${encodeURIComponent(contrato.numero)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...campos, itens }),
      });
      const corpo = (await resposta.json().catch(() => ({}))) as Contrato & { error?: string };
      if (!resposta.ok) {
        setErro(corpo.error || `A API respondeu ${resposta.status}.`);
        return;
      }
      setItens(corpo.itens ?? itens);
      setSujo(false);
      setAviso("Contrato gravado.");
      router.refresh();
    } catch {
      setErro("Falha de conexao com o servidor.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <AppShell sessao={sessao} titulo={`Contrato ${contrato.numero}`}>
      <Link href="/painel/compras/contratos" className="daddus-back-link"><ArrowLeft size={15} /> Voltar aos contratos</Link>

      <div className="daddus-page-heading daddus-page-heading-actions">
        <div>
          <span className="daddus-overline">
            {contrato.processo ? `Processo ${contrato.processo}` : "Contrato sem processo no portal"}
          </span>
          <h2>Contrato {contrato.numero}</h2>
          <p>{campos.fornecedor || "Fornecedor nao informado"} · {itens.length} {itens.length === 1 ? "item" : "itens"} · {money(total)}</p>
        </div>
        {editavel && (
          <div className="daddus-heading-actions">
            <button type="button" className="daddus-confirm-button" onClick={salvar} disabled={salvando || !sujo}>
              <Check size={16} /> {salvando ? "Salvando..." : "Salvar contrato"}
            </button>
          </div>
        )}
      </div>

      <div className="daddus-process-meta">
        <div>
          <span>Situacao</span>
          <strong className={`daddus-status ${contratoTone(campos.status)}`}>{contratoStatusLabels[campos.status]}</strong>
        </div>
        <div><span>Vigencia</span><strong>{campos.vigenciaInicio || "-"} a {campos.vigenciaFim || "-"}</strong></div>
        <div>
          <span>Prazo restante</span>
          <strong>{dias === null ? "-" : dias < 0 ? `Vencido ha ${Math.abs(dias)} dias` : `${dias} dias`}</strong>
        </div>
        <div><span>Ultima atualizacao</span><strong>{sujo ? "Alteracoes nao salvas" : contrato.atualizadoEm}</strong></div>
      </div>

      {erro && <div className="daddus-inline-warning"><AlertTriangle size={16} /> {erro}</div>}
      {aviso && <div className="daddus-inline-success"><Check size={16} /> {aviso}</div>}
      {!editavel && (
        <div className="daddus-notice">
          <div>
            <strong>Somente leitura</strong>
            <span>{sessao.demonstracao ? "O portal esta em modo de demonstracao." : "Cadastrar e editar contrato e do Setor de Compras."}</span>
          </div>
        </div>
      )}

      <div className="daddus-form-card">
        <div className="daddus-modal-linha">
          <label>
            Fornecedor
            <input value={campos.fornecedor} disabled={!editavel} onChange={(evento) => mudarCampo("fornecedor", evento.target.value)} />
          </label>
          <label>
            CNPJ
            <input value={campos.cnpjFornecedor} disabled={!editavel} placeholder="00.000.000/0001-00"
                   onChange={(evento) => mudarCampo("cnpjFornecedor", evento.target.value)} />
          </label>
        </div>
        <label>
          Objeto
          <textarea value={campos.objeto} disabled={!editavel} onChange={(evento) => mudarCampo("objeto", evento.target.value)} />
        </label>
        <div className="daddus-modal-linha">
          <label>
            Inicio da vigencia
            <input value={campos.vigenciaInicio} disabled={!editavel} placeholder="DD/MM/AAAA" inputMode="numeric"
                   onChange={(evento) => mudarCampo("vigenciaInicio", evento.target.value)} />
          </label>
          <label>
            Fim da vigencia
            <input value={campos.vigenciaFim} disabled={!editavel} placeholder="DD/MM/AAAA" inputMode="numeric"
                   onChange={(evento) => mudarCampo("vigenciaFim", evento.target.value)} />
          </label>
        </div>
        <div className="daddus-modal-linha">
          <label>
            Documento
            <input value={campos.documento} disabled={!editavel} placeholder="Numero do instrumento, ata ou publicacao"
                   onChange={(evento) => mudarCampo("documento", evento.target.value)} />
          </label>
          <label>
            Situacao
            <select value={campos.status} disabled={!editavel} onChange={(evento) => mudarCampo("status", evento.target.value as ContratoStatus)}>
              {contratoStatusEmOrdem.map((opcao) => (
                <option key={opcao} value={opcao}>{contratoStatusLabels[opcao]}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="daddus-editor-toolbar">
        <div>
          <strong>Itens contratados</strong>
          <span>{itens.length} {itens.length === 1 ? "item" : "itens"} · valor do contrato {money(total)} (soma dos itens)</span>
        </div>
        {editavel && (
          <div className="daddus-heading-actions">
            <button type="button" className="daddus-secondary-button" onClick={adicionarItem}><Plus size={15} /> Adicionar item</button>
          </div>
        )}
      </div>

      <div className="daddus-editor-card">
        <div className="daddus-table-wrap">
          <table className="daddus-table lot-table">
            <thead>
              <tr><th>Item</th><th>Descricao</th><th>Un.</th><th>Qtd. contratada</th><th>Valor unitario</th><th>Valor total</th><th /></tr>
            </thead>
            <tbody>
              {itens.map((item) => (
                <tr key={item.id}>
                  <td className="item-number">{item.item}</td>
                  <td>
                    <textarea className="cell-textarea" value={item.descricao} placeholder="Descreva o item" disabled={!editavel}
                              onChange={(evento) => mudarItem(item.id, "descricao", evento.target.value)} />
                  </td>
                  <td>
                    <input className="cell-input unit" value={item.unidade} disabled={!editavel}
                           onChange={(evento) => mudarItem(item.id, "unidade", evento.target.value)} />
                  </td>
                  <td>
                    <input className="cell-input quantity" type="number" min="0" step="0.001" value={item.quantidadeContratada || ""}
                           disabled={!editavel} onChange={(evento) => mudarItem(item.id, "quantidadeContratada", evento.target.value)} />
                  </td>
                  <td>
                    <input className="cell-input quantity" type="number" min="0" step="0.01" value={item.valorUnitario || ""}
                           disabled={!editavel} onChange={(evento) => mudarItem(item.id, "valorUnitario", evento.target.value)} />
                  </td>
                  <td className="calculated total">{money(totalDoItem(item))}</td>
                  <td>
                    {editavel && (
                      <button type="button" className="table-icon-button" aria-label={`Remover item ${item.item}`} onClick={() => removerItem(item.id)}>
                        <Trash2 size={15} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!itens.length && (
                <tr><td colSpan={7} className="daddus-empty">Nenhum item contratado. Use &ldquo;Adicionar item&rdquo; para comecar.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <SaldoDoContrato saldo={saldo} pedidos={pedidos} />
    </AppShell>
  );
}
