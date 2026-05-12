import { describe, expect, it } from 'vitest';
import {
  buildBrandEvidenceRulesBlock,
  buildBrandDeepDiveQuestionSearchTopic,
  computeRetryDelayMs,
  buildHardDesignTokenRulesBlock,
  buildMatrixQuestionSearchTopic,
  buildBrandModeSubQueries,
  deriveRecentNewsFromSources,
  evaluateQualityGateDecision,
  extractUrlsFromEvidenceDigest,
  formatDevilsAdvocateLens,
  getDeploymentCandidatesFromEnv,
  isTransientOpenAIRequestError,
  normalizeMatrixTerminology,
  resolveMatrixCategoryResultsWithFallback,
  resolveBrandEvidenceMode,
  scoreEvidenceDomain,
  sanitizeDemographicClaim,
  shouldRetryWithAlternateDeployment,
} from './azure-openai';

describe('formatDevilsAdvocateLens', () => {
  it('uses consolidated summary when provided', () => {
    const result = formatDevilsAdvocateLens({
      counterArgument: 'Long counter argument that is intentionally verbose.',
      keyWeaknesses: ['Weakness one', 'Weakness two'],
      consolidatedSummary: 'Tight summary preserving all core claims and risks.',
    });

    expect(result).toBe('Tight summary preserving all core claims and risks.');
  });

  it('falls back to counter argument when consolidated summary is empty', () => {
    const result = formatDevilsAdvocateLens({
      counterArgument: 'Counter argument fallback text.',
      keyWeaknesses: ['Weakness one'],
      consolidatedSummary: '   ',
    });

    expect(result).toBe('Counter argument fallback text.');
  });

  it('returns a friendly fallback when no lens text is available', () => {
    const result = formatDevilsAdvocateLens({
      counterArgument: '   ',
      keyWeaknesses: [],
      consolidatedSummary: '',
    });

    expect(result).toBe('Alternative interpretation not available.');
  });
});

describe('deployment fallback helpers', () => {
  it('builds unique deployment candidates in priority order', () => {
    const candidates = getDeploymentCandidatesFromEnv({
      AZURE_OPENAI_PRIMARY_DEPLOYMENT_NAME: 'gpt-5.4',
      AZURE_OPENAI_DEPLOYMENT_NAME: 'gpt-5.4-mini',
      AZURE_OPENAI_FALLBACK_DEPLOYMENT_NAME: 'gpt-4o-mini',
    } as NodeJS.ProcessEnv);

    expect(candidates).toEqual(['gpt-5.4', 'gpt-5.4-mini', 'gpt-4o-mini', 'gpt-4o']);
  });

  it('recognizes invalid_prompt as retryable on an alternate deployment', () => {
    const shouldRetry = shouldRetryWithAlternateDeployment({
      status: 400,
      code: 'invalid_prompt',
      message: 'Invalid prompt',
    });

    expect(shouldRetry).toBe(true);
  });

  it('does not retry validation style client errors', () => {
    const shouldRetry = shouldRetryWithAlternateDeployment({
      status: 400,
      code: 'unsupported_parameter',
      message: 'Unsupported parameter',
    });

    expect(shouldRetry).toBe(false);
  });

  it('treats 408/409/429/5xx as transient request errors', () => {
    expect(isTransientOpenAIRequestError({ status: 408 })).toBe(true);
    expect(isTransientOpenAIRequestError({ status: 409 })).toBe(true);
    expect(isTransientOpenAIRequestError({ status: 429 })).toBe(true);
    expect(isTransientOpenAIRequestError({ status: 503 })).toBe(true);
  });

  it('treats stream disconnect messages as transient request errors', () => {
    expect(
      isTransientOpenAIRequestError({
        message: 'stream disconnected before completion: response.failed event received.',
      })
    ).toBe(true);
  });

  it('does not classify generic 400 validation errors as transient', () => {
    expect(
      isTransientOpenAIRequestError({
        status: 400,
        code: 'unsupported_parameter',
        message: 'Unsupported parameter',
      })
    ).toBe(false);
  });

  it('computes retry delay with +/-20% jitter around exponential backoff', () => {
    expect(computeRetryDelayMs(0, 0)).toBe(400);
    expect(computeRetryDelayMs(0, 1)).toBe(600);
    expect(computeRetryDelayMs(3, 0.5)).toBe(4000);
  });

  it('caps retry delays at 20 seconds', () => {
    expect(computeRetryDelayMs(10, 0.5)).toBe(20000);
  });
});

