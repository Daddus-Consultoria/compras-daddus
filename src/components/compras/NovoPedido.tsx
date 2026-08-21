"use client";

import type { Sessao } from "@/lib/auth/sessao";
import { money, nomeCurtoSecretaria, type SecretariaInfo } from "@/lib/compras";
import type { Contrato } from "@/lib/contratos";
import { type SaldoItem } from "@/lib/pedidos";
import { AlertTriangle, Loader2, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

/**
 * Pedido de fornecimento: a secretaria escolhe o contrato e diz quanto precisa
 * de cada item. A coluna "disponivel" e o limite da tela — quem confere de
 * verdade e o servidor, com o contrato travado, porque entre abrir o formulario
 * e enviar cabe outro pedido.
 */
export function NovoPedido({
  contratos,
  contratoSugerido,
  secretarias,
  sessao,
  aoFechar,
}: {
  contratos: Contrato[];
  contratoSugerido?: string;
  secretarias: SecretariaInfo[];
  sessao: Sessao;
  aoFechar: () => void;
}) {
  const router = useRouter();
  const ativos = contratos.filter((contrato) => contrato.status === "ativo");
  const [contrato, setContrato] = useState(contratoSugerido ?? ativos[0]?.numero ?? "");
  const [saldo, setSaldo] = useState<SaldoItem[]>([]);
  // Ja nasce carregando quando o formulario abre com um contrato escolhido.
  const [carregando, setCarregando] = useState(Boolean(contratoSugerido ?? ativos[0]?.numero));
  const [quantidades, setQuantidades] = useState<Record<number, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    const escape = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") aoFechar();
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [aoFechar]);

  // Trocar de contrato zera o formulario no proprio evento; aqui fica so a
  // busca do saldo, que e o que depende de rede.
  useEffect(() => {
    if (!contrato) return;
    let vivo = true;
    fetch(`/api/contratos/${encodeURIComponent(contrato)}/saldo`, { cache: "no-store" })
      .then((resposta) => (resposta.ok ? resposta.json() : []))
      .then((dados) => {
        if (vivo) setSaldo(Array.isArray(dados) ? dados : []);
      })
      .catch(() => {
        if (vivo) setSaldo([]);
      })
      .finally(() => {
        if (vivo) setCarregando(false);
      });
    return () => {
      vivo = false;
    };
  }, [contrato]);

  const trocarContrato = (numero: string) => {
    setContrato(numero);
    setSaldo([]);
    setQuantidades({});
    setCarregando(Boolean(numero));
  };

  const escolhido = ativos.find((opcao) => opcao.numero === contrato) ?? null;
  const itensPedidos = saldo
    .map((item) => ({ item, quantidade: Number(String(quantidades[item.itemContratoId] ?? "").replace(",", ".")) || 0 }))
    .filter((linha) => linha.quantidade > 0);
  const total = itensPedidos.reduce((soma, linha) => soma + linha.quantidade * linha.item.valorUnitario, 0);
  const excedidos = itensPedidos.filter((linha) => linha.quantidade > linha.item.disponivel);

  const enviar = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    if (!itensPedidos.length) {
      setErro("Informe a quantidade de ao menos um item.");
      return;
    }
    setSalvando(true);
    setErro("");
    try {
      const resposta = await fetch("/api/pedidos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contrato,
          secretaria: dados.get("secretaria") || sessao.secretariaChave || "",
          justificativa: dados.get("justificativa") || "",
          entregaPrevista: dados.get("entregaPrevista") || null,
          itens: itensPedidos.map((linha) => ({ itemContratoId: linha.item.itemContratoId, quantidade: linha.quantidade })),
        }),
      });
      const corpo = (await resposta.json().catch(() => ({}))) as { numero?: string; error?: string };
      if (!resposta.ok) {
        setErro(corpo.error || "Nao foi possivel abrir o pedido.");
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

  return (
    <div className="daddus-modal-fundo" role="dialog" aria-modal="true" aria-label="Abrir pedido de fornecimento">
      <div className="daddus-modal daddus-modal-larga">
        <header>
          <div>
            <span className="daddus-overline">Execucao do contrato</span>
            <h3>Pedido de fornecimento</h3>
          </div>
          <button type="button" className="table-icon-button" onClick={aoFechar} aria-label="Fechar">
            <X size={16} />
          </button>
        </header>

        {erro && <div className="daddus-inline-warning"><AlertTriangle size={15} /> {erro}</div>}
        {!ativos.length && (
          <div className="daddus-inline-warning">
            <AlertTriangle size={15} /> Nenhum contrato ativo: o pedido so existe dentro de um contrato em vigencia.
          </div>
        )}

        <form onSubmit={enviar}>
          <div className="daddus-modal-linha">
            <label>
              Contrato
              <select value={contrato} onChange={(evento) => trocarContrato(evento.target.value)} required>
                <option value="">Selecione o contrato</option>
                {ativos.map((opcao) => (
                  <option key={opcao.numero} value={opcao.numero}>{opcao.numero} — {opcao.fornecedor}</option>
                ))}
              </select>
              <small>{escolhido ? escolhido.objeto || "Sem objeto informado" : "So contrato ativo aceita pedido."}</small>
            </label>
            <label>
              Secretaria
              {sessao.papel === "secretario" ? (
                <input value={nomeCurtoSecretaria(secretarias, sessao.secretariaChave)} disabled readOnly />
              ) : (
                <select name="secretaria" defaultValue="" required>
                  <option value="">Selecione a secretaria</option>
                  {secretarias.filter((secretaria) => secretaria.ativa).map((secretaria) => (
                    <option key={secretaria.chave} value={secretaria.chave}>{secretaria.nome}</option>
                  ))}
                </select>
              )}
              <small>Quem vai receber o fornecimento.</small>
            </label>
          </div>

          <label>
            Justificativa
            <textarea name="justificativa" rows={3} placeholder="Explique a necessidade: para que serve e por que agora." required />
          </label>

          <label>
            Entrega prevista
            <input name="entregaPrevista" placeholder="DD/MM/AAAA" inputMode="numeric" />
          </label>

          <div className="daddus-table-wrap">
            <table className="daddus-table">
              <thead>
                <tr><th>Item</th><th>Descricao</th><th>Un.</th><th>Disponivel</th><th>Valor un.</th><th>Quantidade</th></tr>
              </thead>
              <tbody>
                {saldo.map((item) => (
                  <tr key={item.itemContratoId} className={quantidades[item.itemContratoId] ? "daddus-linha-ativa" : ""}>
                    <td className="item-number">{item.item}</td>
                    <td>{item.descricao}</td>
                    <td>{item.unidade}</td>
                    <td>
                      {item.disponivel.toLocaleString("pt-BR")}
                      {item.emAnalise > 0 && <small>{item.emAnalise.toLocaleString("pt-BR")} em analise</small>}
                    </td>
                    <td>{money(item.valorUnitario)}</td>
                    <td>
                      <input
                        className="cell-input quantity"
                        type="number"
                        min="0"
                        max={item.disponivel}
                        step="0.001"
                        disabled={item.disponivel <= 0}
                        value={quantidades[item.itemContratoId] ?? ""}
                        aria-label={`Quantidade do item ${item.item}`}
                        onChange={(evento) =>
                          setQuantidades((atual) => ({ ...atual, [item.itemContratoId]: evento.target.value }))
                        }
                      />
                    </td>
                  </tr>
                ))}
                {!saldo.length && (
                  <tr>
                    <td colSpan={6} className="daddus-empty">
                      {carregando ? "Carregando o saldo do contrato..." : "Escolha um contrato para ver o saldo dos itens."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {excedidos.length > 0 && (
            <div className="daddus-inline-warning">
              <AlertTriangle size={15} />
              {excedidos.map((linha) => `item ${linha.item.item}: disponivel ${linha.item.disponivel}`).join("; ")}
            </div>
          )}

          <div className="daddus-modal-acoes">
            <span className="daddus-muted">
              {itensPedidos.length} {itensPedidos.length === 1 ? "item" : "itens"} · {money(total)}
            </span>
            <button type="button" className="daddus-secondary-button" onClick={aoFechar}>Cancelar</button>
            <button type="submit" className="daddus-primary-button" disabled={salvando || !itensPedidos.length || excedidos.length > 0}>
              {salvando ? <Loader2 size={15} className="daddus-girando" /> : <Plus size={15} />}
              {salvando ? "Enviando..." : "Enviar pedido"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
