import { jsPDF } from 'jspdf';
import pptxgen from 'pptxgenjs';

export type BrandAtlasExportCard = {
  title?: string;
  lines: string[];
};

export type BrandAtlasExportSection = {
  title: string;
  cards: BrandAtlasExportCard[];
};

export type BrandAtlasExportDocument = {
  reportTitle: string;
  reportSubtitle?: string;
  audience?: string;
  contextLines?: string[];
  sections: BrandAtlasExportSection[];
};

const THEME = {
  bg: [250, 250, 250] as const,
  cardBg: [255, 255, 255] as const,
  title: [24, 24, 27] as const,
  body: [63, 63, 70] as const,
  accent: [99, 102, 241] as const,
  border: [228, 228, 231] as const,
};

export const splitCardsIntoSlides = <T>(cards: T[], perSlide: number): T[][] => {
  const size = Math.max(1, Math.floor(perSlide || 1));
  const groups: T[][] = [];
  for (let index = 0; index < cards.length; index += size) {
    groups.push(cards.slice(index, index + size));
  }
  return groups;
};

const rgbToHex = (rgb: readonly [number, number, number]): string =>
  rgb.map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase();

const splitLongWord = (word: string, maxChars: number): string[] => {
  if (word.length <= maxChars) return [word];
  const chunks: string[] = [];
  for (let index = 0; index < word.length; index += maxChars) {
    chunks.push(word.slice(index, index + maxChars));
  }
  return chunks;
};

const wrapPptTextByCharacterCount = (text: string, maxChars: number): string[] => {
  const normalized = text.trim();
  if (!normalized) return [];

  const words = normalized.split(/\s+/).flatMap((word) => splitLongWord(word, maxChars));
  const lines: string[] = [];
  let current = '';

  words.forEach((word) => {
    if (!current) {
      current = word;
      return;
    }

    const candidate = `${current} ${word}`;
    if (candidate.length <= maxChars) {
      current = candidate;
      return;
    }

    lines.push(current);
    current = word;
  });

  if (current) {
    lines.push(current);
  }

  return lines;
};

type PptCardChunk = {
  title?: string;
  lines: string[];
};

const paginatePptCard = (
  card: BrandAtlasExportCard,
  maxRenderedLines = 22,
  maxCharsPerLine = 95
): PptCardChunk[] => {
  const renderedBulletLines = (card.lines || []).flatMap((line) => {
    const wrapped = wrapPptTextByCharacterCount(line, Math.max(10, maxCharsPerLine - 2));
    if (wrapped.length === 0) return [];
    return wrapped.map((segment, index) => (index === 0 ? `• ${segment}` : `  ${segment}`));
  });

  if (renderedBulletLines.length === 0) {
    return [{ title: card.title, lines: [] }];
  }

  const chunks: PptCardChunk[] = [];
  let cursor = 0;
  while (cursor < renderedBulletLines.length) {
    const lines = renderedBulletLines.slice(cursor, cursor + maxRenderedLines);
    const titleSuffix = chunks.length > 0 ? ' (CONT.)' : '';
    chunks.push({
      title: card.title ? `${card.title}${titleSuffix}` : undefined,
      lines,
    });
    cursor += maxRenderedLines;
  }

  return chunks;
};

export const paginatePptCardForTest = paginatePptCard;

const getPdfLineHeight = (fontSize: number): number => Math.max(4.2, fontSize * 0.42);

const wrapPdfText = (
  doc: jsPDF,
  text: string,
  maxWidth: number,
  fontSize: number,
  bold = false
): string[] => {
  doc.setFont('helvetica', bold ? 'bold' : 'normal');
  doc.setFontSize(fontSize);
  return doc.splitTextToSize(text, maxWidth) as string[];
};

type PdfCardLayout = {
  titleLines: string[];
  bulletGroups: string[][];
  height: number;
};

