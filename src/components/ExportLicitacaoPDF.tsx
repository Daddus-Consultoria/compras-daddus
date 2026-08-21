"use client";

import {
  cotacoesValidas,
  fonteLabels,
  itemTotalQuantity,
  loteTotal,
  metodoLabels,
  money,
  nomeSecretaria,
  precoUnitario,
  processoStatusLabels,
  type LoteItem,
  type PrefeituraConfig,
  type Processo,
  type SecretariaInfo,
} from "@/lib/compras";
import { FileDown } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useState } from "react";

const margem = 14;
const larguraUtil = 269;
const vinho: [number, number, number] = [150, 24, 48];

/**
 * Busca a logo da prefeitura e devolve algo que o jsPDF aceite. SVG fica de
 * fora porque o jsPDF nao rasteriza vetor; nesse caso o cabecalho sai sem
 * brasao, em vez de quebrar a emissao do documento.
 */
async function carregarLogo(url: string) {
  if (!url) return null;
  try {
    const resposta = await fetch(url);
    if (!resposta.ok) return null;
    const blob = await resposta.blob();
    if (!["image/png", "image/jpeg"].includes(blob.type)) return null;
    const dataUrl = await new Promise<string>((resolver, rejeitar) => {
      const leitor = new FileReader();
      leitor.onload = () => resolver(String(leitor.result));
      leitor.onerror = rejeitar;
      leitor.readAsDataURL(blob);
    });
    const dimensoes = await new Promise<{ largura: number; altura: number }>((resolver, rejeitar) => {
      const imagem = new Image();
      imagem.onload = () => resolver({ largura: imagem.naturalWidth, altura: imagem.naturalHeight });
      imagem.onerror = rejeitar;
      imagem.src = dataUrl;
    });
    return { dataUrl, formato: blob.type === "image/png" ? "PNG" : "JPEG", ...dimensoes };
  } catch {
    return null;
  }
}

