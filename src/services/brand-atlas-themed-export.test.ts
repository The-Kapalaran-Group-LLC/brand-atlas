import { describe, expect, it } from 'vitest';
import { jsPDF } from 'jspdf';
import { measurePdfCardLayoutForTest, splitCardsIntoSlides } from './brand-atlas-themed-export';

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
});
