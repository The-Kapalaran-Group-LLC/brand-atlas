import { describe, expect, it } from 'vitest';
import {
  hasMatrixDeepDiveContent,
  normalizeSavedMatrixRecord,
  normalizeSavedMatrixRecords,
} from './cultural-saved-projects';

const buildMatrixWithDeepDive = () => ({
  demographics: {
    age: null,
    race: null,
    gender: null,
  },
  sociological_analysis: 'Analysis',
  moments: [
    {
      text: 'Signal one',
      isHighlyUnique: false,
      sourceType: 'Mainstream',
      confidenceLevel: 'high' as const,
      trendLifecycle: 'peaking' as const,
      deepDive: {
        originationDate: '2026-06-11',
        relevance: 'High',
        expandedContext: 'Stored deep dive context',
        strategicImplications: ['Implication one'],
        realWorldExamples: ['Example one'],
        sources: [{ title: 'Example Source', url: 'https://example.com' }],
      },
    },
  ],
  beliefs: [],
  tone: [],
  language: [],
  behaviors: [],
  contradictions: [],
  community: [],
  influencers: [],
  sources: [],
});

describe('cultural-saved-projects', () => {
  it('normalizes Supabase rows by using results payload as matrix and preserving deep dives', () => {
    const normalized = normalizeSavedMatrixRecord({
      id: 'saved-row-id',
      brand: 'Nike',
      audience: 'Gen Z sneaker culture',
      generations: ['Gen Z (1997–2012)'],
      topicFocus: 'Sneaker launches',
      sourcesType: ['Mainstream'],
      hasUploadedDocuments: true,
      custom_name: 'My Saved Report',
      created_at: '2026-06-11T00:00:00.000Z',
      results: buildMatrixWithDeepDive(),
    });

    expect(normalized).not.toBeNull();
    expect(normalized?.id).toBe('saved-row-id');
    expect(normalized?.matrix.moments[0]?.deepDive?.expandedContext).toBe('Stored deep dive context');
    expect(normalized?.customName).toBe('My Saved Report');
  });

  it('normalizes only valid rows when given mixed records', () => {
    const normalized = normalizeSavedMatrixRecords([
      {
        id: 'valid-row',
        audience: 'Audience one',
        results: buildMatrixWithDeepDive(),
      },
      {
        id: 'invalid-row',
        audience: 'Audience two',
      },
    ]);

    expect(normalized).toHaveLength(1);
    expect(normalized[0].id).toBe('valid-row');
  });

  it('detects stored deep-dive content in matrices', () => {
    expect(hasMatrixDeepDiveContent(buildMatrixWithDeepDive())).toBe(true);
    expect(
      hasMatrixDeepDiveContent({
        ...buildMatrixWithDeepDive(),
        moments: [
          {
            text: 'Signal one',
            isHighlyUnique: false,
            sourceType: 'Mainstream',
            confidenceLevel: 'high' as const,
            trendLifecycle: 'peaking' as const,
          },
        ],
      })
    ).toBe(false);
  });
});
