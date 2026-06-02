import { describe, expect, it } from 'vitest';
import type { DeepDiveReport, MatrixItem } from './azure-openai';
import {
  applyDeepDiveReports,
  extractBackfillContext,
  getMissingDeepDiveIndices,
  resolveCulturalPayload,
} from './cultural-deep-dive-backfill';

const makeDeepDive = (suffix: string): DeepDiveReport => ({
  originationDate: `2026-05-${suffix}`,
  relevance: `Relevance ${suffix}`,
  expandedContext: `Expanded context ${suffix}`,
  strategicImplications: [`Implication ${suffix}`],
  realWorldExamples: [`Example ${suffix}`],
  sources: [{ title: `Source ${suffix}`, url: `https://example.com/${suffix}` }],
});

const makeItem = (text: string, deepDive?: DeepDiveReport): MatrixItem => ({
  text,
  isHighlyUnique: false,
  deepDive,
});

describe('cultural-deep-dive-backfill helpers', () => {
  it('returns indices for entries that have text but no deep dive', () => {
    const items: MatrixItem[] = [
      makeItem('Signal A'),
      makeItem('N/A'),
      makeItem('Signal C', makeDeepDive('01')),
      makeItem('Signal D'),
      makeItem(''),
    ];

    expect(getMissingDeepDiveIndices(items)).toEqual([0, 3]);
  });

  it('treats legacy deep_dive entries as already backfilled', () => {
    const items = [
      {
        text: 'Signal with snake case deep dive',
        isHighlyUnique: false,
        deep_dive: makeDeepDive('02'),
      },
      makeItem('Signal missing deep dive'),
    ] as unknown as MatrixItem[];

    expect(getMissingDeepDiveIndices(items)).toEqual([1]);
  });

  it('applies generated reports back onto targeted indices', () => {
    const items: MatrixItem[] = [makeItem('Signal A'), makeItem('Signal B'), makeItem('Signal C')];
    const reports = [makeDeepDive('10'), makeDeepDive('11')];

    const appliedCount = applyDeepDiveReports(items, [0, 2], reports);

    expect(appliedCount).toBe(2);
    expect(items[0]?.deepDive?.expandedContext).toContain('10');
    expect(items[1]?.deepDive).toBeUndefined();
    expect(items[2]?.deepDive?.expandedContext).toContain('11');
  });

  it('extracts backfill context with safe fallbacks', () => {
    const context = extractBackfillContext({
      audience: 'Gen Z sneaker culture',
      brand: 'Nike',
      generations: ['Gen Z'],
      topic_focus: 'Streetwear',
    });

    expect(context).toEqual({
      audience: 'Gen Z sneaker culture',
      brand: 'Nike',
      generations: ['Gen Z'],
      topicFocus: 'Streetwear',
    });
  });

  it('resolves matrix payload before results payload to match AdminPage parsing', () => {
    const fromResults = resolveCulturalPayload({
      results: { moments: [] },
      matrix: { moments: ['ignored'] },
    });
    const fromMatrix = resolveCulturalPayload({ matrix: { moments: [] } });
    const missing = resolveCulturalPayload({ id: 'none' });

    expect(fromResults?.columnName).toBe('matrix');
    expect(fromMatrix?.columnName).toBe('matrix');
    expect(missing).toBeNull();
  });

  it('resolves nested legacy payload shapes', () => {
    const nestedResults = resolveCulturalPayload({
      results: {
        matrix: {
          moments: [{ text: 'A' }],
        },
      },
    });

    const nestedMatrix = resolveCulturalPayload({
      matrix: {
        results: {
          moments: [{ text: 'B' }],
        },
      },
    });

    expect(nestedResults?.columnName).toBe('results');
    expect(Array.isArray(nestedResults?.payload.moments)).toBe(true);
    expect(nestedMatrix?.columnName).toBe('matrix');
    expect(Array.isArray(nestedMatrix?.payload.moments)).toBe(true);
  });

  it('resolves payloads when results is stored as a JSON string', () => {
    const fromJsonString = resolveCulturalPayload({
      results: JSON.stringify({
        matrix: {
          moments: [{ text: 'String encoded payload' }],
          beliefs: [],
          behaviors: [],
          contradictions: [],
          tone: [],
          language: [],
          community: [],
          influencers: [],
        },
      }),
    });

    expect(fromJsonString?.columnName).toBe('results');
    expect(Array.isArray(fromJsonString?.payload.moments)).toBe(true);
    expect((fromJsonString?.payload.moments as unknown[]).length).toBe(1);
  });
});
