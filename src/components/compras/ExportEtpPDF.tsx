"use client";

import { money, type PrefeituraConfig } from "@/lib/compras";
import type { Dfd } from "@/lib/dfd";
import { incisos, type Etp, type InstantaneoEtp } from "@/lib/etp";
import { assinatura, bloco, carregarLogo, desenharCabecalho, espacoPara, margem, numerarPaginas, vinho } from "@/lib/pdf/documento";
import autoTable from "jspdf-autotable";
import jsPDF from "jspdf";
import { FileDown } from "lucide-react";
import { useState } from "react";

type Tabela = jsPDF & { lastAutoTable?: { finalY: number } };

/**
 * O ETP em PDF, na ordem dos treze incisos do art. 18. Os incisos que o portal
 * apura (necessidade, quantidades, mercado e valor) saem do instantaneo quando
 * o estudo esta concluido, e do calculo vivo quando ainda e minuta — e a minuta
 * sai carimbada como tal, para ninguem juntar rascunho ao processo por engano.
 */
export function ExportEtpPDF({
  processo,
  objeto,
  etp,
  derivado,
  demanda,
  prefeitura,
  rotulo = "Baixar ETP",
}: {
  processo: string;
  objeto: string;
  etp: Etp;
  derivado: InstantaneoEtp;
  demanda: Dfd | null;
  prefeitura: PrefeituraConfig;
  rotulo?: string;
}) {
  const [gerando, setGerando] = useState(false);

  const exportar = async () => {
    setGerando(true);
    try {
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const logo = await carregarLogo(prefeitura.logoUrl);
      const minuta = etp.status !== "concluido";
      let y = desenharCabecalho(pdf, {
        prefeitura,
        logo,
        titulo: "ESTUDO TECNICO PRELIMINAR",
        base: "Lei 14.133/2021, art. 18 · IN SEGES/ME 58/2022",
      });

      autoTable(pdf, {
        startY: y,
        body: [
          ["Processo", `PE ${processo}`, "Situacao do estudo", minuta ? "MINUTA — em elaboracao" : "Concluido"],
          ["Objeto", objeto, "Demanda de origem", derivado.demanda ? `DFD ${derivado.demanda}` : "Sem DFD no portal"],
          [
            "Valor estimado",
            money(derivado.valorTotal),
            minuta ? "Ultima atualizacao" : "Concluido em",
            minuta ? etp.atualizadoEm : `${etp.concluidoEm ?? "-"} por ${etp.concluidoPor ?? "-"}`,
          ],
        ],
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: {
          0: { fontStyle: "bold", cellWidth: 26, fillColor: [248, 248, 248] },
          2: { fontStyle: "bold", cellWidth: 36, fillColor: [248, 248, 248] },
        },
        theme: "grid",
      });
      y = ((pdf as Tabela).lastAutoTable?.finalY || y) + 8;

      if (minuta) {
        y = bloco(pdf, {
          titulo: "AVISO",
          corpo:
            "Este documento e uma minuta: o estudo ainda nao foi concluido no portal e os numeros apurados podem mudar ate a assinatura. Nao deve ser juntado ao processo administrativo nesta condicao.",
          y,
        });
      }

      const conteudo: Record<string, string> = {
        I: derivado.necessidade,
        IV: derivado.quantidades,
        V: derivado.mercado,
        VI: derivado.valor,
      };

      for (const inciso of incisos) {
        const texto = inciso.campo ? String(etp[inciso.campo] ?? "") : conteudo[inciso.numero] ?? "";
        const vazio = inciso.obrigatorio
          ? "Nao preenchido."
          : "Inciso nao contemplado; ver a justificativa ao final, nos termos do art. 18, par. 2.";
        y = bloco(pdf, { titulo: `${inciso.numero}. ${inciso.titulo.toUpperCase()}`, corpo: texto, y, vazio });

        // As tabelas entram logo abaixo do inciso que elas sustentam.
        if (inciso.numero === "IV" && derivado.itens.length) {
          autoTable(pdf, {
            startY: espacoPara(pdf, y, 24),
            head: [["Item", "Descricao", "Un.", "Quantidade", "Memoria de calculo"]],
            body: derivado.itens.map((item) => [
              String(item.item),
              item.descricao,
              item.unidade,
              item.quantidade.toLocaleString("pt-BR"),
              item.memoria || "Quantidade consolidada das secretarias.",
            ]),
            styles: { fontSize: 7.5, cellPadding: 2 },
            headStyles: { fillColor: vinho },
            alternateRowStyles: { fillColor: [248, 248, 248] },
            columnStyles: { 0: { cellWidth: 11 }, 2: { cellWidth: 12 }, 3: { cellWidth: 22 }, 4: { cellWidth: 58 } },
            margin: { left: margem, right: margem },
          });
          y = ((pdf as Tabela).lastAutoTable?.finalY || y) + 7;
        }

        if (inciso.numero === "V" && derivado.fontes.length) {
          autoTable(pdf, {
            startY: espacoPara(pdf, y, 20),
            head: [["Fonte consultada", "Cotacoes consideradas"]],
            body: derivado.fontes.map((linha) => [linha.fonte, String(linha.consultas)]),
            styles: { fontSize: 7.5, cellPadding: 2 },
            headStyles: { fillColor: [90, 90, 96] },
            alternateRowStyles: { fillColor: [248, 248, 248] },
            columnStyles: { 1: { cellWidth: 40, halign: "right" } },
            margin: { left: margem, right: margem },
          });
          y = ((pdf as Tabela).lastAutoTable?.finalY || y) + 7;
        }

        if (inciso.numero === "VI" && derivado.itens.length) {
          autoTable(pdf, {
            startY: espacoPara(pdf, y, 24),
            head: [["Item", "Descricao", "Quantidade", "Cot.", "Preco unitario", "Valor total"]],
            body: derivado.itens.map((item) => [
              String(item.item),
              item.descricao,
              item.quantidade.toLocaleString("pt-BR"),
              String(item.cotacoes),
              money(item.valorUnitario),
              money(item.total),
            ]),
            foot: [["", "VALOR TOTAL ESTIMADO", "", "", "", money(derivado.valorTotal)]],
            styles: { fontSize: 7.5, cellPadding: 2 },
            headStyles: { fillColor: vinho },
            footStyles: { fillColor: [240, 240, 242], textColor: [20, 20, 20], fontStyle: "bold" },
            alternateRowStyles: { fillColor: [248, 248, 248] },
            columnStyles: { 0: { cellWidth: 11 }, 2: { cellWidth: 20 }, 3: { cellWidth: 11 }, 4: { cellWidth: 27 }, 5: { cellWidth: 27 } },
            margin: { left: margem, right: margem },
          });
          y = ((pdf as Tabela).lastAutoTable?.finalY || y) + 7;
        }
      }

      if (etp.omissoes.trim()) {
        y = bloco(pdf, {
          titulo: "JUSTIFICATIVA DOS INCISOS NAO CONTEMPLADOS (ART. 18, PAR. 2)",
          corpo: etp.omissoes,
          y,
        });
      }

      if (demanda?.numero) {
        y = bloco(pdf, {
          titulo: "DOCUMENTO DE ORIGEM",
          corpo: `Este estudo tem por base o DFD ${demanda.numero}, formalizado pela ${demanda.secretariaNome} em ${demanda.criadoEm}${demanda.origemItens ? `. ${demanda.origemItens}` : "."}`,
          y,
        });
      }

      y = assinatura(pdf, {
        y,
        emitidoPor: etp.concluidoPor ?? etp.autor ?? "Setor de Compras",
        cargo: "Responsavel pelo Setor de Compras",
      });
      numerarPaginas(
        pdf,
        `ETP · PE ${processo}${minuta ? " · MINUTA" : ` · concluido em ${etp.concluidoEm ?? "-"}`} · ${prefeitura.nome || "Prefeitura Municipal"}`,
      );
      pdf.save(`etp-${processo}${minuta ? "-minuta" : ""}.pdf`);
    } finally {
      setGerando(false);
    }
  };

  return (
    <button type="button" className="daddus-secondary-button" onClick={exportar} disabled={gerando}>
      <FileDown size={15} /> {gerando ? "Gerando..." : rotulo}
    </button>
  );
}
