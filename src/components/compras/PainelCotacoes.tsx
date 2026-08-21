"use client";

import {
  cotacoesDestoantes,
  cotacoesValidas,
  coeficienteVariacao,
  fonteDescricoes,
  fonteLabels,
  fontesEmOrdem,
  medianaDe,
  minimoDeCotacoes,
  money,
  type Cotacao,
  type FonteCotacao,
  type LoteItem,
} from "@/lib/compras";
import { AlertTriangle, Ban, Check, Plus, Trash2 } from "lucide-react";
import { FormEvent, useState } from "react";

/**
 * Lista de cotacoes de um item. Cada linha e um preco obtido, com a fonte de
 * onde veio e o documento que comprova — que e o que a IN 65/2021 exige guardar.
 */
export function PainelCotacoes({
  item,
  editavel,
  aoCriar,
  aoAlterar,
  aoRemover,
}: {
  item: LoteItem;
  editavel: boolean;
  aoCriar: (dados: Record<string, unknown>) => Promise<void>;
  aoAlterar: (id: number, dados: Record<string, unknown>) => Promise<void>;
  aoRemover: (id: number) => Promise<void>;
}) {
  const [fonte, setFonte] = useState<FonteCotacao>("painel_precos");
  const [ocupado, setOcupado] = useState(false);

  const validas = cotacoesValidas(item);
  const destoantes = new Set(cotacoesDestoantes(item).map((cotacao) => cotacao.id));
  const mediana = medianaDe(validas.map((cotacao) => cotacao.valorUnitario));
  const dispersao = coeficienteVariacao(item);

  const adicionar = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const dados = new FormData(form);
    setOcupado(true);
    try {
      await aoCriar({
        item: item.item,
        fonte,
        descricao: dados.get("descricao"),
        documento: dados.get("documento"),
        valorUnitario: Number(dados.get("valorUnitario")),
        dataCotacao: dados.get("dataCotacao") || null,
      });
      form.reset();
    } finally {
      setOcupado(false);
    }
  };

  const alternarDesconsiderada = async (cotacao: Cotacao) => {
    if (cotacao.desconsiderada) {
      await aoAlterar(cotacao.id, { desconsiderada: false, justificativa: "" });
      return;
    }
    const motivo = window.prompt(
      `Por que desconsiderar ${money(cotacao.valorUnitario)} de ${cotacao.descricao}?\n` +
        "A IN 65/2021 exige justificar a exclusao de um preco (excessivamente elevado ou inexequivel).",
    );
    if (!motivo?.trim()) return;
    await aoAlterar(cotacao.id, { desconsiderada: true, justificativa: motivo.trim() });
  };

  return (
    <div className="daddus-cotacoes">
      <div className="daddus-cotacoes-resumo">
        <span>
          <strong>{validas.length}</strong> {validas.length === 1 ? "cotacao valida" : "cotacoes validas"}
          {item.cotacoes.length > validas.length && ` · ${item.cotacoes.length - validas.length} desconsiderada(s)`}
        </span>
        {validas.length > 0 && <span>Mediana {money(mediana)}</span>}
        {validas.length > 1 && (
          <span className={dispersao > 0.25 ? "alerta" : ""}>
            Dispersao {(dispersao * 100).toFixed(1)}%
          </span>
        )}
      </div>

      {validas.length < minimoDeCotacoes && (
        <div className="daddus-inline-warning">
          <AlertTriangle size={15} /> A IN 65/2021 recomenda ao menos {minimoDeCotacoes} precos por item. Faltam {minimoDeCotacoes - validas.length}.
        </div>
      )}
      {dispersao > 0.25 && (
        <div className="daddus-inline-warning">
          <AlertTriangle size={15} /> Os precos variam mais de 25% entre si. Vale conferir os marcados antes de fechar o valor de referencia.
        </div>
      )}

      <table className="daddus-table cotacoes-table">
        <thead>
          <tr><th>Fonte</th><th>Origem</th><th>Documento</th><th>Data</th><th>Valor unitario</th><th /></tr>
        </thead>
        <tbody>
          {item.cotacoes.map((cotacao) => (
            <tr key={cotacao.id} className={cotacao.desconsiderada ? "desconsiderada" : ""}>
              <td><span className="daddus-status gray">{fonteLabels[cotacao.fonte]}</span></td>
              <td>{cotacao.descricao}</td>
              <td className="documento">{cotacao.documento || "-"}</td>
              <td>{cotacao.dataCotacao || "-"}</td>
              <td className="valor">
                {money(cotacao.valorUnitario)}
                {destoantes.has(cotacao.id) && !cotacao.desconsiderada && (
                  <span className="daddus-status yellow" title={`Afasta-se mais de 25% da mediana (${money(mediana)})`}>destoante</span>
                )}
                {cotacao.desconsiderada && <small title={cotacao.justificativa}>desconsiderada: {cotacao.justificativa}</small>}
              </td>
              <td>
                {editavel && (
                  <div className="daddus-linha-acoes">
                    <button type="button" className="table-icon-button" title={cotacao.desconsiderada ? "Voltar a considerar" : "Desconsiderar com justificativa"} onClick={() => alternarDesconsiderada(cotacao)}>
                      {cotacao.desconsiderada ? <Check size={14} /> : <Ban size={14} />}
                    </button>
                    <button type="button" className="table-icon-button" title="Excluir cotacao" onClick={() => aoRemover(cotacao.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
          {!item.cotacoes.length && (
            <tr><td colSpan={6} className="daddus-empty">Nenhuma cotacao lancada para este item.</td></tr>
          )}
        </tbody>
      </table>

      {editavel && (
        <form className="daddus-nova-cotacao" onSubmit={adicionar}>
          <label>Fonte
            <select value={fonte} onChange={(event) => setFonte(event.target.value as FonteCotacao)} title={fonteDescricoes[fonte]}>
              {fontesEmOrdem.map((opcao) => <option key={opcao} value={opcao}>{fonteLabels[opcao]}</option>)}
            </select>
          </label>
          <label>Origem
            <input name="descricao" placeholder="Fornecedor ou orgao" required />
          </label>
          <label>Documento
            <input name="documento" placeholder="Link, contrato ou CNPJ" />
          </label>
          <label>Data
            <input name="dataCotacao" placeholder="DD/MM/AAAA" inputMode="numeric" />
          </label>
          <label>Valor unitario
            <input name="valorUnitario" type="number" step="0.01" min="0.01" required />
          </label>
          <button className="daddus-secondary-button" type="submit" disabled={ocupado}>
            <Plus size={15} /> {ocupado ? "Lancando..." : "Lancar cotacao"}
          </button>
        </form>
      )}
      <p className="daddus-muted">{fonteDescricoes[fonte]}</p>

      {(item.ajustes?.length ?? 0) > 0 && (
        <div className="daddus-ajustes">
          <strong>Ajustes de quantidade</strong>
          <ul>
            {item.ajustes!.map((ajuste, indice) => (
              <li key={indice}>
                <span className="daddus-status gray">{ajuste.secretaria}</span>
                <b>{ajuste.anterior} para {ajuste.nova}</b>
                <em>{ajuste.justificativa}</em>
                <small>{ajuste.usuario ?? "usuario removido"} · {ajuste.quando}</small>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
