"use client";

import type { VinculoCatalogo } from "@/lib/compras";
import { Link2, Search, X } from "lucide-react";
import { useState } from "react";

/**
 * Amarra um item do lote a um codigo do catalogo oficial (CATMAT/CATSER).
 *
 * Existe por causa de uma restricao da origem: o Painel de Precos consulta por
 * codigo, e nao por descricao. Sem o codigo, nao ha consulta automatica de
 * preco — a especificacao digitada a mao nao serve de chave.
 *
 * A busca e local, contra a copia do catalogo (`npm run catalogo`), porque a
 * API do Compras.gov.br tambem nao procura por texto.
 */

type ItemDoCatalogo = {
  codigo: number;
  tipo: "material" | "servico";
  descricao: string;
  classe: string | null;
};

export function SeletorCatalogo({
  valor,
  editavel,
  sugestao,
  aoEscolher,
}: {
  valor: VinculoCatalogo | null;
  editavel: boolean;
  /** A especificacao do item, usada como primeira busca — poupa redigitar. */
  sugestao: string;
  aoEscolher: (vinculo: VinculoCatalogo | null) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [termo, setTermo] = useState("");
  /**
   * O catalogo tem 248 mil materiais ativos para 2.9 mil servicos — 85 para 1.
   * Sem o filtro, quem procura "limpeza" como servico recebe frascos de solucao
   * de limpeza e nao acha o servico nenhuma pagina adiante.
   */
  const [tipo, setTipo] = useState<"material" | "servico">(valor?.tipo ?? "material");
  const [itens, setItens] = useState<ItemDoCatalogo[] | null>(null);
  const [aviso, setAviso] = useState("");
  const [buscando, setBuscando] = useState(false);

  const buscar = async (texto: string, tipoBusca: "material" | "servico" = tipo) => {
    setBuscando(true);
    setAviso("");
    try {
      const resposta = await fetch(
        `/api/catalogo?q=${encodeURIComponent(texto)}&tipo=${tipoBusca}`,
        { cache: "no-store" },
      );
      const corpo = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setAviso(corpo.error || `A API respondeu ${resposta.status}.`);
        setItens([]);
        return;
      }
      setItens(corpo.itens ?? []);
      if (corpo.aviso) setAviso(corpo.aviso);
    } finally {
      setBuscando(false);
    }
  };

  const abrir = () => {
    setAberto(true);
    // As primeiras palavras da especificacao costumam ser o nome do item; o
    // resto e detalhamento que estreita demais a busca.
    const inicial = sugestao.split(/[,;]/)[0].trim().slice(0, 60);
    setTermo(inicial);
    if (inicial.length >= 3) void buscar(inicial);
  };

  if (!aberto) {
    return (
      <div className="daddus-catalogo-celula">
        {valor ? (
          <button
            type="button"
            className="daddus-catalogo-chip"
            title={valor.descricao}
            onClick={editavel ? abrir : undefined}
            disabled={!editavel}
          >
            {valor.tipo === "material" ? "CATMAT" : "CATSER"} {valor.codigo}
          </button>
        ) : editavel ? (
          <button type="button" className="daddus-row-action" onClick={abrir}>
            <Link2 size={13} /> vincular
          </button>
        ) : (
          <span className="daddus-catalogo-vazio">-</span>
        )}
      </div>
    );
  }

  return (
    <div className="daddus-catalogo-busca">
      <div className="daddus-catalogo-tipos">
        {(["material", "servico"] as const).map((opcao) => (
          <button
            key={opcao}
            type="button"
            className={tipo === opcao ? "ativo" : ""}
            onClick={() => {
              setTipo(opcao);
              if (termo.trim().length >= 3) void buscar(termo, opcao);
            }}
          >
            {opcao === "material" ? "Material (CATMAT)" : "Servico (CATSER)"}
          </button>
        ))}
      </div>

      <div className="daddus-catalogo-linha">
        <input
          autoFocus
          value={termo}
          placeholder="papel sulfite a4"
          onChange={(evento) => setTermo(evento.target.value)}
          onKeyDown={(evento) => {
            if (evento.key === "Enter") {
              evento.preventDefault();
              void buscar(termo);
            }
            if (evento.key === "Escape") setAberto(false);
          }}
        />
        <button type="button" className="daddus-row-action" onClick={() => void buscar(termo)} disabled={buscando}>
          <Search size={13} /> {buscando ? "..." : "buscar"}
        </button>
        <button type="button" className="daddus-row-action" onClick={() => setAberto(false)}>
          <X size={13} /> fechar
        </button>
      </div>

      {aviso && <p className="daddus-catalogo-aviso">{aviso}</p>}

      {itens !== null && itens.length === 0 && !aviso && (
        <p className="daddus-catalogo-aviso">Nada encontrado. Tente menos palavras, ou o nome generico do item.</p>
      )}

      <ul className="daddus-catalogo-resultados">
        {(itens ?? []).map((achado) => (
          <li key={`${achado.tipo}-${achado.codigo}`}>
            <button
              type="button"
              onClick={() => {
                aoEscolher({ codigo: achado.codigo, tipo: achado.tipo, descricao: achado.descricao });
                setAberto(false);
              }}
            >
              <strong>{achado.tipo === "material" ? "CATMAT" : "CATSER"} {achado.codigo}</strong>
              <span>{achado.descricao}</span>
              {achado.classe && <small>{achado.classe}</small>}
            </button>
          </li>
        ))}
      </ul>

      {valor && (
        <button type="button" className="daddus-row-action" onClick={() => { aoEscolher(null); setAberto(false); }}>
          desvincular do catalogo
        </button>
      )}
    </div>
  );
}
