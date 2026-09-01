"use client";

import { money } from "@/lib/compras";
import {
  limiteDeAlerta,
  pedidoStatusLabels,
  reservaSaldo,
  pedidoTone,
  percentualExecutado,
  saldoCritico,
  totalContratado,
  totalDoSaldo,
  totalExecutado,
  valorDoPedido,
  type Pedido,
  type SaldoItem,
} from "@/lib/pedidos";
import { AlertTriangle, ArrowUpRight, PackageCheck } from "lucide-react";
import Link from "next/link";

function porcentagem(valor: number) {
  return `${(valor * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

/**
 * O saldo do contrato, aberto item a item. Nenhum destes numeros e digitado:
 * "autorizada" e a soma dos pedidos autorizados e "saldo" e o que sobra do
 * contratado. Por isso a coluna nao tem campo de edicao — corrigir saldo se faz
 * estornando o pedido que o consumiu.
 */
export function SaldoDoContrato({ saldo, pedidos }: { saldo: SaldoItem[]; pedidos: Pedido[] }) {
  const contratado = totalContratado(saldo);
  const executado = totalExecutado(saldo);
  const disponivel = totalDoSaldo(saldo);
  const consumo = percentualExecutado(saldo);
  // Pendente e conferido: os dois seguram quantidade sem terem baixado saldo.
  const emAnalise = pedidos.filter((pedido) => reservaSaldo(pedido.status));

  return (
    <>
      <div className="daddus-editor-toolbar">
        <div>
          <strong>Saldo do contrato</strong>
          <span>
            {money(executado)} executados de {money(contratado)} ({porcentagem(consumo)}) · {money(disponivel)} de saldo
          </span>
        </div>
        <div className="daddus-heading-actions">
          <Link href="/painel/compras/pedidos" className="daddus-secondary-button">
            <PackageCheck size={15} /> Pedidos de fornecimento
          </Link>
        </div>
      </div>

      {saldoCritico(saldo) && (
        <div className="daddus-inline-warning">
          <AlertTriangle size={16} />
          O contrato ja consumiu {porcentagem(consumo)} do valor contratado (alerta a partir de {porcentagem(limiteDeAlerta)}).
          Decida entre aditivo e novo processo antes que a secretaria fique sem fornecimento.
        </div>
      )}

      <div className="daddus-editor-card">
        <div className="daddus-table-wrap">
          <table className="daddus-table">
            <thead>
              <tr>
                <th>Item</th><th>Descricao</th><th>Un.</th><th>Contratada</th><th>Autorizada</th>
                <th>Em analise</th><th>Saldo</th><th>Valor do saldo</th>
              </tr>
            </thead>
            <tbody>
              {saldo.map((item) => (
                <tr key={item.itemContratoId}>
                  <td className="item-number">{item.item}</td>
                  <td>{item.descricao}</td>
                  <td>{item.unidade}</td>
                  <td>{item.contratada.toLocaleString("pt-BR")}</td>
                  <td>{item.autorizada.toLocaleString("pt-BR")}</td>
                  <td>{item.emAnalise ? item.emAnalise.toLocaleString("pt-BR") : "-"}</td>
                  <td>
                    <strong>{item.saldo.toLocaleString("pt-BR")}</strong>
                    {item.saldo <= 0 && <small>esgotado</small>}
                  </td>
                  <td className="calculated total">{money(item.saldo * item.valorUnitario)}</td>
                </tr>
              ))}
              {!saldo.length && (
                <tr><td colSpan={8} className="daddus-empty">Sem itens contratados: o saldo comeca quando o contrato tem itens.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="daddus-editor-toolbar">
        <div>
          <strong>Pedidos deste contrato</strong>
          <span>
            {pedidos.length} {pedidos.length === 1 ? "pedido registrado" : "pedidos registrados"}
            {emAnalise.length ? ` · ${emAnalise.length} em analise` : ""}
          </span>
        </div>
      </div>

      <div className="daddus-editor-card">
        <div className="daddus-table-wrap">
          <table className="daddus-table">
            <thead>
              <tr><th>Pedido</th><th>Secretaria</th><th>Itens</th><th>Valor</th><th>Situacao</th><th /></tr>
            </thead>
            <tbody>
              {pedidos.map((pedido) => (
                <tr key={pedido.id}>
                  <td><strong>{pedido.numero}</strong><small>{pedido.criadoEm}</small></td>
                  <td>{pedido.secretariaNome}</td>
                  <td>{pedido.itens.length}</td>
                  <td>{money(valorDoPedido(pedido))}</td>
                  <td><span className={`daddus-status ${pedidoTone(pedido.status)}`}>{pedidoStatusLabels[pedido.status]}</span></td>
                  <td>
                    <Link href="/painel/compras/pedidos" className="daddus-row-action">Abrir <ArrowUpRight size={14} /></Link>
                  </td>
                </tr>
              ))}
              {!pedidos.length && (
                <tr><td colSpan={6} className="daddus-empty">Nenhum pedido de fornecimento neste contrato.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