describe('matrix terminology normalization', () => {
  it('replaces matrix phrasing with cultural analysis phrasing', () => {
    const normalized = normalizeMatrixTerminology(
      'What the matrix suggests is that this matrix captures weak signals beyond our matrix baseline.'
    );

    expect(normalized).toContain('the cultural analysis');
    expect(normalized).toContain('this cultural analysis');
    expect(normalized).toContain('our cultural analysis');
    expect(normalized.toLowerCase()).not.toContain('matrix');
  });
});

describe('matrix question search topic builder', () => {
  it('builds a search topic from context and question for ask flow web evidence', () => {
    const topic = buildMatrixQuestionSearchTopic('How does Gen Z compare?', {
      audience: 'Gen Z creators',
      brand: 'Nike',
      topicFocus: 'AI usage',
      generations: ['Gen Z (1997–2012)'],
      sourcesType: ['Mainstream', 'Niche/Fringe'],
    });

    expect(topic).toContain('Audience: Gen Z creators');
    expect(topic).toContain('Brand: Nike');
    expect(topic).toContain('Topic Focus: AI usage');
    expect(topic).toContain('Generations: Gen Z (1997–2012)');
    expect(topic).toContain('Source Emphasis: Mainstream, Niche/Fringe');
    expect(topic).toContain('Question: How does Gen Z compare?');
  });
});

describe('brand deep dive question search topic builder', () => {
  it('builds a search topic from design-excavator prompt context and question', () => {
    const topic = buildBrandDeepDiveQuestionSearchTopic('How is Apple evolving visual language?', {
      brands: ['Apple', 'Samsung'],
      analysisObjective: 'Compare visual systems',
      targetAudience: 'Design leaders',
      timeHorizon: '12 months',
    });

    expect(topic).toContain('Brands: Apple, Samsung');
    expect(topic).toContain('Objective: Compare visual systems');
    expect(topic).toContain('Audience: Design leaders');
    expect(topic).toContain('Time Horizon: 12 months');
    expect(topic).toContain('Question: How is Apple evolving visual language?');
  });
});

describe('brand evidence query helpers', () => {
  it('builds targeted brand-mode dork queries from brand context', () => {
    const queries = buildBrandModeSubQueries('Brands: Nike, Adidas; Audience: runners; Topic: footwear');

    expect(queries).toHaveLength(5);
    expect(queries[0]).toContain('"Nike"');
    expect(queries[0]).toContain('"brand guidelines"');
    expect(queries[0]).toContain('"style guide"');
    expect(queries[0]).toContain('site:nike.com');
    expect(queries[1]).toContain('site:sec.gov');
    expect(queries[2]).toContain('site:adweek.com');
    expect(queries[4]).toContain('site:trustpilot.com');
  });

  it('prioritizes corporate guideline search for brand deep-dive topics with website domains before fallback queries', () => {
    const queries = buildBrandModeSubQueries('Brand deep dive for Nike (https://www.nike.com), Adidas (adidas.com) | objective: Compare visual systems');

    expect(queries).toHaveLength(5);
    expect(queries[0]).toContain('"Nike"');
    expect(queries[0]).toContain('site:nike.com');
    expect(queries[0]).toContain('"brand identity"');
    expect(queries[1]).toContain('site:sec.gov');
    expect(queries[2]).toContain('site:adweek.com');
  });
});

