import fs from 'node:fs/promises';
import path from 'node:path';
import { jsPDF } from 'jspdf';
import pptxgen from 'pptxgenjs';
import { createGenZMockBrandAtlasDocument } from '../src/services/brand-atlas-export-model';
import { createCanonicalPagePlan } from '../src/services/brand-atlas-export-renderer-contract';

const OUTPUT_DIR = path.resolve(process.cwd(), 'public', 'mock-exports');

const toRgbTuple = (hex: string): [number, number, number] => {
  const value = hex.replace('#', '');
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
};

const toPptxColor = (hex: string): string => hex.replace('#', '').toUpperCase();

const buildPdf = async () => {
  const document = createGenZMockBrandAtlasDocument();
  const plan = createCanonicalPagePlan(document);
  const { colors, typography, spacing } = document.theme;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const maxWidth = pageWidth - spacing.pageMarginPt * 2;

  console.log('[brand-atlas-export] building PDF mock export', { pages: plan.length });

  plan.forEach((page, index) => {
    if (index > 0) {
      pdf.addPage();
    }

    let cursorY = spacing.pageMarginPt;
    const bg = toRgbTuple(colors.pageBackground);
    pdf.setFillColor(bg[0], bg[1], bg[2]);
    pdf.rect(0, 0, pageWidth, pageHeight, 'F');

    const primary = toRgbTuple(colors.primary);
    pdf.setTextColor(primary[0], primary[1], primary[2]);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(typography.titleSizePt);
    pdf.text(page.title, spacing.pageMarginPt, cursorY);
    cursorY += typography.titleSizePt + spacing.blockGapPt;

    if (page.subtitle) {
      const secondary = toRgbTuple(colors.secondary);
      pdf.setTextColor(secondary[0], secondary[1], secondary[2]);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(typography.bodySizePt + 1);
      const subtitleLines = pdf.splitTextToSize(page.subtitle, maxWidth);
      subtitleLines.forEach((line: string) => {
        pdf.text(line, spacing.pageMarginPt, cursorY);
        cursorY += typography.bodySizePt + spacing.lineGapPt;
      });
      cursorY += spacing.blockGapPt;
    }

    const body = toRgbTuple(colors.body);
    pdf.setTextColor(body[0], body[1], body[2]);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(typography.bodySizePt);

    page.lines.forEach((line) => {
      const wrapped = pdf.splitTextToSize(line, maxWidth);
      wrapped.forEach((part: string) => {
        if (cursorY > pageHeight - spacing.pageMarginPt) {
          pdf.addPage();
          const nextBg = toRgbTuple(colors.pageBackground);
          pdf.setFillColor(nextBg[0], nextBg[1], nextBg[2]);
          pdf.rect(0, 0, pageWidth, pageHeight, 'F');
          cursorY = spacing.pageMarginPt;
          pdf.setTextColor(body[0], body[1], body[2]);
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(typography.bodySizePt);
        }
        pdf.text(part, spacing.pageMarginPt, cursorY);
        cursorY += typography.bodySizePt + spacing.lineGapPt;
      });
      cursorY += spacing.lineGapPt;
    });

    const accent = toRgbTuple(colors.accent);
    pdf.setDrawColor(accent[0], accent[1], accent[2]);
    pdf.setLineWidth(1.2);
    pdf.line(spacing.pageMarginPt, pageHeight - spacing.pageMarginPt + 4, pageWidth - spacing.pageMarginPt, pageHeight - spacing.pageMarginPt + 4);
  });

  const pdfOutput = path.join(OUTPUT_DIR, 'brand-atlas-gen-z-mock.pdf');
  await fs.writeFile(pdfOutput, Buffer.from(pdf.output('arraybuffer')));
  console.log('[brand-atlas-export] wrote PDF mock export', { pdfOutput });
};

const buildPptx = async () => {
  const document = createGenZMockBrandAtlasDocument();
  const plan = createCanonicalPagePlan(document);
  const { colors, typography } = document.theme;
  const PptxCtor = ((pptxgen as unknown as { default?: typeof pptxgen }).default || pptxgen) as any;
  const pptx = new PptxCtor();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'Brand Atlas';
  pptx.subject = 'Gen Z mock export';
  pptx.title = document.meta.reportTitle;

  console.log('[brand-atlas-export] building PPTX mock export', { pages: plan.length });

  plan.forEach((page) => {
    const slide = pptx.addSlide();
    slide.background = { color: toPptxColor(colors.pageBackground) };

    slide.addText(page.title, {
      x: 0.5,
      y: 0.4,
      w: 12.2,
      h: 0.7,
      bold: true,
      fontFace: typography.titleFont,
      fontSize: Math.max(22, typography.titleSizePt * 0.66),
      color: toPptxColor(colors.primary),
    });

    let cursorY = 1.15;
    if (page.subtitle) {
      slide.addText(page.subtitle, {
        x: 0.5,
        y: cursorY,
        w: 12.2,
        h: 0.55,
        fontFace: typography.bodyFont,
        fontSize: typography.bodySizePt,
        color: toPptxColor(colors.secondary),
      });
      cursorY += 0.55;
    }

    const lines = page.lines.join('\n');
    slide.addText(lines, {
      x: 0.7,
      y: cursorY + 0.2,
      w: 11.8,
      h: 5.3,
      fontFace: typography.bodyFont,
      fontSize: typography.bodySizePt - 1,
      color: toPptxColor(colors.body),
      valign: 'top',
      breakLine: false,
    });

    slide.addShape(pptx.ShapeType.line, {
      x: 0.5,
      y: 6.9,
      w: 12.2,
      h: 0,
      line: {
        color: toPptxColor(colors.accent),
        pt: 1.25,
      },
    });
  });

  const pptxOutput = path.join(OUTPUT_DIR, 'brand-atlas-gen-z-mock.pptx');
  await pptx.writeFile({ fileName: pptxOutput });
  console.log('[brand-atlas-export] wrote PPTX mock export', { pptxOutput });
};

const main = async () => {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const document = createGenZMockBrandAtlasDocument();
  const jsonOutput = path.join(OUTPUT_DIR, 'brand-atlas-gen-z-mock.json');
  await fs.writeFile(jsonOutput, JSON.stringify(document, null, 2), 'utf8');
  console.log('[brand-atlas-export] wrote canonical JSON', { jsonOutput });

  await buildPdf();
  await buildPptx();
};

main().catch((error) => {
  console.error('[brand-atlas-export] mock export generation failed', error);
  process.exitCode = 1;
});