export function ExportLicitacaoPDF({
  items,
  prefeitura,
  processo,
  secretarias,
  notas,
}: {
  items: LoteItem[];
  prefeitura: PrefeituraConfig;
  processo: Processo;
  secretarias: SecretariaInfo[];
  notas: string;
}) {
  const [gerando, setGerando] = useState(false);
  const metodo = processo.metodoPreco;

  const exportPdf = async () => {
    setGerando(true);
    try {
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const logo = await carregarLogo(prefeitura.logoUrl);

      // ---------- cabecalho institucional ----------
      let textoX = margem;
      if (logo) {
        const alturaLogo = 16;
        const larguraLogo = Math.min(40, (logo.largura / logo.altura) * alturaLogo);
        pdf.addImage(logo.dataUrl, logo.formato, margem, 10, larguraLogo, alturaLogo);
        textoX = margem + larguraLogo + 6;
      }
      pdf.setTextColor(20, 20, 20);
      pdf.setFontSize(13);
      pdf.setFont("helvetica", "bold");
      pdf.text((prefeitura.nome || "PREFEITURA MUNICIPAL").toUpperCase(), textoX, 16);
      pdf.setFontSize(9);
      pdf.setFont("helvetica", "normal");
      pdf.text(`Estado: ${prefeitura.estado || "-"}    CNPJ: ${prefeitura.cnpj || "Nao informado"}`, textoX, 21);
      pdf.text(prefeitura.enderecoCompras || "Setor de Compras", textoX, 26, { maxWidth: larguraUtil - textoX });
      pdf.setDrawColor(...vinho);
      pdf.setLineWidth(0.6);
      pdf.line(margem, 30, 283, 30);

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(12);
      pdf.text("MAPA DE PESQUISA DE PRECOS", margem, 38);
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(90, 90, 90);
      pdf.text("Lei 14.133/2021, art. 23 · IN SEGES/ME 65/2021", margem, 43);
      pdf.setTextColor(20, 20, 20);

      pdf.setFontSize(9);
      pdf.text(`Processo: PE ${processo.id}`, margem, 51);
      pdf.text(`Objeto: ${processo.objeto}`, margem, 56, { maxWidth: 150 });
      pdf.text(`Solicitante: ${nomeSecretaria(secretarias, processo.secretariaSolicitante)}`, margem, 61);
      pdf.text(`Fase: ${processoStatusLabels[processo.status]}`, 175, 51);
      pdf.text(`Prazo limite: ${processo.prazoLimite}`, 175, 56);
      pdf.text(`Responsavel: ${processo.responsavel}`, 175, 61);

      // ---------- composicao do lote ----------
      autoTable(pdf, {
        startY: 68,
        head: [[
          "Item", "Especificacao detalhada", "Un.",
          ...secretarias.map((secretaria) => secretaria.nome),
          "Qtd. total", "Cot.", `Preco unit. (${metodoLabels[metodo].toLowerCase()})`, "Valor total",
        ]],
        body: items.map((item) => {
          const unitario = precoUnitario(item, metodo);
          return [
            item.item,
            item.especificacao,
            item.unidade,
            ...secretarias.map((secretaria) => Number(item.quantidades[secretaria.chave] ?? 0)),
            itemTotalQuantity(item),
            cotacoesValidas(item).length,
            money(unitario),
            money(unitario * itemTotalQuantity(item)),
          ];
        }),
        foot: [["", "VALOR TOTAL ESTIMADO DO LOTE", ...Array(secretarias.length + 4).fill(""), money(loteTotal(items, metodo))]],
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: vinho },
        footStyles: { fillColor: [240, 240, 242], textColor: [20, 20, 20], fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 248, 248] },
      });

      // ---------- detalhamento das cotacoes ----------
      let cursorY = ((pdf as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 150) + 10;
      const detalhes = items.flatMap((item) =>
        item.cotacoes.map((cotacao) => [
          String(item.item),
          fonteLabels[cotacao.fonte],
          cotacao.descricao,
          cotacao.documento || "-",
          cotacao.dataCotacao || "-",
          money(cotacao.valorUnitario),
          cotacao.desconsiderada ? `Desconsiderada: ${cotacao.justificativa}` : "Considerada",
        ]),
      );

      if (detalhes.length) {
        if (cursorY > 150) {
          pdf.addPage();
          cursorY = 20;
        }
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(10);
        pdf.text("DETALHAMENTO DAS COTACOES", margem, cursorY);
        autoTable(pdf, {
          startY: cursorY + 4,
          head: [["Item", "Fonte", "Origem consultada", "Documento", "Data", "Valor unitario", "Situacao"]],
          body: detalhes,
          styles: { fontSize: 7, cellPadding: 2 },
          headStyles: { fillColor: [90, 90, 96] },
          alternateRowStyles: { fillColor: [248, 248, 248] },
          columnStyles: { 6: { cellWidth: 60 } },
        });
        cursorY = ((pdf as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || cursorY) + 10;
      }

      // ---------- ajustes de quantidade ----------
      const ajustes = items.flatMap((item) =>
        (item.ajustes ?? []).map((ajuste) => [
          String(item.item),
          ajuste.secretaria,
          `${ajuste.anterior} para ${ajuste.nova}`,
          ajuste.justificativa,
          `${ajuste.usuario ?? "-"} · ${ajuste.quando}`,
        ]),
      );

      if (ajustes.length) {
        if (cursorY > 150) {
          pdf.addPage();
          cursorY = 20;
        }
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(10);
        pdf.text("AJUSTES DE QUANTIDADE", margem, cursorY);
        autoTable(pdf, {
          startY: cursorY + 4,
          head: [["Item", "Secretaria", "Alteracao", "Justificativa", "Responsavel"]],
          body: ajustes,
          styles: { fontSize: 7, cellPadding: 2 },
          headStyles: { fillColor: [90, 90, 96] },
          alternateRowStyles: { fillColor: [248, 248, 248] },
          columnStyles: { 3: { cellWidth: 90 } },
        });
        cursorY = ((pdf as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || cursorY) + 10;
      }

      // ---------- metodologia e assinatura ----------
      if (cursorY > 165) {
        pdf.addPage();
        cursorY = 20;
      }
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.text("METODOLOGIA ADOTADA", margem, cursorY);
      cursorY += 6;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      const metodologia = pdf.splitTextToSize(
        `Valor de referencia obtido por ${metodoLabels[metodo].toLowerCase()} dos precos considerados, nos termos do art. 6 da IN SEGES/ME 65/2021.` +
          (processo.justificativaMetodo ? ` Justificativa: ${processo.justificativaMetodo}` : "") +
          " Precos desconsiderados e os respectivos motivos constam do detalhamento acima.",
        larguraUtil,
      ) as string[];
      pdf.text(metodologia, margem, cursorY);
      cursorY += metodologia.length * 5 + 5;

      const comentarios = pdf.splitTextToSize(`Observacoes do processo: ${notas || "Nenhuma observacao registrada."}`, larguraUtil) as string[];
      pdf.text(comentarios, margem, cursorY);
      cursorY += comentarios.length * 5 + 8;

      pdf.setFontSize(8);
      pdf.setTextColor(90, 90, 90);
      pdf.text(`Emitido em ${new Date().toLocaleDateString("pt-BR")} por ${processo.responsavel}.`, margem, cursorY);
      pdf.setTextColor(20, 20, 20);
      pdf.setLineWidth(0.2);
      pdf.setDrawColor(120, 120, 120);
      pdf.line(200, cursorY + 12, 275, cursorY + 12);
      pdf.setFontSize(9);
      pdf.text("Responsavel pelo Setor de Compras", 208, cursorY + 17);

      pdf.save(`mapa-de-precos-${processo.id}.pdf`);
    } finally {
      setGerando(false);
    }
  };

  return (
    <button type="button" className="daddus-secondary-button" onClick={exportPdf} disabled={gerando}>
      <FileDown size={16} /> {gerando ? "Gerando..." : "Exportar PDF oficial"}
    </button>
  );
}