export const measurePdfCardLayoutForTest = (
  doc: jsPDF,
  card: BrandAtlasExportCard,
  maxWidth: number
): PdfCardLayout => {
  const titleLines = card.title ? wrapPdfText(doc, card.title, maxWidth, 10, true) : [];
  const bulletGroups = (card.lines || []).map((line) => wrapPdfText(doc, `• ${line}`, maxWidth, 9, false));
  const titleLineHeight = getPdfLineHeight(10);
  const bodyLineHeight = getPdfLineHeight(9);
  const topPadding = 5;
  const bottomPadding = 4;
  const titleBottomGap = 0.5;
  const bulletGap = 0.3;

  let height = topPadding + bottomPadding;
  if (titleLines.length > 0) {
    height += titleLines.length * titleLineHeight;
    if (bulletGroups.length > 0) {
      height += titleBottomGap;
    }
  }
  bulletGroups.forEach((group, index) => {
    height += group.length * bodyLineHeight;
    if (index < bulletGroups.length - 1) {
      height += bulletGap;
    }
  });

  return {
    titleLines,
    bulletGroups,
    height: Math.max(18, height),
  };
};

export const exportBrandAtlasDocumentToPdf = async (
  document: BrandAtlasExportDocument,
  fileName: string
): Promise<void> => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  const drawBackground = () => {
    doc.setFillColor(THEME.bg[0], THEME.bg[1], THEME.bg[2]);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
  };
  drawBackground();

  const addWrappedText = (
    text: string,
    x: number,
    maxWidth: number,
    y: number,
    fontSize: number,
    bold = false,
    color: readonly [number, number, number] = THEME.body
  ): number => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(fontSize);
    doc.setTextColor(color[0], color[1], color[2]);
    const lines = doc.splitTextToSize(text, maxWidth);
    const lineHeight = getPdfLineHeight(fontSize);
    let nextY = y;
    lines.forEach((line: string) => {
      if (nextY > pageHeight - margin) {
        doc.addPage();
        drawBackground();
        nextY = margin;
        doc.setFont('helvetica', bold ? 'bold' : 'normal');
        doc.setFontSize(fontSize);
        doc.setTextColor(color[0], color[1], color[2]);
      }
      doc.text(line, x, nextY);
      nextY += lineHeight;
    });
    return nextY;
  };

  let y = margin + 1;
  y = addWrappedText(document.reportTitle, margin, contentWidth, y, 20, true, THEME.title) + 1;
  if (document.reportSubtitle) {
    y = addWrappedText(document.reportSubtitle, margin, contentWidth, y, 12, false, THEME.accent) + 2;
  }
  if (document.audience) {
    y = addWrappedText(`Audience: ${document.audience}`, margin, contentWidth, y, 10, true, THEME.body) + 1;
  }
  (document.contextLines || []).forEach((line) => {
    y = addWrappedText(line, margin, contentWidth, y, 9, false, THEME.body) + 0.5;
  });
  y += 2;

  const ensureSpace = (height: number): void => {
    if (y + height <= pageHeight - margin) return;
    doc.addPage();
    drawBackground();
    y = margin;
  };

  document.sections.forEach((section) => {
    ensureSpace(16);
    y = addWrappedText(section.title.toUpperCase(), margin, contentWidth, y, 11, true, THEME.title) + 2;

    section.cards.forEach((card) => {
      const cardInnerX = margin + 4.2;
      const cardInnerWidth = contentWidth - 8.4;
      const layout = measurePdfCardLayoutForTest(doc, card, cardInnerWidth);
      const cardHeight = layout.height;
      ensureSpace(cardHeight + 3);

      doc.setFillColor(THEME.cardBg[0], THEME.cardBg[1], THEME.cardBg[2]);
      doc.setDrawColor(THEME.border[0], THEME.border[1], THEME.border[2]);
      doc.roundedRect(margin, y, contentWidth, cardHeight, 3, 3, 'FD');
      doc.setDrawColor(THEME.accent[0], THEME.accent[1], THEME.accent[2]);
      doc.setLineWidth(0.6);
      doc.line(margin, y, margin, y + cardHeight);

      let cardY = y + 5;
      if (layout.titleLines.length > 0) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(THEME.title[0], THEME.title[1], THEME.title[2]);
        const titleLineHeight = getPdfLineHeight(10);
        layout.titleLines.forEach((line) => {
          doc.text(line, cardInnerX, cardY);
          cardY += titleLineHeight;
        });
        if (layout.bulletGroups.length > 0) {
          cardY += 0.5;
        }
      }

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(THEME.body[0], THEME.body[1], THEME.body[2]);
      const bodyLineHeight = getPdfLineHeight(9);
      layout.bulletGroups.forEach((group, groupIndex) => {
        group.forEach((line) => {
          doc.text(line, cardInnerX, cardY);
          cardY += bodyLineHeight;
        });
        if (groupIndex < layout.bulletGroups.length - 1) {
          cardY += 0.3;
        }
      });

      y += cardHeight + 3;
    });

    y += 1;
  });

  doc.save(fileName);
};

