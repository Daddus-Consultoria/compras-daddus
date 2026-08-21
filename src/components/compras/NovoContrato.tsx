"use client";

import { contratoStatusEmOrdem, contratoStatusLabels } from "@/lib/contratos";
import type { Processo } from "@/lib/compras";
import { AlertTriangle, Loader2, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

async function sugerirNumero() {
  try {
    const resposta = await fetch("/api/contratos?sugerirNumero=1", { cache: "no-store" });
    if (!resposta.ok) return "";
    const corpo = (await resposta.json()) as { numero?: string };
    return corpo.numero ?? "";
  } catch {
    return "";
  }
}

/**
 * Cadastro do contrato que voltou da CPL. Escolhido o processo de origem, os
 * itens do lote ja entram preenchidos com a quantidade consolidada e o preco de
 * referencia — corrigir tres numeros e mais rapido que digitar trinta.
 */
export function NovoContrato({
  processos,
  processoSugerido,
  aoFechar,
}: {
  processos: Processo[];
  processoSugerido?: string;
  aoFechar: () => void;
}) {
  const router = useRouter();
  const [numero, setNumero] = useState("");
  const [processo, setProcesso] = useState(processoSugerido ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let vivo = true;
    sugerirNumero().then((sugestao) => {
      if (vivo) setNumero(sugestao);
    });
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    const escape = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") aoFechar();
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [aoFechar]);

  const origem = processos.find((opcao) => opcao.id === processo) ?? null;

  const criar = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    setSalvando(true);
    setErro("");
    try {
      const resposta = await fetch("/api/contratos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numero: dados.get("numero"),
          fornecedor: dados.get("fornecedor"),
          cnpjFornecedor: dados.get("cnpjFornecedor") || "",
          objeto: dados.get("objeto") || "",
          vigenciaInicio: dados.get("vigenciaInicio") || null,
          vigenciaFim: dados.get("vigenciaFim") || null,
          documento: dados.get("documento") || "",
          status: dados.get("status") || "ativo",
          processo: dados.get("processo") || null,
          copiarItens: dados.get("copiarItens") === "on",
        }),
      });
      const corpo = (await resposta.json().catch(() => ({}))) as { numero?: string; error?: string };
      if (!resposta.ok) {
        setErro(corpo.error || "Nao foi possivel cadastrar o contrato.");
        return;
      }
      router.push(`/painel/compras/contrato/${encodeURIComponent(corpo.numero ?? "")}`);
    } catch {
      setErro("Falha de conexao com o servidor.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="daddus-modal-fundo" role="dialog" aria-modal="true" aria-label="Cadastrar contrato">
      <div className="daddus-modal">
        <header>
          <div>
            <span className="daddus-overline">Setor de Compras</span>
            <h3>Cadastrar contrato</h3>
          </div>
          <button type="button" className="table-icon-button" onClick={aoFechar} aria-label="Fechar">
            <X size={16} />
          </button>
        </header>

        {erro && (
          <div className="daddus-inline-warning">
            <AlertTriangle size={15} /> {erro}
          </div>
        )}

        <form onSubmit={criar}>
          <div className="daddus-modal-linha">
            <label>
              Numero do contrato
              <input name="numero" value={numero} onChange={(evento) => setNumero(evento.target.value)} placeholder="015/2026" required />
            </label>
            <label>
              Situacao
              <select name="status" defaultValue="ativo">
                {contratoStatusEmOrdem.map((opcao) => (
                  <option key={opcao} value={opcao}>{contratoStatusLabels[opcao]}</option>
                ))}
              </select>
            </label>
          </div>

          <label>
            Processo de origem
            <select name="processo" value={processo} onChange={(evento) => setProcesso(evento.target.value)}>
              <option value="">Sem processo no portal</option>
              {processos.map((opcao) => (
                <option key={opcao.id} value={opcao.id}>{opcao.id} — {opcao.objeto}</option>
              ))}
            </select>
            <small>
              {origem
                ? `${origem.itens.length} ${origem.itens.length === 1 ? "item no lote" : "itens no lote"}, prontos para virar itens do contrato.`
                : "Use para contrato herdado, de antes do portal."}
            </small>
          </label>

          {origem && (
            <label className="daddus-checkbox">
              <input type="checkbox" name="copiarItens" defaultChecked />
              Trazer os itens do lote com quantidade e preco de referencia
            </label>
          )}

          <div className="daddus-modal-linha">
            <label>
              Fornecedor
              <input name="fornecedor" defaultValue="" placeholder="Empresa XYZ LTDA" required />
            </label>
            <label>
              CNPJ
              <input name="cnpjFornecedor" placeholder="00.000.000/0001-00" />
            </label>
          </div>

          <label>
            Objeto
            <textarea name="objeto" defaultValue={origem?.objeto ?? ""} placeholder="Aquisicao de generos alimenticios" />
          </label>

          <div className="daddus-modal-linha">
            <label>
              Inicio da vigencia
              <input name="vigenciaInicio" placeholder="DD/MM/AAAA" inputMode="numeric" />
            </label>
            <label>
              Fim da vigencia
              <input name="vigenciaFim" placeholder="DD/MM/AAAA" inputMode="numeric" />
            </label>
          </div>

          <label>
            Documento
            <input name="documento" placeholder="Numero do instrumento, ata ou publicacao" />
          </label>

          <div className="daddus-modal-acoes">
            <button type="button" className="daddus-secondary-button" onClick={aoFechar}>Cancelar</button>
            <button type="submit" className="daddus-primary-button" disabled={salvando}>
              {salvando ? <Loader2 size={15} className="daddus-girando" /> : <Plus size={15} />}
              {salvando ? "Cadastrando..." : "Cadastrar contrato"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
