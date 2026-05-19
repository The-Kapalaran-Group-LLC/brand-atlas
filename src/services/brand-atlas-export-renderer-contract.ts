import { BrandAtlasDocument, BrandAtlasPageBlock } from './brand-atlas-export-model';

export type CanonicalPagePlan = {
  id: string;
  title: string;
  subtitle?: string;
  lines: string[];
};

export interface BrandAtlasRenderer<TOutput> {
  name: 'pdf' | 'pptx';
  render: (document: BrandAtlasDocument) => Promise<TOutput>;
}

const blockToLines = (block: BrandAtlasPageBlock): string[] => {
  if (block.type === 'text') {
    return [block.text];
  }
  if (block.type === 'quote') {
    return [block.source ? `"${block.text}" — ${block.source}` : `"${block.text}"`];
  }
  if (block.type === 'stat') {
    return [block.support ? `${block.label}: ${block.value} (${block.support})` : `${block.label}: ${block.value}`];
  }

  const lines: string[] = [];
  if (block.title) {
    lines.push(block.title);
  }
  block.items.forEach((item) => lines.push(`• ${item}`));
  return lines;
};

export const createCanonicalPagePlan = (document: BrandAtlasDocument): CanonicalPagePlan[] => {
  const pages = document.pages.map((page) => ({
    id: page.id,
    title: page.title,
    subtitle: page.subtitle,
    lines: page.blocks.flatMap(blockToLines),
  }));

  console.log('[brand-atlas-export] canonical page plan created', {
    pageCount: pages.length,
    totalLines: pages.reduce((sum, page) => sum + page.lines.length, 0),
  });
  return pages;
};
