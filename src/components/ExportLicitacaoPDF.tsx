"use client";

import type { LoteItem, PrefeituraConfig, Processo } from "@/lib/compras";
import { itemAverage, itemTotalQuantity, loteTotal, money } from "@/lib/compras";
import { FileDown } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const margem = 14;
const larguraUtil = 269;

export function ExportLicitacaoPDF({ items, prefeitura, processo, notas }: { items: LoteItem[]; prefeitura: PrefeituraConfig; processo: Processo; notas: string }) {
  const exportPdf = () => {
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    pdf.setTextColor(20, 20, 20);
    pdf.setFontSize(10);
    pdf.text(prefeitura.estado || "UF", margem, 14);
    pdf.setFontSize(14);
    pdf.setFont("helvetica", "bold");
    pdf.text(prefeitura.nome || "PREFEITURA MUNICIPAL", margem, 21);
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");
    pdf.text("SETOR DE COMPRAS / ORCAMENTOS", margem, 28);
    pdf.text(`CNPJ: ${prefeitura.cnpj || "Nao informado"}`, margem, 34);
    pdf.setDrawColor(160, 160, 160);
    pdf.line(margem, 39, 283, 39);

    pdf.setFont("helvetica", "bold");
    pdf.text("MAPA DE COMPOSICAO E COTACOES", margem, 48);
    pdf.setFont("helvetica", "normal");
    pdf.text(`Processo: PE ${processo.id}`, margem, 55);
    pdf.text(`Objeto: ${processo.objeto}`, margem, 61, { maxWidth: larguraUtil });
    pdf.text(`Solicitante: ${processo.solicitante}`, margem, 67);
    pdf.text(`Prazo limite: ${processo.prazoLimite}`, 150, 55);
    pdf.text(`Status: ${processo.status}`, 150, 61);

    autoTable(pdf, {
      startY: 74,
      head: [["Item", "Especificacao detalhada", "Un.", "Educacao", "Saude", "Assist. Social", "Administracao", "Qtd. total", "BNC", "PNCP", "Mercado", "Valor medio", "Valor total"]],
      body: items.map((item) => [
        item.item,
        item.especificacao,
        item.unidade,
        item.quantidades.educacao,
        item.quantidades.saude,
        item.quantidades.assistencia,
        item.quantidades.administracao,
        itemTotalQuantity(item),
        money(item.cotacoes.bnc),
        money(item.cotacoes.pncp),
        money(item.cotacoes.mercado),
        money(itemAverage(item)),
        money(itemAverage(item) * itemTotalQuantity(item)),
      ]),
      foot: [["", "Valor total estimado do lote", "", "", "", "", "", "", "", "", "", "", money(loteTotal(items))]],
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [150, 24, 48] },
      footStyles: { fillColor: [240, 240, 242], textColor: [20, 20, 20], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 248, 248] },
    });

    let cursorY = ((pdf as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 170) + 12;
    // A folha A4 deitada tem 210 mm: sem espaco para o rodape, abre uma nova pagina.
    if (cursorY > 160) {
      pdf.addPage();
      cursorY = 30;
    }

    pdf.setFontSize(9);
    const comentarios = pdf.splitTextToSize(`Comentarios do processo: ${notas || "Nenhum comentario registrado."}`, larguraUtil) as string[];
    pdf.text(comentarios, margem, cursorY);
    cursorY += comentarios.length * 5 + 6;
    pdf.text(`Emitido em ${new Date().toLocaleDateString("pt-BR")}`, margem, cursorY);
    pdf.line(205, cursorY + 5, 270, cursorY + 5);
    pdf.text("Responsavel por Compras", 220, cursorY + 11);
    pdf.save(`mapa-licitacao-${processo.id}.pdf`);
  };

  return <button type="button" className="daddus-secondary-button" onClick={exportPdf}><FileDown size={16} /> Exportar PDF oficial</button>;
}