export const exportBrandAtlasDocumentToPptx = async (
  document: BrandAtlasExportDocument,
  fileName: string
): Promise<void> => {
  const PptxCtor = ((pptxgen as unknown as { default?: typeof pptxgen }).default || pptxgen) as any;
  const pres = new PptxCtor();
  pres.layout = 'LAYOUT_WIDE';

  const titleSlide = pres.addSlide();
  titleSlide.background = { color: rgbToHex(THEME.bg) };
  titleSlide.addText(document.reportTitle, {
    x: 0.6, y: 0.5, w: 12.1, h: 0.7, fontSize: 32, bold: true, color: rgbToHex(THEME.title),
  });
  if (document.reportSubtitle) {
    titleSlide.addText(document.reportSubtitle, {
      x: 0.6, y: 1.25, w: 12.1, h: 0.45, fontSize: 16, color: rgbToHex(THEME.accent),
    });
  }
  const metaLines = [
    document.audience ? `Audience: ${document.audience}` : '',
    ...(document.contextLines || []),
  ].filter(Boolean);
  titleSlide.addText(metaLines.join('\n'), {
    x: 0.6, y: 2.0, w: 12.1, h: 3.5, fontSize: 12, color: rgbToHex(THEME.body), valign: 'top',
  });

  document.sections.forEach((section) => {
    const cardChunks = section.cards.flatMap((card) => paginatePptCard(card));
    cardChunks.forEach((chunk, slideIndex) => {
      const slide = pres.addSlide();
      slide.background = { color: rgbToHex(THEME.bg) };
      slide.addText(slideIndex === 0 ? section.title.toUpperCase() : `${section.title.toUpperCase()} (CONT.)`, {
        x: 0.6, y: 0.35, w: 12.1, h: 0.5, fontSize: 18, bold: true, color: rgbToHex(THEME.title),
      });
      const y = 1.05;
      const cardX = 0.6;
      const cardW = 12.1;
      const cardH = 5.95;
      const cardInnerX = cardX + 0.35;
      const cardInnerW = cardW - 0.7;
      slide.addShape(pres.ShapeType.roundRect, {
        x: cardX, y, w: cardW, h: cardH,
        fill: { color: rgbToHex(THEME.cardBg) },
        line: { color: rgbToHex(THEME.border), pt: 1 },
        radius: 0.08,
      });
      slide.addShape(pres.ShapeType.line, {
        x: cardX, y, w: 0, h: cardH,
        line: { color: rgbToHex(THEME.accent), pt: 2 },
      });

      if (chunk.title) {
        slide.addText(chunk.title, {
          x: cardInnerX, y: y + 0.22, w: cardInnerW, h: 0.5,
          fontSize: 13, bold: true, color: rgbToHex(THEME.title), valign: 'top',
          margin: 0.02,
        });
      }

      slide.addText(chunk.lines.join('\n'), {
        x: cardInnerX, y: chunk.title ? y + 0.75 : y + 0.24, w: cardInnerW, h: chunk.title ? 5.0 : 5.5,
        fontSize: 11, color: rgbToHex(THEME.body), bold: false, valign: 'top',
        margin: 0.02,
      });
    });
  });

  await pres.writeFile({ fileName });
};
