"use client";

import { CampoData } from "@/components/compras/CampoData";
import { money } from "@/lib/compras";
import { empenhoEsgotado, type Empenho } from "@/lib/empenhos";
import { valorDoPedido, type Pedido } from "@/lib/pedidos";
import { AlertTriangle, Loader2, Receipt, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

/**
 * A nota de empenho do pedido.
 *
 * Quem emite a nota e a Financa, fora do portal; aqui o Setor de Compras
 * registra o numero emitido. Duas saidas na mesma tela porque as duas praticas
 * existem: aproveitar uma nota estimativa que ja cobre o contrato, ou lancar a
 * nota que acabou de ser emitida para este fornecimento.
 *
 * A tela mostra o saldo de cada nota e barra a que nao cobre o pedido, mas quem
 * decide e o servidor, com a nota travada: entre abrir o formulario e enviar
 * cabe outro pedido tomando o mesmo saldo.
 */
export function EmpenhoDoPedido({
  pedido,
  acao,
  aoFechar,
}: {
  pedido: Pedido;
  acao: "empenhar" | "corrigir-empenho";
  aoFechar: () => void;
}) {
  const router = useRouter();
  const valor = valorDoPedido(pedido);
  const [empenhos, setEmpenhos] = useState<Empenho[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [novo, setNovo] = useState(false);
  const [escolhido, setEscolhido] = useState<number | "">("");
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const trocando = acao === "corrigir-empenho";

  useEffect(() => {
    const escape = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") aoFechar();
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [aoFechar]);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/empenhos?contrato=${encodeURIComponent(pedido.contrato)}`, { cache: "no-store" })
      .then((resposta) => (resposta.ok ? resposta.json() : []))
      .then((dados: Empenho[]) => {
        if (!vivo) return;
        const lista = Array.isArray(dados) ? dados : [];
        setEmpenhos(lista);
        // Sem nota com saldo para este pedido, a unica saida e cadastrar: a
        // tela ja abre nesse caminho em vez de mostrar um select vazio.
        const cabe = lista.filter((nota) => nota.saldo + 1e-9 >= valor && nota.id !== pedido.empenhoId);
        setNovo(!cabe.length);
        setEscolhido(cabe[0]?.id ?? "");
      })
      .catch(() => {
        if (vivo) setNovo(true);
      })
      .finally(() => {
        if (vivo) setCarregando(false);
      });
    return () => {
      vivo = false;
    };
  }, [pedido.contrato, pedido.empenhoId, valor]);

  const enviar = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const form = evento.currentTarget;
    const dados = new FormData(form);
    setSalvando(true);
    setErro("");
    try {
      let empenhoId = escolhido;
      if (novo) {
        const resposta = await fetch("/api/empenhos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contrato: pedido.contrato,
            numero: dados.get("numero"),
            valor: dados.get("valor"),
            dataEmissao: dados.get("dataEmissao"),
            observacao: dados.get("observacao"),
          }),
        });
        const corpo = (await resposta.json().catch(() => ({}))) as { id?: number; error?: string };
        if (!resposta.ok) {
          setErro(corpo.error || `A API respondeu ${resposta.status}.`);
          return;
        }
        empenhoId = corpo.id!;
      }
      if (!empenhoId) {
        setErro("Escolha a nota de empenho da despesa.");
        return;
      }

      const resposta = await fetch(`/api/pedidos/${pedido.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao, empenhoId, motivo }),
      });
      const corpo = (await resposta.json().catch(() => ({}))) as { error?: string };
      if (!resposta.ok) {
        setErro(corpo.error || `A API respondeu ${resposta.status}.`);
        return;
      }
      aoFechar();
      router.refresh();
    } catch {
      setErro("Falha de conexao com o servidor.");
    } finally {
      setSalvando(false);
    }
  };

  const disponiveis = empenhos.filter((nota) => nota.id !== pedido.empenhoId);

  return (
    <div className="daddus-modal-fundo" role="dialog" aria-modal="true" aria-label="Nota de empenho do pedido">
      <div className="daddus-modal">
        <header>
          <div>
            <span className="daddus-overline">Pedido {pedido.numero} · {money(valor)}</span>
            <h3>{trocando ? "Trocar a nota de empenho" : "Empenho da despesa"}</h3>
          </div>
          <button type="button" className="table-icon-button" onClick={aoFechar} aria-label="Fechar">
            <X size={16} />
          </button>
        </header>

        {erro && <div className="daddus-inline-warning"><AlertTriangle size={15} /> {erro}</div>}

        <form onSubmit={enviar}>
          <p className="daddus-muted">
            A nota e emitida pela Financa; aqui entra o numero emitido. Sem empenho o ordenador nao autoriza a despesa.
          </p>

          {!carregando && disponiveis.length > 0 && (
            <label className="daddus-checkbox">
              <input type="checkbox" checked={novo} onChange={(evento) => setNovo(evento.target.checked)} />
              Lancar uma nota nova, em vez de usar uma ja registrada
            </label>
          )}

          {novo ? (
            <>
              <div className="daddus-modal-linha">
                <label>
                  Numero da nota
                  <input name="numero" placeholder="2026NE000431" required />
                  <small>Unico no municipio: duas notas com o mesmo codigo sao a mesma nota.</small>
                </label>
                <label>
                  Valor empenhado (R$)
                  <input name="valor" inputMode="decimal" defaultValue={valor.toFixed(2).replace(".", ",")} required />
                  <small>Pode cobrir mais de um pedido do contrato.</small>
                </label>
              </div>
              <div className="daddus-modal-linha">
                <label>
                  Data de emissao
                  <CampoData name="dataEmissao" />
                </label>
                <label>
                  Observacao
                  <input name="observacao" placeholder="Dotacao, elemento de despesa, o que ajudar a achar a nota" />
                </label>
              </div>
            </>
          ) : (
            <label>
              Nota de empenho
              <select value={escolhido} onChange={(evento) => setEscolhido(Number(evento.target.value) || "")} required>
                <option value="">Selecione a nota</option>
                {disponiveis.map((nota) => (
                  <option key={nota.id} value={nota.id} disabled={nota.saldo + 1e-9 < valor}>
                    {nota.numero} — saldo {money(nota.saldo)} de {money(nota.valor)}
                    {empenhoEsgotado(nota) ? " (esgotada)" : ""}
                  </option>
                ))}
              </select>
              <small>
                {carregando
                  ? "Carregando as notas do contrato..."
                  : "Nota sem saldo para este pedido aparece desabilitada."}
              </small>
            </label>
          )}

          {trocando && (
            <label>
              Motivo da troca
              <textarea
                rows={2}
                value={motivo}
                onChange={(evento) => setMotivo(evento.target.value)}
                placeholder="Por que a nota anterior nao serve. Fica registrado no historico da nota."
                required
              />
            </label>
          )}

          <div className="daddus-modal-acoes">
            <span className="daddus-muted">
              {pedido.empenho ? `Hoje na nota ${pedido.empenho}` : "Sem nota vinculada"}
            </span>
            <button type="button" className="daddus-secondary-button" onClick={aoFechar}>Cancelar</button>
            <button type="submit" className="daddus-primary-button" disabled={salvando}>
              {salvando ? <Loader2 size={15} className="daddus-girando" /> : <Receipt size={15} />}
              {salvando ? "Gravando..." : trocando ? "Trocar a nota" : "Empenhar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
