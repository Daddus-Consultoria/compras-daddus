"use client";

import { money, type LoteItem, type VinculoCatalogo } from "@/lib/compras";
import { AlertTriangle, Download, Search, X } from "lucide-react";
import { useState } from "react";

/**
 * Precos praticados no Painel de Precos, para o item do lote.
 *
 * A lista chega da rota `/api/processos/[numero]/precos`, que le a API publica
 * do Compras.gov.br. Nada entra no processo sozinho: cada linha e importada por
 * um clique, e vira uma cotacao comum, com fonte `painel_precos`, o orgao que
 * comprou na descricao e o id da compra no documento.
 *
 * Importar em massa seria pior do que parece. A IN 65/2021 pede analise critica
 * dos precos, e uma cesta montada de enfiada dilui a responsabilidade de quem
 * assina o mapa: o preco entra porque alguem olhou, nao porque veio na resposta.
 */

type PrecoDaApi = {
  documento: string;
  valorUnitario: number;
  dataCotacao: string;
  origem: string;
  fornecedor: string | null;
  marca: string | null;
  unidadeFornecimento: string | null;
  quantidade: number | null;
  descricaoItem: string;
  jaImportado: boolean;
};

/**
 * A unidade de fornecimento da compra publicada bate com a do item do lote?
 *
 * O Painel devolve o preco na unidade em que cada orgao comprou: o mesmo copo
 * descartavel aparece a R$ 0,03 por UN e a R$ 2,95 por PCT de 100. Somar os
 * dois numa cesta so produz um valor de referencia que nao existe. A tela nao
 * decide por ninguem — ela marca a divergencia para quem for importar ver.
 */
const mesmaUnidade = (doPainel: string | null, doLote: string) => {
  if (!doPainel) return true;
  const limpar = (texto: string) => texto.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return limpar(doPainel) === limpar(doLote);
};

export function PrecosPublicos({
  processoId,
  item,
  aoImportar,
}: {
  processoId: string;
  item: LoteItem;
  aoImportar: (dados: Record<string, unknown>) => Promise<void>;
}) {
  const [precos, setPrecos] = useState<PrecoDaApi[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState("");
  const [importando, setImportando] = useState<string | null>(null);
  const [estado, setEstado] = useState("");

  const catalogo: VinculoCatalogo | null = item.catalogo ?? null;

  const buscar = async () => {
    setBuscando(true);
    setErro("");
    try {
      const parametros = new URLSearchParams({ item: String(item.item) });
      if (estado) parametros.set("estado", estado);
      const resposta = await fetch(
        `/api/processos/${encodeURIComponent(processoId)}/precos?${parametros}`,
        { cache: "no-store" },
      );
      const corpo = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErro(corpo.error || `A API respondeu ${resposta.status}.`);
        setPrecos(null);
        return;
      }
      setPrecos(corpo.precos ?? []);
    } catch (falha) {
      setErro(`Nao foi possivel consultar: ${(falha as Error).message}`);
    } finally {
      setBuscando(false);
    }
  };

  const importar = async (preco: PrecoDaApi) => {
    setImportando(preco.documento);
    try {
      await aoImportar({
        item: item.item,
        fonte: "painel_precos",
        // O que a origem publicou, sem reescrita: quem comprou, e o que consta
        // da compra. A marca entra porque preco de material sem marca e
        // comparacao pela metade.
        descricao: preco.marca ? `${preco.origem} · ${preco.marca}` : preco.origem,
        documento: preco.documento,
        valorUnitario: preco.valorUnitario,
        dataCotacao: preco.dataCotacao,
      });
      setPrecos((atual) =>
        atual?.map((linha) => (linha.documento === preco.documento ? { ...linha, jaImportado: true } : linha)) ?? null,
      );
    } finally {
      setImportando(null);
    }
  };

  if (!catalogo) {
    return (
      <div className="daddus-precos-publicos vazio">
        <span>
          <strong>Painel de Precos:</strong> este item ainda nao tem codigo de catalogo.
          A consulta e por CATMAT/CATSER — a origem nao pesquisa por descricao.
          Amarre o item ao catalogo na coluna &ldquo;Catalogo&rdquo; para consultar.
        </span>
      </div>
    );
  }

  return (
    <div className="daddus-precos-publicos">
      <div className="daddus-precos-cabecalho">
        <span>
          <strong>Painel de Precos</strong> · {catalogo.tipo === "material" ? "CATMAT" : "CATSER"} {catalogo.codigo}
        </span>
        <label>
          UF
          <input
            value={estado}
            maxLength={2}
            placeholder="todas"
            onChange={(evento) => setEstado(evento.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
          />
        </label>
        <button type="button" className="daddus-secondary-button" onClick={buscar} disabled={buscando}>
          <Search size={14} /> {buscando ? "Consultando..." : "Buscar precos publicados"}
        </button>
        {precos !== null && (
          <button type="button" className="daddus-row-action" onClick={() => setPrecos(null)}>
            <X size={13} /> fechar
          </button>
        )}
      </div>

      {erro && <div className="daddus-inline-error">{erro}</div>}

      {precos !== null && precos.length === 0 && !erro && (
        // "Nao ha preco publicado" e resposta legitima, e diferente de erro:
        // item novo ou pouco comprado simplesmente nao tem historico.
        <p className="daddus-precos-nada">
          A origem nao tem compra publicada para este codigo{estado ? ` em ${estado}` : ""}.
          Vale tentar sem o filtro de UF, ou usar outra fonte.
        </p>
      )}

      {precos !== null && precos.some((preco) => !mesmaUnidade(preco.unidadeFornecimento, item.unidade)) && (
        <div className="daddus-inline-warning">
          <AlertTriangle size={15} /> Ha precos publicados em unidade diferente da do lote ({item.unidade}).
          Preco por unidade distinta nao entra na mesma cesta sem conversao — e a conversao nao e feita aqui.
        </div>
      )}

      {precos !== null && precos.length > 0 && (
        <div className="daddus-precos-lista">
        <table className="daddus-table precos-table">
          <thead>
            <tr>
              <th>Valor unitario</th><th>Unidade</th><th>Orgao comprador</th>
              <th>Fornecedor</th><th>Data</th><th />
            </tr>
          </thead>
          <tbody>
            {precos.map((preco) => (
              <tr key={preco.documento} className={preco.jaImportado ? "ja-importado" : ""}>
                <td className="valor">{money(preco.valorUnitario)}</td>
                <td className={mesmaUnidade(preco.unidadeFornecimento, item.unidade) ? "" : "unidade-diferente"}>
                  {preco.unidadeFornecimento ?? "-"}
                  {!mesmaUnidade(preco.unidadeFornecimento, item.unidade) && (
                    <AlertTriangle size={12} aria-label={`O lote esta em ${item.unidade}`} />
                  )}
                </td>
                <td>{preco.origem}</td>
                <td>{preco.fornecedor ?? "-"}</td>
                <td>{preco.dataCotacao}</td>
                <td>
                  {preco.jaImportado ? (
                    <span className="daddus-status gray">no lote</span>
                  ) : (
                    <button
                      type="button"
                      className="daddus-row-action"
                      onClick={() => importar(preco)}
                      disabled={importando === preco.documento}
                    >
                      <Download size={13} /> {importando === preco.documento ? "..." : "importar"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}
