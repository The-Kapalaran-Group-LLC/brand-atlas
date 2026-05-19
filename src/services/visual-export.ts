import type { RefObject } from 'react';
import pptxgen from 'pptxgenjs';
import { logger } from './logger';

type SliceOffset = {
  yPx: number;
  heightPx: number;
};

type CanvasSlice = SliceOffset & {
  dataUrl: string;
  widthPx: number;
  format: 'PNG' | 'JPEG';
};

type CaptureOptions = {
  scale?: number;
};

const PPTX_SLIDE_WIDTH_IN = 13.333;
const PPTX_SLIDE_HEIGHT_IN = 7.5;
const EXPORT_ROOT_ATTR = 'data-export-capture-root';

const loadHtml2Canvas = async () => {
  const html2canvasModule = await import('html2canvas');
  return html2canvasModule.default;
};

const shouldSuppressImageForExport = (src?: string | null): boolean => {
  if (!src) return false;
  const normalized = src.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.startsWith('data:') || normalized.startsWith('blob:')) return false;
  if (normalized.startsWith('http://') || normalized.startsWith('https://') || normalized.startsWith('//')) return true;
  return false;
};

const UNSUPPORTED_COLOR_FN_REGEX = /(oklch|oklab)\([^()]*\)/gi;

const normalizeCssColorToken = (token: string, docForProbe: Document): string => {
  const probe = docForProbe.createElement('span');
  probe.style.color = token;
  docForProbe.body.appendChild(probe);
  const resolved = docForProbe.defaultView?.getComputedStyle(probe).color || '';
  probe.remove();
  if (!resolved || resolved.includes('oklch(')) {
    return 'rgb(0, 0, 0)';
  }
  return resolved;
};

const normalizeCssValueForExport = (value: string, docForProbe: Document): string => {
  if (!value || (!value.includes('oklch(') && !value.includes('oklab('))) {
    return value;
  }
  return value.replace(UNSUPPORTED_COLOR_FN_REGEX, (token) => normalizeCssColorToken(token, docForProbe));
};

const inlineComputedStylesForClonedTree = ({
  originalRoot,
  clonedRoot,
  clonedDoc,
}: {
  originalRoot: HTMLElement;
  clonedRoot: HTMLElement;
  clonedDoc: Document;
}): number => {
  const originalNodes = [originalRoot, ...Array.from(originalRoot.querySelectorAll<HTMLElement>('*'))];
  const clonedNodes = [clonedRoot, ...Array.from(clonedRoot.querySelectorAll<HTMLElement>('*'))];
  const pairCount = Math.min(originalNodes.length, clonedNodes.length);
  let normalizedCount = 0;

  for (let index = 0; index < pairCount; index += 1) {
    const originalNode = originalNodes[index];
    const clonedNode = clonedNodes[index];
    if (!originalNode || !clonedNode) continue;

    const computed = window.getComputedStyle(originalNode);
    for (let styleIndex = 0; styleIndex < computed.length; styleIndex += 1) {
      const property = computed.item(styleIndex);
      if (!property) continue;
      const raw = computed.getPropertyValue(property);
      const normalized = normalizeCssValueForExport(raw, clonedDoc);
      if (normalized !== raw) {
        normalizedCount += 1;
      }
      clonedNode.style.setProperty(property, normalized, computed.getPropertyPriority(property));
    }
  }

  return normalizedCount;
};

const sanitizeClonedDocumentForExport = (clonedDoc: Document, originalRoot: HTMLElement): void => {
  const clonedRoot = clonedDoc.querySelector<HTMLElement>(`[${EXPORT_ROOT_ATTR}="1"]`);
  if (!clonedRoot) {
    console.log('[visual-export] Could not find cloned export root marker; skipping aggressive CSS sanitization.');
    return;
  }

  const images = Array.from(clonedRoot.querySelectorAll('img'));
  let suppressedCount = 0;

  images.forEach((img) => {
    const src = img.getAttribute('src');
    if (!shouldSuppressImageForExport(src)) return;
    suppressedCount += 1;
    img.setAttribute('src', '');
    img.style.visibility = 'hidden';
    img.style.background = '#f4f4f5';
  });

  if (suppressedCount > 0) {
    console.log('[visual-export] Suppressed remote images in cloned export DOM to avoid canvas taint.', {
      suppressedCount,
    });
  }

  const removableStylesheets = Array.from(clonedDoc.querySelectorAll('style, link[rel="stylesheet"]'));
  removableStylesheets.forEach((node) => node.remove());
  console.log('[visual-export] Removed cloned stylesheet nodes and inlining computed styles.', {
    removedStyleNodes: removableStylesheets.length,
  });

  const normalizedCount = inlineComputedStylesForClonedTree({
    originalRoot,
    clonedRoot,
    clonedDoc,
  });

  if (normalizedCount > 0) {
    console.log('[visual-export] Normalized unsupported oklch/oklab styles for export.', { normalizedCount });
  }
};

