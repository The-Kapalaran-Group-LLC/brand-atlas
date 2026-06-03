import { describe, expect, it } from 'vitest';
import { jsPDF } from 'jspdf';
import {
  measurePdfCardLayoutForTest,
  paginatePptCardForTest,
  splitCardsIntoSlides,
} from './brand-atlas-themed-export';

describe('brand atlas themed export layout', () => {
  it('chunks cards into slide-sized groups', () => {
    const cards = ['a', 'b', 'c', 'd', 'e'];
    const groups = splitCardsIntoSlides(cards, 2);
    expect(groups).toEqual([
      ['a', 'b'],
      ['c', 'd'],
      ['e'],
    ]);
  });

  it('defaults to one card per chunk when chunk size is invalid', () => {
    const cards = ['a', 'b'];
    const groups = splitCardsIntoSlides(cards, 0);
    expect(groups).toEqual([['a'], ['b']]);
  });

  it('increases card height when bullets wrap across multiple lines', () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const shortLayout = measurePdfCardLayoutForTest(
      doc,
      {
        title: 'Brand Positioning',
        lines: ['Short line.'],
      },
      80
    );
    const longLayout = measurePdfCardLayoutForTest(
      doc,
      {
        title: 'Brand Positioning',
        lines: [
          'This is a much longer bullet line that should wrap across multiple lines in the export layout and therefore require additional card height.',
        ],
      },
      80
    );

    expect(longLayout.height).toBeGreaterThan(shortLayout.height);
    expect(longLayout.bulletGroups[0].length).toBeGreaterThan(1);
  });

  it('paginates long ppt card copy into continuation chunks without dropping bullets', () => {
    const chunks = paginatePptCardForTest(
      {
        title: 'Moments',
        lines: Array.from({ length: 30 }, (_, index) => `Insight ${index + 1} captures a long sentence about audience behavior shifts.`),
      },
      6,
      32
    );

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.title).toBe('Moments');
    expect(chunks[1]?.title).toBe('Moments (CONT.)');
    const allRenderedLines = chunks.flatMap((chunk) => chunk.lines);
    expect(allRenderedLines.some((line) => line.includes('• Insight 1'))).toBe(true);
    expect(allRenderedLines.some((line) => line.includes('• Insight 30'))).toBe(true);
  });
});
