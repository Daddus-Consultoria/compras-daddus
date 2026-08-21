import type { PrefeituraConfig } from "@/lib/compras";
import type jsPDF from "jspdf";

/**
 * O que os documentos oficiais do portal tem em comum: o brasao, o cabecalho
 * institucional e a regua de quebra de pagina. Mapa de precos, DFD e ETP saem
 * com a mesma cara porque sao juntados ao mesmo processo administrativo.
 */

export const vinho: [number, number, number] = [150, 24, 48];
export const margem = 14;
/** A4 retrato: 210 mm de largura, menos as duas margens. */
export const larguraRetrato = 182;
/** Altura util antes de virar a pagina. */
const limiteRetrato = 276;

/**
 * Busca a logo da prefeitura e devolve algo que o jsPDF aceite. SVG fica de
 * fora porque o jsPDF nao rasteriza vetor; nesse caso o cabecalho sai sem
 * brasao, em vez de quebrar a emissao do documento.
 */
export async function carregarLogo(url: string) {
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

export type Logo = Awaited<ReturnType<typeof carregarLogo>>;

/** Cabecalho institucional com brasao, nome, CNPJ e endereco do Setor de Compras. */
export function desenharCabecalho(
  pdf: jsPDF,
  opcoes: { prefeitura: PrefeituraConfig; logo: Logo; titulo: string; base: string; largura?: number },
) {
  const largura = opcoes.largura ?? larguraRetrato;
  let textoX = margem;
  if (opcoes.logo) {
    const alturaLogo = 15;
    const larguraLogo = Math.min(34, (opcoes.logo.largura / opcoes.logo.altura) * alturaLogo);
    pdf.addImage(opcoes.logo.dataUrl, opcoes.logo.formato, margem, 10, larguraLogo, alturaLogo);
    textoX = margem + larguraLogo + 6;
  }
  pdf.setTextColor(20, 20, 20);
  pdf.setFontSize(12);
  pdf.setFont("helvetica", "bold");
  pdf.text((opcoes.prefeitura.nome || "PREFEITURA MUNICIPAL").toUpperCase(), textoX, 16, { maxWidth: largura - textoX + margem });
  pdf.setFontSize(8);
  pdf.setFont("helvetica", "normal");
  pdf.text(`Estado: ${opcoes.prefeitura.estado || "-"}    CNPJ: ${opcoes.prefeitura.cnpj || "Nao informado"}`, textoX, 21);
  pdf.text(opcoes.prefeitura.enderecoCompras || "Setor de Compras", textoX, 25.5, { maxWidth: largura - textoX + margem });

  pdf.setDrawColor(...vinho);
  pdf.setLineWidth(0.6);
  pdf.line(margem, 29, margem + largura, 29);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.text(opcoes.titulo, margem, 37);
  pdf.setFontSize(8);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(90, 90, 90);
  pdf.text(opcoes.base, margem, 42);
  pdf.setTextColor(20, 20, 20);
  return 50;
}

/** Vira a pagina quando o proximo bloco nao cabe, e devolve o cursor onde escrever. */
export function espacoPara(pdf: jsPDF, y: number, altura: number, limite = limiteRetrato) {
  if (y + altura <= limite) return y;
  pdf.addPage();
  return 20;
}

/**
 * Um bloco de texto com titulo, quebrado em linhas e paginas. Devolve o cursor
 * ja posicionado depois do bloco.
 */
export function bloco(
  pdf: jsPDF,
  dados: { titulo: string; corpo: string; y: number; largura?: number; vazio?: string },
) {
  const largura = dados.largura ?? larguraRetrato;
  const corpo = dados.corpo.trim() || dados.vazio || "Nao informado.";
  const linhas = pdf.splitTextToSize(corpo, largura) as string[];
  let y = espacoPara(pdf, dados.y, 10 + linhas.length * 4.4);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.5);
  pdf.setTextColor(...vinho);
  pdf.text(dados.titulo, margem, y);
  pdf.setTextColor(20, 20, 20);
  y += 5;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  // Linha a linha para a quebra de pagina cair entre linhas, e nao no meio de uma.
  for (const linha of linhas) {
    y = espacoPara(pdf, y, 6);
    pdf.text(linha, margem, y);
    y += 4.4;
  }
  return y + 5;
}

/** Rodape de emissao e a linha de assinatura de quem responde pelo documento. */
export function assinatura(pdf: jsPDF, dados: { y: number; emitidoPor: string; cargo: string; largura?: number }) {
  const largura = dados.largura ?? larguraRetrato;
  let y = espacoPara(pdf, dados.y, 34);
  pdf.setFontSize(8);
  pdf.setTextColor(90, 90, 90);
  pdf.text(`Emitido em ${new Date().toLocaleDateString("pt-BR")} por ${dados.emitidoPor}.`, margem, y);
  pdf.setTextColor(20, 20, 20);
  y += 18;
  pdf.setLineWidth(0.2);
  pdf.setDrawColor(120, 120, 120);
  const centro = margem + largura / 2;
  pdf.line(centro - 40, y, centro + 40, y);
  pdf.setFontSize(9);
  pdf.text(dados.cargo, centro, y + 5, { align: "center" });
  return y + 12;
}

export function numerarPaginas(pdf: jsPDF, rodape: string) {
  const paginas = pdf.getNumberOfPages();
  for (let pagina = 1; pagina <= paginas; pagina++) {
    pdf.setPage(pagina);
    pdf.setFontSize(7.5);
    pdf.setTextColor(120, 120, 120);
    const altura = pdf.internal.pageSize.getHeight();
    pdf.text(rodape, margem, altura - 8);
    pdf.text(`Pagina ${pagina} de ${paginas}`, pdf.internal.pageSize.getWidth() - margem, altura - 8, { align: "right" });
    pdf.setTextColor(20, 20, 20);
  }
}
