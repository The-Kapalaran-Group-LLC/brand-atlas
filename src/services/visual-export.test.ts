import { describe, expect, it } from 'vitest';
import { computeVerticalSliceOffsets, normalizeCssValueForExportForTest } from './visual-export';

describe('visual export pagination', () => {
  it('creates a single slice when the content fits one page', () => {
    const slices = computeVerticalSliceOffsets({
      contentHeightPx: 1200,
      pageHeightPx: 1400,
    });

    expect(slices).toEqual([{ yPx: 0, heightPx: 1200 }]);
  });

  it('splits tall content into deterministic vertical slices', () => {
    const slices = computeVerticalSliceOffsets({
      contentHeightPx: 3050,
      pageHeightPx: 1000,
    });

    expect(slices).toEqual([
      { yPx: 0, heightPx: 1000 },
      { yPx: 1000, heightPx: 1000 },
      { yPx: 2000, heightPx: 1000 },
      { yPx: 3000, heightPx: 50 },
    ]);
  });

  it('normalizes unsupported modern color syntax for export rendering', () => {
    const raw = 'color-mix(in oklab, oklch(62% 0.15 240) 45%, transparent)';
    const normalized = normalizeCssValueForExportForTest(raw, document);

    expect(normalized).not.toContain('color-mix(');
    expect(normalized).not.toContain('oklch(');
  });
});