const withExportRootMarker = async <T>(element: HTMLElement, task: () => Promise<T>): Promise<T> => {
  const previous = element.getAttribute(EXPORT_ROOT_ATTR);
  element.setAttribute(EXPORT_ROOT_ATTR, '1');
  try {
    return await task();
  } finally {
    if (previous === null) {
      element.removeAttribute(EXPORT_ROOT_ATTR);
    } else {
      element.setAttribute(EXPORT_ROOT_ATTR, previous);
    }
  }
};

export const computeVerticalSliceOffsets = ({
  contentHeightPx,
  pageHeightPx,
}: {
  contentHeightPx: number;
  pageHeightPx: number;
}): SliceOffset[] => {
  const totalHeight = Math.max(1, Math.floor(contentHeightPx));
  const stepHeight = Math.max(1, Math.floor(pageHeightPx));
  const slices: SliceOffset[] = [];

  for (let y = 0; y < totalHeight; y += stepHeight) {
    slices.push({ yPx: y, heightPx: Math.min(stepHeight, totalHeight - y) });
  }

  return slices;
};

const captureElementCanvas = async (element: HTMLElement, options?: CaptureOptions): Promise<HTMLCanvasElement> => {
  const html2canvas = await loadHtml2Canvas();
  const scale = Math.max(1.25, Math.min(3, options?.scale ?? 2));

  console.log('[visual-export] Capturing report element for high-fidelity export.', {
    width: element.scrollWidth,
    height: element.scrollHeight,
    scale,
  });

  return withExportRootMarker(element, async () => html2canvas(element, {
    backgroundColor: '#ffffff',
    scale,
    useCORS: true,
    logging: false,
    allowTaint: false,
    windowWidth: Math.max(document.documentElement.clientWidth, element.scrollWidth),
    windowHeight: Math.max(document.documentElement.clientHeight, element.scrollHeight),
    ignoreElements: (candidate) => candidate.classList?.contains('no-print') || false,
    onclone: (clonedDoc) => sanitizeClonedDocumentForExport(clonedDoc, element),
  }));
};

const captureElementInChunks = async ({
  element,
  pageAspectRatio,
  scale = 2,
}: {
  element: HTMLElement;
  pageAspectRatio: number;
  scale?: number;
}): Promise<CanvasSlice[]> => {
  const html2canvas = await loadHtml2Canvas();
  const sourceWidth = Math.max(1, Math.floor(element.scrollWidth));
  const sourceHeight = Math.max(1, Math.floor(element.scrollHeight));
  const targetPageHeight = Math.max(1, Math.floor(sourceWidth / pageAspectRatio));
  const offsets = computeVerticalSliceOffsets({
    contentHeightPx: sourceHeight,
    pageHeightPx: targetPageHeight,
  });

  console.log('[visual-export] Falling back to chunked capture.', {
    sourceWidth,
    sourceHeight,
    targetPageHeight,
    sliceCount: offsets.length,
  });

  return withExportRootMarker(element, async () => {
    const slices: CanvasSlice[] = [];
    for (let index = 0; index < offsets.length; index += 1) {
      const offset = offsets[index];
      const canvas = await html2canvas(element, {
        backgroundColor: '#ffffff',
        scale,
        useCORS: true,
        logging: false,
        allowTaint: false,
        ignoreElements: (candidate) => candidate.classList?.contains('no-print') || false,
        width: sourceWidth,
        height: offset.heightPx,
        x: 0,
        y: offset.yPx,
        windowWidth: sourceWidth,
        windowHeight: offset.heightPx,
        scrollX: 0,
        scrollY: -offset.yPx,
        onclone: (clonedDoc) => sanitizeClonedDocumentForExport(clonedDoc, element),
      });

      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      console.log('[visual-export] Captured fallback slice.', {
        index,
        yPx: offset.yPx,
        heightPx: offset.heightPx,
        widthPx: canvas.width,
      });
      slices.push({
        ...offset,
        dataUrl,
        widthPx: canvas.width,
        format: 'JPEG',
      });
    }
    return slices;
  });
};

