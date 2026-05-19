import { describe, expect, it } from 'vitest';
import {
  createGenZMockBrandAtlasDocument,
  validateBrandAtlasDocument,
} from './brand-atlas-export-model';
import { createCanonicalPagePlan } from './brand-atlas-export-renderer-contract';

describe('brand-atlas export model', () => {
  it('creates a valid canonical document for Gen Z mock exports', () => {
    const doc = createGenZMockBrandAtlasDocument();
    const parsed = validateBrandAtlasDocument(doc);

    expect(parsed.version).toBe('1.0');
    expect(parsed.meta.audience).toBe('Gen Z');
    expect(parsed.pages.length).toBeGreaterThanOrEqual(3);
    expect(parsed.theme.colors.primary).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('builds deterministic renderer page plans from canonical JSON', () => {
    const doc = createGenZMockBrandAtlasDocument();
    const plan = createCanonicalPagePlan(doc);

    expect(plan.length).toBe(doc.pages.length);
    expect(plan[0]?.title.length).toBeGreaterThan(0);
    expect(plan.some((page) => page.lines.some((line) => line.startsWith('• ')))).toBe(true);
  });
});
