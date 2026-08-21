"use client";

import type { PrefeituraConfig } from "@/lib/compras";
import { solicitacaoStatusLabels } from "@/lib/compras";
import { prioridadeLabels, type Dfd } from "@/lib/dfd";
import { assinatura, bloco, carregarLogo, desenharCabecalho, espacoPara, margem, numerarPaginas, vinho } from "@/lib/pdf/documento";
import autoTable from "jspdf-autotable";
import jsPDF from "jspdf";
import { FileDown } from "lucide-react";
import { useState } from "react";

/**
 * O DFD em PDF, do jeito que e juntado ao processo: identificacao, necessidade,
 * itens com memoria de calculo e a assinatura de quem respondeu pela demanda.
 */
export function ExportDfdPDF({ dfd, prefeitura, rotulo = "Baixar DFD" }: { dfd: Dfd; prefeitura: PrefeituraConfig; rotulo?: string }) {
  const [gerando, setGerando] = useState(false);

  const exportar = async () => {
    setGerando(true);
    try {
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const logo = await carregarLogo(prefeitura.logoUrl);
      let y = desenharCabecalho(pdf, {
        prefeitura,
        logo,
        titulo: "DOCUMENTO DE FORMALIZACAO DA DEMANDA",
        base: "Lei 14.133/2021, art. 12, VII · subsidia o Estudo Tecnico Preliminar (art. 18)",
      });

      autoTable(pdf, {
        startY: y,
        body: [
          ["DFD n.", dfd.numero, "Unidade requisitante", dfd.secretariaNome],
          ["Aberta em", dfd.criadoEm, "Responsavel pela demanda", dfd.responsavel || dfd.autor || "-"],
          ["Prioridade", prioridadeLabels[dfd.prioridade], "Data pretendida", dfd.dataPretendida ?? "Nao informada"],
          ["Previsao no PCA", dfd.previsaoPca ? "Sim" : "Nao declarada", "Situacao", solicitacaoStatusLabels[dfd.status]],
          ["Processo vinculado", dfd.processo ? `PE ${dfd.processo}` : "Ainda nao gerado", "Itens", String(dfd.itens.length)],
        ],
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: {
          0: { fontStyle: "bold", cellWidth: 34, fillColor: [248, 248, 248] },
          2: { fontStyle: "bold", cellWidth: 38, fillColor: [248, 248, 248] },
        },
        theme: "grid",
      });
      y = ((pdf as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || y) + 8;

      y = bloco(pdf, { titulo: "1. OBJETO DA DEMANDA", corpo: dfd.objeto, y });
      y = bloco(pdf, { titulo: "2. JUSTIFICATIVA DA NECESSIDADE", corpo: dfd.justificativa, y });
      y = bloco(pdf, {
        titulo: "3. RESULTADOS PRETENDIDOS",
        corpo: dfd.resultados,
        y,
        vazio: "Nao informados pela unidade requisitante.",
      });
      y = bloco(pdf, {
        titulo: "4. CONTRATACOES CORRELATAS OU INTERDEPENDENTES",
        corpo: dfd.vinculacao,
        y,
        vazio: "Nao ha vinculacao declarada com outra contratacao.",
      });

      y = espacoPara(pdf, y, 30);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9.5);
      pdf.setTextColor(...vinho);
      pdf.text("5. ITENS E MEMORIA DE CALCULO", margem, y);
      pdf.setTextColor(20, 20, 20);
      autoTable(pdf, {
        startY: y + 3,
        head: [["Item", "Descricao", "Un.", "Quantidade", "Memoria de calculo"]],
        body: dfd.itens.length
          ? dfd.itens.map((item) => [
              String(item.item),
              item.descricao,
              item.unidade,
              item.quantidade.toLocaleString("pt-BR"),
              item.memoria || "-",
            ])
          : [["-", "Nenhum item quantificado nesta demanda.", "-", "-", "-"]],
        styles: { fontSize: 7.5, cellPadding: 2 },
        headStyles: { fillColor: vinho },
        alternateRowStyles: { fillColor: [248, 248, 248] },
        columnStyles: { 0: { cellWidth: 11 }, 2: { cellWidth: 12 }, 3: { cellWidth: 22 }, 4: { cellWidth: 62 } },
        margin: { left: margem, right: margem },
      });
      y = ((pdf as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || y) + 8;

      if (dfd.origemItens) {
        y = bloco(pdf, { titulo: "6. ORIGEM DOS DADOS", corpo: dfd.origemItens, y });
      }

      y = assinatura(pdf, {
        y,
        emitidoPor: dfd.autor ?? dfd.secretariaNome,
        cargo: `Responsavel pela demanda — ${dfd.secretariaNome}`,
      });
      numerarPaginas(pdf, `DFD ${dfd.numero} · ${prefeitura.nome || "Prefeitura Municipal"}`);
      pdf.save(`dfd-${dfd.numero.replace("/", "-")}.pdf`);
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