describe('evidence domain scoring', () => {
  it('classifies SEC and trade press domains as authoritative', () => {
    expect(scoreEvidenceDomain('https://www.sec.gov/ixviewer/ix.html')).toEqual({ quality: 'authoritative', weight: 1.3 });
    expect(scoreEvidenceDomain('https://www.thedrum.com/news')).toEqual({ quality: 'authoritative', weight: 1.3 });
  });

  it('classifies review and community domains with lower behavioral/community weights', () => {
    expect(scoreEvidenceDomain('https://www.g2.com/products/acme/reviews')).toEqual({ quality: 'behavioral', weight: 0.9 });
    expect(scoreEvidenceDomain('https://www.trustpilot.com/review/example.com')).toEqual({ quality: 'behavioral', weight: 0.9 });
    expect(scoreEvidenceDomain('https://twitter.com/example')).toEqual({ quality: 'community', weight: 0.7 });
  });
});

describe('recent news fallback derivation', () => {
  it('derives article headlines from sources when recentNews is empty', () => {
    const fallback = deriveRecentNewsFromSources([
      {
        title: 'Patagonia expands retail footprint in key U.S. metros',
        url: 'https://www.foxnews.com/lifestyle/patagonia-expands-retail-footprint',
      },
      {
        title: 'Sources',
        url: 'https://example.com/source-index',
      },
    ]);

    expect(fallback).toHaveLength(1);
    expect(fallback[0].headline).toContain('Patagonia expands retail footprint');
    expect(fallback[0].url).toBe('https://www.foxnews.com/lifestyle/patagonia-expands-retail-footprint');
  });

  it('excludes social media URLs from recent news source fallback', () => {
    const fallback = deriveRecentNewsFromSources([
      {
        title: 'Patagonia post on X',
        url: 'https://x.com/patagonia/status/12345',
      },
      {
        title: 'Patagonia expands retail footprint in key U.S. metros',
        url: 'https://www.foxnews.com/lifestyle/patagonia-expands-retail-footprint',
      },
    ]);

    expect(fallback).toHaveLength(1);
    expect(fallback[0].url).toBe('https://www.foxnews.com/lifestyle/patagonia-expands-retail-footprint');
  });
});

describe('evidence digest URL extraction', () => {
  it('returns normalized, unique URLs from the evidence digest', () => {
    const urls = extractUrlsFromEvidenceDigest(`
1. (authoritative) Census Pulse survey | https://www.census.gov/library/stories/example
2. (mainstream) Reuters market signal | http://www.reuters.com/world/example-story
3. (community) duplicate source | https://www.census.gov/library/stories/example
    `);

    expect(urls).toEqual([
      'https://www.census.gov/library/stories/example',
      'http://www.reuters.com/world/example-story',
    ]);
  });
});

describe('demographic claim sanitization', () => {
  it('keeps known demographic claims when they include concrete or directional demographic signals', () => {
    expect(sanitizeDemographicClaim('[KNOWN] 18-24 makes up 42% of the audience')).toBe('18-24 makes up 42% of the audience');
    expect(sanitizeDemographicClaim('[KNOWN] 18-34')).toBe('18-34');
    expect(sanitizeDemographicClaim('[KNOWN] Mostly young audience')).toBe('Mostly young audience');
  });

  it('keeps inferred directional demographics when explicitly labeled', () => {
    expect(sanitizeDemographicClaim('[INFERRED] Women skew in creator-led niches')).toBe('Women skew in creator-led niches');
    expect(sanitizeDemographicClaim('[INFERRED] 18-34')).toBe('18-34');
    expect(sanitizeDemographicClaim('[INFERRED] Women and non-binary consumers')).toBe('Women and non-binary consumers');
    expect(sanitizeDemographicClaim('[INFERRED] Young adults')).toBe('Young adults');
  });

  it('drops speculative or unlabeled demographic claims to reduce hallucination risk', () => {
    expect(sanitizeDemographicClaim('[SPECULATIVE] Predominantly Gen Alpha households')).toBeNull();
    expect(sanitizeDemographicClaim('Likely mostly women')).toBe('Likely mostly women');
    expect(sanitizeDemographicClaim('18-34')).toBe('18-34');
  });
});