const captureSlicesForExport = async ({
  element,
  pageAspectRatio,
}: {
  element: HTMLElement;
  pageAspectRatio: number;
}): Promise<CanvasSlice[]> => {
  try {
    const canvas = await captureElementCanvas(element);
    return buildCanvasSlices(canvas, pageAspectRatio);
  } catch (error) {
    console.log('[visual-export] Full-canvas capture failed; retrying with chunked capture.', { error });
    const retryScales = [2, 1.5, 1.2, 1];
    let lastError: unknown = error;
    for (const scale of retryScales) {
      try {
        return await captureElementInChunks({ element, pageAspectRatio, scale });
      } catch (chunkError) {
        lastError = chunkError;
        console.log('[visual-export] Chunked capture retry failed.', { scale, chunkError });
      }
    }
    throw lastError;
  }
};

const buildCanvasSlices = (canvas: HTMLCanvasElement, pageAspectRatio: number): CanvasSlice[] => {
  const sourceWidth = canvas.width;
  const sourceHeight = canvas.height;
  const targetPageHeight = Math.max(1, Math.floor(sourceWidth / pageAspectRatio));
  const offsets = computeVerticalSliceOffsets({ contentHeightPx: sourceHeight, pageHeightPx: targetPageHeight });

  console.log('[visual-export] Building canvas slices.', {
    sourceWidth,
    sourceHeight,
    pageAspectRatio,
    sliceCount: offsets.length,
  });

  return offsets.map((slice, index) => {
    const pageCanvas = document.createElement('canvas');
    pageCanvas.width = sourceWidth;
    pageCanvas.height = slice.heightPx;
    const context = pageCanvas.getContext('2d');
    if (!context) {
      throw new Error('Unable to create export canvas context.');
    }
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    context.drawImage(canvas, 0, slice.yPx, sourceWidth, slice.heightPx, 0, 0, sourceWidth, slice.heightPx);
    const dataUrl = pageCanvas.toDataURL('image/jpeg', 0.92);
    console.log('[visual-export] Prepared image slice.', { index, yPx: slice.yPx, heightPx: slice.heightPx });
    return { ...slice, dataUrl, widthPx: sourceWidth, format: 'JPEG' };
  });
};

const requireElement = (ref: RefObject<HTMLElement>): HTMLElement => {
  const current = ref.current;
  if (!current) {
    throw new Error('Export target is not ready yet.');
  }
  return current;
};

export const exportElementRefToPdf = async ({
  ref,
  fileName,
}: {
  ref: RefObject<HTMLElement>;
  fileName: string;
}): Promise<void> => {
  const element = requireElement(ref);
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidthPt = pdf.internal.pageSize.getWidth();
  const pageHeightPt = pdf.internal.pageSize.getHeight();
  const pageAspectRatio = pageWidthPt / pageHeightPt;
  const slices = await captureSlicesForExport({ element, pageAspectRatio });

  slices.forEach((slice, index) => {
    if (index > 0) {
      pdf.addPage();
    }
    const renderHeightPt = pageWidthPt * (slice.heightPx / slice.widthPx);
    pdf.addImage(slice.dataUrl, slice.format, 0, 0, pageWidthPt, renderHeightPt, undefined, 'FAST');
  });

  console.log('[visual-export] Saving high-fidelity PDF.', { fileName, pageCount: slices.length });
  pdf.save(fileName);
};

export const exportElementRefToPptx = async ({
  ref,
  fileName,
}: {
  ref: RefObject<HTMLElement>;
  fileName: string;
}): Promise<void> => {
  const element = requireElement(ref);
  const PptxCtor = ((pptxgen as unknown as { default?: typeof pptxgen }).default || pptxgen) as any;
  const presentation = new PptxCtor();
  presentation.layout = 'LAYOUT_WIDE';
  const pageAspectRatio = PPTX_SLIDE_WIDTH_IN / PPTX_SLIDE_HEIGHT_IN;
  const slices = await captureSlicesForExport({ element, pageAspectRatio });

  slices.forEach((slice, index) => {
    const slide = presentation.addSlide();
    slide.background = { color: 'FFFFFF' };
    const renderHeightIn = PPTX_SLIDE_WIDTH_IN * (slice.heightPx / slice.widthPx);
    slide.addImage({
      data: slice.dataUrl,
      x: 0,
      y: 0,
      w: PPTX_SLIDE_WIDTH_IN,
      h: renderHeightIn,
    });
    console.log('[visual-export] Added PPTX slide image.', { index, renderHeightIn });
  });

  console.log('[visual-export] Saving high-fidelity PPTX.', { fileName, slideCount: slices.length });
  await presentation.writeFile({ fileName });
};

export const withVisualExportErrorHandling = async <T>(taskName: string, fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn();
  } catch (error) {
    logger.error(`[visual-export] ${taskName} failed`, error);
    throw error;
  }
};
