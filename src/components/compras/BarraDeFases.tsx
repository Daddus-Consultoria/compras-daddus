"use client";

import {
  fasesNaCpl,
  fasesEmOrdem,
  processoStatusLabels,
  statusDescricoes,
  type ProcessoStatus,
} from "@/lib/compras";
import { UserRound } from "lucide-react";

/**
 * A trilha do processo, da elaboracao ao encerramento. Fica no topo do lote
 * porque a primeira pergunta de quem abre um processo nunca e "quais itens?",
 * e sim "onde isso esta e de quem e a bola agora?".
 *
 * "cancelado" nao entra na trilha: e uma saida, nao uma etapa. Quando o
 * processo esta cancelado a trilha para no ponto em que parou e o aviso
 * abaixo dela conta o que aconteceu.
 */
const trilha: ProcessoStatus[] = fasesEmOrdem.filter((fase) => fase !== "cancelado");

/**
 * Quem esta com a bola. Vale fasesNaCpl e nao fasesConduzidasPelaCpl porque o
 * mapa ja enviado tambem esta com a comissao: o lote fica so para leitura ate
 * ela receber. Quem olha a trilha quer saber onde a coisa esta parada, nao de
 * quem foi o ultimo clique.
 */
function conduzidaPelaCpl(fase: ProcessoStatus) {
  return fasesNaCpl.includes(fase);
}

/** As faixas acima da trilha: quantas etapas seguidas cada lado conduz. */
function faixas() {
  const blocos: { dono: "compras" | "cpl"; etapas: number }[] = [];
  for (const fase of trilha) {
    const dono = conduzidaPelaCpl(fase) ? "cpl" : "compras";
    const ultimo = blocos[blocos.length - 1];
    if (ultimo?.dono === dono) ultimo.etapas += 1;
    else blocos.push({ dono, etapas: 1 });
  }
  return blocos;
}

export function BarraDeFases({
  status,
  acoes,
}: {
  status: ProcessoStatus;
  /** Botoes de tramite e de cancelamento, que pertencem a fase atual. */
  acoes?: React.ReactNode;
}) {
  const cancelado = status === "cancelado";
  const atual = trilha.indexOf(status);
  const donoAtual = conduzidaPelaCpl(status) ? "cpl" : "compras";

  return (
    <section className="daddus-fases" aria-label="Fases do processo">
      <div className="daddus-fases-top">
        <strong>Onde o processo esta</strong>
        <span className={`daddus-status ${cancelado ? "gray" : donoAtual === "cpl" ? "blue" : "yellow"}`}>
          {processoStatusLabels[status]}
        </span>
        {!cancelado && (
          <span className={`daddus-fases-quem ${donoAtual}`}>
            <UserRound size={14} />
            conduzido {donoAtual === "cpl" ? "pela " : "pelo "}
            <strong>{donoAtual === "cpl" ? "CPL" : "Setor de Compras"}</strong>
          </span>
        )}
      </div>

      <div className="daddus-lanes" aria-hidden>
        {faixas().map((bloco, indice) => (
          <span key={`${bloco.dono}-${indice}`} className={`daddus-lane ${bloco.dono}`} style={{ flex: bloco.etapas }}>
            {bloco.dono === "cpl" ? "CPL" : "Setor de Compras"}
          </span>
        ))}
      </div>

      <ol className="daddus-track">
        {trilha.map((fase, indice) => {
          const feita = !cancelado && atual >= 0 && indice < atual;
          const agora = fase === status;
          const classes = [
            "daddus-step",
            conduzidaPelaCpl(fase) ? "cpl" : "",
            feita ? "feita" : "",
            agora ? "agora" : "",
          ].filter(Boolean).join(" ");
          return (
            <li key={fase} className={classes} aria-current={agora ? "step" : undefined}>
              <i aria-hidden />
              <span>{processoStatusLabels[fase]}</span>
            </li>
          );
        })}
      </ol>

      <div className="daddus-fase-nota">
        <p>{statusDescricoes[status]}</p>
        {acoes && <div className="daddus-fase-acoes">{acoes}</div>}
      </div>
    </section>
  );
}