describe('structured quality gate evaluation', () => {
  it('requests a retry when quality gate fails before final attempt', () => {
    const decision = evaluateQualityGateDecision(
      { results: [] },
      (payload) => payload.results.length > 0,
      0,
      2
    );

    expect(decision).toBe('retry');
  });

  it('fails when quality gate still fails on the final attempt', () => {
    const decision = evaluateQualityGateDecision(
      { results: [] },
      (payload) => payload.results.length > 0,
      2,
      2
    );

    expect(decision).toBe('fail');
  });

  it('accepts payload when no quality gate is provided', () => {
    const decision = evaluateQualityGateDecision({ results: [] }, undefined, 0, 2);
    expect(decision).toBe('accept');
  });
});

describe('brand evidence mode resolution', () => {
  it('uses strict mode when evidence digest is available', () => {
    const mode = resolveBrandEvidenceMode('Query: Patagonia\nResults:\nStrong evidence', '');
    expect(mode).toBe('strict');
  });

  it('uses strict mode when website grounding exists even if digest is unavailable', () => {
    const mode = resolveBrandEvidenceMode('Evidence digest unavailable.', 'GROUNDING CONTEXT FROM OFFICIAL BRAND/CORPORATE WEBSITES');
    expect(mode).toBe('strict');
  });

  it('uses inferred fallback mode when both evidence sources are unavailable', () => {
    const mode = resolveBrandEvidenceMode('Evidence digest unavailable.', '');
    expect(mode).toBe('inferred-fallback');
  });
});

describe('brand evidence rules prompt mapping', () => {
  it('references the injected grounding context header in strict mode', () => {
    const block = buildBrandEvidenceRulesBlock('strict');
    expect(block).toContain('GROUNDING CONTEXT FROM OFFICIAL BRAND/CORPORATE WEBSITES');
    expect(block).toContain('Evidence digest');
  });

  it('allows explicit inference with [INFERRED] labels in strict mode', () => {
    const block = buildBrandEvidenceRulesBlock('strict');
    expect(block).toContain('MUST label it with [INFERRED]');
  });
});

describe('hard design token rules prompt mapping', () => {
  it('prefers hard tokens but allows inferred fallback when hard tokens exist', () => {
    const block = buildHardDesignTokenRulesBlock(true);
    expect(block).toContain('Prioritize "HARD DESIGN TOKENS"');
    expect(block).toContain('best-estimate value');
    expect(block).toContain('[INFERRED]');
  });

  it('allows estimated values when no hard tokens are available', () => {
    const block = buildHardDesignTokenRulesBlock(false);
    expect(block).toContain('No hard design tokens were successfully scraped');
    expect(block).toContain('best-estimate HEX');
    expect(block).toContain('estimated/unverified');
  });
});

describe('cultural matrix category fallback resolution', () => {
  it('returns empty array for a failed category without rejecting the whole result', async () => {
    const resolved = await resolveMatrixCategoryResultsWithFallback({
      moments: Promise.resolve([
        {
          text: 'Moment insight',
          isHighlyUnique: true,
          sourceType: 'Mainstream',
          confidenceLevel: 'high',
          trendLifecycle: 'peaking',
          isFromDocument: false,
        },
      ]),
      beliefs: Promise.reject(new Error('beliefs failed')),
      tone: Promise.resolve([]),
      language: Promise.resolve([]),
      behaviors: Promise.resolve([]),
      contradictions: Promise.resolve([]),
      community: Promise.resolve([]),
      influencers: Promise.resolve([]),
    });

    expect(resolved.moments).toHaveLength(1);
    expect(resolved.beliefs).toEqual([]);
    expect(resolved.tone).toEqual([]);
  });
});
