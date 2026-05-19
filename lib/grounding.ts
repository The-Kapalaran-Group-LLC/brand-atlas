import { AzureOpenAI } from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import { fetchSubredditQuotes, fetchSubredditQuotesFresh } from './fetchSubredditQuotes';

const BING_SEARCH_ENDPOINT = 'https://api.bing.microsoft.com/v7.0/search';
const GOOGLE_SEARCH_ENDPOINT = 'https://www.googleapis.com/customsearch/v1';
const DEFAULT_RESULT_COUNT = 5;
const BING_TIMEOUT_MS = 8000;
const MACRO_STRUCTURAL_SUFFIX = 'annual report OR macro trend';
const BEHAVIORAL_STABILITY_SUFFIX = 'routine OR routines OR habit OR habits OR guide OR rituals';

type BingWebPageResult = {
  name?: string;
  url?: string;
  snippet?: string;
};

type BingSearchResponse = {
  webPages?: {
    value?: BingWebPageResult[];
  };
};

type BingSearchFreshness = 'Day' | 'Week' | 'Month' | 'Year';
type SearchProvider = 'google' | 'bing';
type GptMethodology = 'previous' | 'current';
type SearchProviderPreference = SearchProvider | 'auto';
type ExperimentalInsightClassification = 'breaking' | 'structural';

const EXPERIMENTAL_QUERY_COUNT = 4;
const EXPERIMENTAL_SNIPPETS_PER_QUERY = 3;

const ExperimentalQueryArraySchema = z.array(z.string()).min(EXPERIMENTAL_QUERY_COUNT);
const ExperimentalSynthesisSchema = z.object({
  insights: z.array(
    z.object({
      classification: z.enum(['breaking', 'structural']),
      insight: z.string(),
      source_citation: z.string(),
    })
  ),
});

type GoogleSearchResult = {
  title?: string;
  link?: string;
  snippet?: string;
};

type GoogleSearchResponse = {
  items?: GoogleSearchResult[];
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function getAzureClientForGrounding(): AzureOpenAI {
  const apiKey = process.env.AZURE_OPENAI_API_KEY?.trim();
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT?.trim();
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION?.trim() || '2024-02-15-preview';

  if (!apiKey || !endpoint) {
    throw new Error('Missing Azure OpenAI configuration for GPT grounding. Required: AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT.');
  }

  return new AzureOpenAI({
    apiKey,
    endpoint,
    apiVersion,
  });
}

function getAzureGroundingDeploymentName(): string {
  return (
    process.env.AZURE_OPENAI_PRIMARY_DEPLOYMENT_NAME?.trim() ||
    process.env.AZURE_OPENAI_DEPLOYMENT_NAME?.trim() ||
    'gpt-4o'
  );
}

function extractCompletionText(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';

  return content
    .map((part) => {
      if (!part || typeof part !== 'object') return '';
      if ('type' in part && (part as { type?: string }).type === 'text') {
        return String((part as { text?: unknown }).text || '');
      }
      if ('text' in part) {
        return String((part as { text?: unknown }).text || '');
      }
      return '';
    })
    .join('')
    .trim();
}

function getRequiredSearchKey(): string {
  const key = process.env.BING_SEARCH_KEY?.trim();
  if (!key) {
    throw new Error('Missing required environment variable: BING_SEARCH_KEY');
  }
  return key;
}

function getGoogleSearchConfig(): { key: string; engineId: string } | null {
  const key = process.env.GOOGLE_SEARCH_API_KEY?.trim() || '';
  const engineId = process.env.GOOGLE_SEARCH_ENGINE_ID?.trim() || process.env.GOOGLE_CSE_CX?.trim() || '';
  if (!key || !engineId) return null;
  return { key, engineId };
}

function resolveSearchProvider(preference?: SearchProviderPreference): SearchProvider {
  const normalizedPreference = (preference || process.env.GROUNDING_SEARCH_PROVIDER || process.env.SEARCH_PROVIDER_PREFERENCE || 'auto')
    .toString()
    .trim()
    .toLowerCase();
  const preferGoogle = normalizedPreference === 'google';
  const preferBing = normalizedPreference === 'bing';
  const hasGoogle = Boolean(getGoogleSearchConfig());
  const hasBing = hasBingSearchKey();

  if (preferGoogle) {
    if (hasGoogle) return 'google';
    if (hasBing) return 'bing';
    return 'google';
  }

  if (preferBing) {
    if (hasBing) return 'bing';
    if (hasGoogle) return 'google';
    return 'bing';
  }

  // Auto mode: preserve current behavior (Bing-first) unless only Google is configured.
  if (hasBing) return 'bing';
  if (hasGoogle) return 'google';
  return 'bing';
}

function hasBingSearchKey(): boolean {
  return Boolean(process.env.BING_SEARCH_KEY?.trim());
}

function isGoogleCustomSearchAccessError(message: string): boolean {
  const normalized = (message || '').toLowerCase();
  return (
    normalized.includes('custom search json api') ||
    normalized.includes('does not have the access to custom search') ||
    normalized.includes('google custom search api error')
  );
}

async function parseErrorBody(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { error?: { message?: string }; message?: string };
    return data.error?.message || data.message || `Bing request failed with status ${response.status}.`;
  } catch {
    const text = await response.text();
    return text || `Bing request failed with status ${response.status}.`;
  }
}

async function fetchBing(
  query: string,
  options?: {
    freshness?: BingSearchFreshness;
  }
): Promise<string[]> {
  const key = getRequiredSearchKey();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BING_TIMEOUT_MS);
  const searchUrl = new URL(BING_SEARCH_ENDPOINT);
  searchUrl.searchParams.set('q', query);
  searchUrl.searchParams.set('count', String(DEFAULT_RESULT_COUNT));
  searchUrl.searchParams.set('mkt', 'en-US');
  searchUrl.searchParams.set('safeSearch', 'Moderate');
  searchUrl.searchParams.set('textDecorations', 'false');
  searchUrl.searchParams.set('textFormat', 'Raw');
  searchUrl.searchParams.set('responseFilter', 'Webpages');
  if (options?.freshness) {
    searchUrl.searchParams.set('freshness', options.freshness);
  }

  try {
    console.log('[grounding] Bing query start', {
      query,
      freshness: options?.freshness || 'none',
    });

    const response = await fetch(searchUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const message = await parseErrorBody(response);
      throw new Error(`Bing Web Search API error: ${message}`);
    }

    const data = (await response.json()) as BingSearchResponse;
    const snippets = (data.webPages?.value || [])
      .slice(0, DEFAULT_RESULT_COUNT)
      .map((item) => normalizeWhitespace(item.snippet || ''))
      .filter(Boolean);

    console.log('[grounding] Bing query success', {
      query,
      freshness: options?.freshness || 'none',
      snippetCount: snippets.length,
    });

    return snippets;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Bing Web Search API request timed out.');
    }

    const message = error instanceof Error ? error.message : 'Unknown Bing Web Search API error.';
    throw new Error(message);
  } finally {
    clearTimeout(timeout);
  }
}

function mapFreshnessToGoogleDateRestrict(freshness?: BingSearchFreshness): string | null {
  if (freshness === 'Day') return 'd1';
  if (freshness === 'Week') return 'd7';
  if (freshness === 'Month') return 'm1';
  if (freshness === 'Year') return 'y1';
  return null;
}

async function fetchGoogle(
  query: string,
  options?: {
    freshness?: BingSearchFreshness;
  }
): Promise<string[]> {
  const config = getGoogleSearchConfig();
  if (!config) {
    throw new Error('Missing required environment variables: GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_ENGINE_ID (or GOOGLE_CSE_CX).');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BING_TIMEOUT_MS);
  const searchUrl = new URL(GOOGLE_SEARCH_ENDPOINT);
  searchUrl.searchParams.set('key', config.key);
  searchUrl.searchParams.set('cx', config.engineId);
  searchUrl.searchParams.set('q', query);
  searchUrl.searchParams.set('num', String(DEFAULT_RESULT_COUNT));
  searchUrl.searchParams.set('safe', 'active');
  searchUrl.searchParams.set('hl', 'en');
  searchUrl.searchParams.set('gl', 'us');

  const dateRestrict = mapFreshnessToGoogleDateRestrict(options?.freshness);
  if (dateRestrict) {
    searchUrl.searchParams.set('dateRestrict', dateRestrict);
  }

  try {
    console.log('[grounding] Google query start', {
      query,
      freshness: options?.freshness || 'none',
      hasDateRestrict: Boolean(dateRestrict),
    });

    const response = await fetch(searchUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const message = await parseErrorBody(response);
      throw new Error(`Google Custom Search API error: ${message}`);
    }

    const data = (await response.json()) as GoogleSearchResponse;
    const snippets = (data.items || [])
      .slice(0, DEFAULT_RESULT_COUNT)
      .map((item) => {
        const title = normalizeWhitespace(item.title || '');
        const snippet = normalizeWhitespace(item.snippet || '');
        const link = normalizeWhitespace(item.link || '');
        if (title && snippet) {
          return `${title}: ${snippet}${link ? ` (${link})` : ''}`;
        }
        if (snippet) {
          return `${snippet}${link ? ` (${link})` : ''}`;
        }
        if (title) {
          return `${title}${link ? ` (${link})` : ''}`;
        }
        return '';
      })
      .filter(Boolean);

    console.log('[grounding] Google query success', {
      query,
      freshness: options?.freshness || 'none',
      snippetCount: snippets.length,
    });

    return snippets;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Google Custom Search API request timed out.');
    }

    const message = error instanceof Error ? error.message : 'Unknown Google Custom Search API error.';
    throw new Error(message);
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchAudienceContext(
  audience: string,
  options?: { behaviorFocus?: boolean; provider?: SearchProviderPreference }
): Promise<string> {
  const normalizedAudience = normalizeWhitespace(audience || '');
  if (!normalizedAudience) {
    throw new Error('Audience is required to fetch grounding context.');
  }
  const behaviorFocus = Boolean(options?.behaviorFocus);

  const breakingQuery = behaviorFocus
    ? `${normalizedAudience} ${BEHAVIORAL_STABILITY_SUFFIX}`
    : normalizedAudience;
  const structuralMacroQuery = behaviorFocus
    ? `${normalizedAudience} ${MACRO_STRUCTURAL_SUFFIX} ${BEHAVIORAL_STABILITY_SUFFIX}`
    : `${normalizedAudience} ${MACRO_STRUCTURAL_SUFFIX}`;

  const provider = resolveSearchProvider(options?.provider);
  const fetcher = provider === 'google' ? fetchGoogle : fetchBing;
  console.log('[grounding] Audience context provider selected', { provider, behaviorFocus });

  const webLanes: Array<{ key: 'breaking' | 'structural'; query: string; freshness?: BingSearchFreshness }> = [
    { key: 'breaking', query: breakingQuery, freshness: behaviorFocus ? undefined : 'Week' },
    { key: 'structural', query: structuralMacroQuery, freshness: behaviorFocus ? undefined : 'Year' },
  ];

  let webResults = await Promise.allSettled(webLanes.map((lane) => fetcher(lane.query, { freshness: lane.freshness })));
  let [breakingResult, structuralResult] = webResults;

  const allWebFailed = webResults.every((result) => result.status === 'rejected');
  if (provider === 'google' && allWebFailed) {
    const firstErrorMessage =
      (breakingResult.status === 'rejected' ? String(breakingResult.reason?.message || '') : '') ||
      (structuralResult.status === 'rejected' ? String(structuralResult.reason?.message || '') : '');

    if (isGoogleCustomSearchAccessError(firstErrorMessage) && hasBingSearchKey()) {
      console.warn('[grounding] Google search unavailable; retrying with Bing fallback.', {
        reason: firstErrorMessage,
      });
      webResults = await Promise.allSettled([
        fetchBing(breakingQuery, { freshness: behaviorFocus ? undefined : 'Week' }),
        fetchBing(structuralMacroQuery, { freshness: behaviorFocus ? undefined : 'Year' }),
      ]);
      [breakingResult, structuralResult] = webResults;
    }
  }

  if (breakingResult.status === 'rejected' && structuralResult.status === 'rejected') {
    const reason =
      breakingResult.reason?.message ||
      structuralResult.reason?.message ||
      'Search API error.';
    throw new Error(String(reason));
  }

  const digestSections: string[] = [];
  if (breakingResult.status === 'fulfilled' && breakingResult.value.length > 0) {
    const breakingLabel = behaviorFocus
      ? 'Behavioral routines (up-to-date, stabilized):'
      : 'Breaking (last 7 days):';
    digestSections.push(`${breakingLabel}\n${breakingResult.value.join('\n\n')}`);
  }
  if (structuralResult.status === 'fulfilled' && structuralResult.value.length > 0) {
    const structuralLabel = behaviorFocus
      ? 'Behavioral macro context (habit persistence + guides):'
      : 'Structural (annual + macro):';
    digestSections.push(`${structuralLabel}\n${structuralResult.value.join('\n\n')}`);
  }

  if (!digestSections.length) {
    return `No web results returned for: "${normalizedAudience}".`;
  }

  console.log('[grounding] Audience context composed', {
    audience: normalizedAudience,
    hasBreakingContext: breakingResult.status === 'fulfilled' && breakingResult.value.length > 0,
    hasStructuralContext: structuralResult.status === 'fulfilled' && structuralResult.value.length > 0,
    sections: digestSections.length,
  });

  return digestSections.join('\n\n');
}

export async function fetchAudienceContextPreviousMethodology(audience: string): Promise<string> {
  const normalizedAudience = normalizeWhitespace(audience || '');
  if (!normalizedAudience) {
    throw new Error('Audience is required to fetch grounding context.');
  }

  const provider = resolveSearchProvider();
  const fetcher = provider === 'google' ? fetchGoogle : fetchBing;
  console.log('[grounding] Previous methodology provider selected', { provider });

  let baselineResult = await Promise.allSettled([fetcher(normalizedAudience)]);

  if (provider === 'google' && baselineResult[0].status === 'rejected') {
    const message = String(baselineResult[0].reason?.message || '');
    if (isGoogleCustomSearchAccessError(message) && hasBingSearchKey()) {
      console.warn('[grounding] Previous methodology Google unavailable; retrying with Bing fallback.', { reason: message });
      baselineResult = await Promise.allSettled([fetchBing(normalizedAudience)]);
    }
  }

  const [result] = baselineResult;
  if (result.status === 'rejected') {
    throw new Error(String(result.reason?.message || 'Search API error.'));
  }

  if (!result.value.length) {
    return `No web results returned for: "${normalizedAudience}".`;
  }

  console.log('[grounding] Previous methodology context composed', {
    audience: normalizedAudience,
    snippets: result.value.length,
  });

  return `Previous Methodology (single-lane baseline):\n${result.value.join('\n\n')}`;
}

function parseJsonArrayFromText(value: string): string[] {
  const normalized = String(value || '').trim();
  if (!normalized) return [];

  try {
    const parsed = JSON.parse(normalized);
    return Array.isArray(parsed) ? parsed.map((item) => normalizeWhitespace(String(item || ''))).filter(Boolean) : [];
  } catch {
    const match = normalized.match(/\[[\s\S]*\]/);
    if (!match) return [];
    try {
      const parsed = JSON.parse(match[0]);
      return Array.isArray(parsed) ? parsed.map((item) => normalizeWhitespace(String(item || ''))).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
}

async function generateExperimentalBroadIntakeQueries(audience: string): Promise<string[]> {
  const client = getAzureClientForGrounding();
  const deployment = getAzureGroundingDeploymentName();
  const normalizedAudience = normalizeWhitespace(audience || '');

  console.log('[grounding] Experimental broad-intake query expansion start.', {
    audience: normalizedAudience,
    deployment,
  });

  const completion = await client.chat.completions.create({
    model: deployment,
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content: 'You are a cultural research assistant. Your job is to cast a wide net for information.',
      },
      {
        role: 'user',
        content: `Generate 4 diverse, natural-language search queries to uncover emerging macro-economic trends and daily behavioral rituals for the audience: "${normalizedAudience}". Do not use boolean operators. Return ONLY a JSON array of strings.`,
      },
    ],
  });

  const raw = extractCompletionText(completion.choices?.[0]?.message?.content);
  const parsed = parseJsonArrayFromText(raw);

  console.log('[grounding] Experimental broad-intake query expansion complete.', {
    audience: normalizedAudience,
    rawChars: raw.length,
    queryCount: parsed.length,
  });

  const validated = ExperimentalQueryArraySchema.safeParse(parsed);
  if (validated.success) {
    return validated.data.slice(0, EXPERIMENTAL_QUERY_COUNT);
  }

  const fallback = [
    `${normalizedAudience} macroeconomic pressure and spending behavior right now`,
    `${normalizedAudience} daily rituals and routine behavior in work school and home life`,
    `${normalizedAudience} creator trust practical utility trends in purchasing and adoption`,
    `${normalizedAudience} value-first choices and identity signaling patterns`,
  ];

  console.log('[grounding] Experimental broad-intake query expansion fallback applied.', {
    audience: normalizedAudience,
    fallbackCount: fallback.length,
  });

  return fallback;
}

async function synthesizeExperimentalEvidenceDigest(
  audience: string,
  rawSnippets: Array<{ query: string; snippet: string }>
): Promise<z.infer<typeof ExperimentalSynthesisSchema>> {
  const client = getAzureClientForGrounding();
  const deployment = getAzureGroundingDeploymentName();
  const snippetsJson = JSON.stringify(rawSnippets, null, 2);

  console.log('[grounding] Experimental strict synthesis start.', {
    audience,
    deployment,
    snippetCount: rawSnippets.length,
  });

  const completion = await client.chat.completions.create({
    model: deployment,
    temperature: 0.1,
    response_format: zodResponseFormat(ExperimentalSynthesisSchema, 'experimental_evidence_digest'),
    messages: [
      {
        role: 'system',
        content: 'You are a strict Macro-Economic and Behavioral Analyst. You will be provided with raw web snippets from Google/Bing. Your task is to extract exact evidence and format it strictly according to the requested JSON schema. Rules: 1. NEVER hallucinate trends. If a trend is not explicitly supported by the snippets, omit it. 2. Every insight must include an exact, verbatim source_citation matching the provided snippet. 3. Classify each insight strictly as "breaking" (last 7 days) or "structural" (annual/macro).',
      },
      {
        role: 'user',
        content: `Audience: "${audience}"\nRaw Snippets: ${snippetsJson}\nExtract the evidence digest.`,
      },
    ],
  });

  const text = extractCompletionText(completion.choices?.[0]?.message?.content);
  const parsed = ExperimentalSynthesisSchema.parse(JSON.parse(text || '{}'));

  console.log('[grounding] Experimental strict synthesis complete.', {
    audience,
    insightCount: parsed.insights.length,
  });

  return parsed;
}

function buildExperimentalDigest(
  audience: string,
  queries: string[],
  insights: Array<{ classification: ExperimentalInsightClassification; insight: string; source_citation: string }>
): string {
  const breaking = insights.filter((item) => item.classification === 'breaking');
  const structural = insights.filter((item) => item.classification === 'structural');

  const queryLines = queries
    .slice(0, EXPERIMENTAL_QUERY_COUNT)
    .map((query, index) => `${index + 1}) ${query}`)
    .join('\n');

  const formatInsightLines = (items: Array<{ insight: string; source_citation: string }>, emptyLabel: string): string => {
    if (!items.length) return emptyLabel;
    return items
      .map((item, index) => `${index + 1}) ${item.insight}\n   citation: "${item.source_citation}"`)
      .join('\n');
  };

  return `Experimental Methodology (broad-intake + strict synthesis):
Audience: ${audience}

Broad intake queries:
${queryLines}

Breaking (last 7 days):
${formatInsightLines(breaking, 'No explicitly supported breaking insights found in provided snippets.')}

Structural (annual + macro):
${formatInsightLines(structural, 'No explicitly supported structural insights found in provided snippets.')}`;
}

export async function fetchAudienceContextExperimentalMethodology(
  audience: string,
  options?: {
    provider?: SearchProviderPreference;
    queryGenerator?: (audience: string) => Promise<string[]>;
    synthesisGenerator?: (
      params: { audience: string; rawSnippets: Array<{ query: string; snippet: string }> }
    ) => Promise<z.infer<typeof ExperimentalSynthesisSchema>>;
  }
): Promise<string> {
  const normalizedAudience = normalizeWhitespace(audience || '');
  if (!normalizedAudience) {
    throw new Error('Audience is required to fetch experimental grounding context.');
  }

  const provider = resolveSearchProvider(options?.provider);
  const fetcher = provider === 'google' ? fetchGoogle : fetchBing;
  const queryGenerator = options?.queryGenerator || generateExperimentalBroadIntakeQueries;
  const synthesisGenerator = options?.synthesisGenerator
    || ((params: { audience: string; rawSnippets: Array<{ query: string; snippet: string }> }) =>
      synthesizeExperimentalEvidenceDigest(params.audience, params.rawSnippets));

  console.log('[grounding] Experimental methodology start.', {
    audience: normalizedAudience,
    provider,
  });

  const rawQueries = await queryGenerator(normalizedAudience);
  const uniqueQueries = Array.from(
    new Set((rawQueries || []).map((query) => normalizeWhitespace(String(query || ''))).filter(Boolean))
  ).slice(0, EXPERIMENTAL_QUERY_COUNT);

  if (!uniqueQueries.length) {
    throw new Error('Experimental methodology could not generate broad-intake queries.');
  }

  while (uniqueQueries.length < EXPERIMENTAL_QUERY_COUNT) {
    uniqueQueries.push(`${normalizedAudience} trend signal ${uniqueQueries.length + 1}`);
  }

  const settled = await Promise.allSettled(uniqueQueries.map((query) => fetcher(query)));
  const rawSnippets: Array<{ query: string; snippet: string }> = [];
  settled.forEach((result, index) => {
    if (result.status !== 'fulfilled') return;
    result.value
      .slice(0, EXPERIMENTAL_SNIPPETS_PER_QUERY)
      .forEach((snippet) => rawSnippets.push({ query: uniqueQueries[index], snippet }));
  });

  if (!rawSnippets.length) {
    return `Experimental Methodology (broad-intake + strict synthesis):
Audience: ${normalizedAudience}
No web results returned for broad-intake queries.`;
  }

  const synthesis = await synthesisGenerator({
    audience: normalizedAudience,
    rawSnippets,
  });

  const snippetSet = new Set(rawSnippets.map((item) => normalizeWhitespace(item.snippet)));
  const strictlyGroundedInsights = synthesis.insights
    .map((item) => ({
      classification: item.classification,
      insight: normalizeWhitespace(item.insight),
      source_citation: normalizeWhitespace(item.source_citation),
    }))
    .filter((item) => item.insight && item.source_citation && snippetSet.has(item.source_citation));

  console.log('[grounding] Experimental methodology complete.', {
    audience: normalizedAudience,
    queryCount: uniqueQueries.length,
    snippetCount: rawSnippets.length,
    groundedInsightCount: strictlyGroundedInsights.length,
  });

  return buildExperimentalDigest(normalizedAudience, uniqueQueries, strictlyGroundedInsights);
}

function inferCommunitySubredditCandidates(audience: string): string[] {
  const normalizedAudience = normalizeWhitespace(audience);
  const tokens = normalizedAudience
    .split(/\s+/)
    .map((token) => token.replace(/[^A-Za-z0-9_]/g, ''))
    .filter(Boolean);
  const joined = tokens.join('');
  const first = tokens[0] || '';
  const candidates = new Set<string>();

  if (/\bgen\s*z\b/i.test(normalizedAudience)) {
    candidates.add('GenZ');
    candidates.add('teenagers');
  }
  if (joined) candidates.add(joined);
  if (first) candidates.add(first);

  return Array.from(candidates).filter(Boolean).slice(0, 2);
}

export async function fetchCommunityContextPreviousMethodology(audience: string): Promise<string> {
  const normalizedAudience = normalizeWhitespace(audience || '');
  if (!normalizedAudience) {
    throw new Error('Audience is required to fetch community grounding context.');
  }

  const provider = resolveSearchProvider();
  const fetcher = provider === 'google' ? fetchGoogle : fetchBing;
  const baselineQuery = `${normalizedAudience} community identity anchors reddit discord substack`;

  console.log('[grounding] Previous community methodology provider selected', {
    provider,
    audience: normalizedAudience,
  });

  let baselineResult = await Promise.allSettled([fetcher(baselineQuery)]);

  if (provider === 'google' && baselineResult[0].status === 'rejected') {
    const message = String(baselineResult[0].reason?.message || '');
    if (isGoogleCustomSearchAccessError(message) && hasBingSearchKey()) {
      console.warn('[grounding] Previous community methodology Google unavailable; retrying with Bing fallback.', {
        reason: message,
      });
      baselineResult = await Promise.allSettled([fetchBing(baselineQuery)]);
    }
  }

  const [result] = baselineResult;
  if (result.status === 'rejected') {
    throw new Error(String(result.reason?.message || 'Search API error.'));
  }

  if (!result.value.length) {
    return `No web results returned for: "${normalizedAudience}".`;
  }

  return `Previous Community Methodology (single-lane baseline):
${result.value.join('\n\n')}`;
}

export async function fetchCommunityContextBarbellMethodology(audience: string): Promise<string> {
  const normalizedAudience = normalizeWhitespace(audience || '');
  if (!normalizedAudience) {
    throw new Error('Audience is required to fetch community grounding context.');
  }

  const provider = resolveSearchProvider();
  const fetcher = provider === 'google' ? fetchGoogle : fetchBing;
  const foundationalQuery = `${normalizedAudience} top subreddits forum communities legacy creators identity`;
  const breakoutQuery = `${normalizedAudience} Discord Substack Reddit emerging micro community growth last 30 days`;

  console.log('[grounding] Community barbell methodology start', {
    provider,
    audience: normalizedAudience,
  });

  let webResults = await Promise.allSettled([
    fetcher(foundationalQuery),
    fetcher(breakoutQuery, { freshness: 'Month' }),
  ]);
  let [foundationalResult, breakoutResult] = webResults;

  const allWebFailed = webResults.every((result) => result.status === 'rejected');
  if (provider === 'google' && allWebFailed) {
    const firstErrorMessage =
      (foundationalResult.status === 'rejected' ? String(foundationalResult.reason?.message || '') : '') ||
      (breakoutResult.status === 'rejected' ? String(breakoutResult.reason?.message || '') : '');

    if (isGoogleCustomSearchAccessError(firstErrorMessage) && hasBingSearchKey()) {
      console.warn('[grounding] Community barbell Google unavailable; retrying with Bing fallback.', {
        reason: firstErrorMessage,
      });
      webResults = await Promise.allSettled([
        fetchBing(foundationalQuery),
        fetchBing(breakoutQuery, { freshness: 'Month' }),
      ]);
      [foundationalResult, breakoutResult] = webResults;
    }
  }

  const subredditCandidates = inferCommunitySubredditCandidates(normalizedAudience);
  const redditSettled = await Promise.allSettled(
    subredditCandidates.map(async (subreddit) => {
      const [foundationalQuotes, freshQuotes] = await Promise.all([
        fetchSubredditQuotes(subreddit, 4),
        fetchSubredditQuotesFresh(subreddit, 4),
      ]);
      return { subreddit, foundationalQuotes, freshQuotes };
    })
  );

  const redditSignals = redditSettled
    .filter(
      (result): result is PromiseFulfilledResult<{
        subreddit: string;
        foundationalQuotes: string[];
        freshQuotes: { newQuotes: string[]; hotQuotes: string[] };
      }> => result.status === 'fulfilled'
    )
    .map((result) => result.value)
    .find((candidate) =>
      candidate.foundationalQuotes.length > 0
      || candidate.freshQuotes.newQuotes.length > 0
      || candidate.freshQuotes.hotQuotes.length > 0
    );

  if (foundationalResult.status === 'rejected' && breakoutResult.status === 'rejected' && !redditSignals) {
    const reason =
      foundationalResult.reason?.message ||
      breakoutResult.reason?.message ||
      'Community barbell retrieval failed.';
    throw new Error(String(reason));
  }

  const foundationalLines: string[] = [];
  const breakoutLines: string[] = [];

  if (foundationalResult.status === 'fulfilled') {
    foundationalLines.push(...foundationalResult.value);
  }
  if (breakoutResult.status === 'fulfilled') {
    breakoutLines.push(...breakoutResult.value);
  }

  if (redditSignals?.foundationalQuotes?.length) {
    foundationalLines.push(`Reddit (r/${redditSignals.subreddit} top posts): ${redditSignals.foundationalQuotes.join(' | ')}`);
  }
  const freshReddit = [...(redditSignals?.freshQuotes?.newQuotes || []), ...(redditSignals?.freshQuotes?.hotQuotes || [])];
  if (freshReddit.length > 0 && redditSignals?.subreddit) {
    breakoutLines.push(`Reddit (r/${redditSignals.subreddit} new/hot posts): ${freshReddit.join(' | ')}`);
  }

  if (!foundationalLines.length && !breakoutLines.length) {
    return `No web results returned for: "${normalizedAudience}".`;
  }

  const fallbackPlatformLocation = 'If exact micro-community names are uncertain, fallback to platform location only (for example: Reddit, Discord, Substack).';
  const sections: string[] = [];
  if (foundationalLines.length > 0) {
    sections.push(`Foundational hubs (long-standing):\n${foundationalLines.join('\n\n')}`);
  }
  if (breakoutLines.length > 0) {
    sections.push(`Breakout micro-communities (last 30 days):\n${breakoutLines.join('\n\n')}`);
  }
  sections.push(`Location fallback rule:\n${fallbackPlatformLocation}`);

  return sections.join('\n\n');
}

export async function fetchAudienceContextWithGptSearch(audience: string, methodology: GptMethodology): Promise<string> {
  const normalizedAudience = normalizeWhitespace(audience || '');
  if (!normalizedAudience) {
    throw new Error('Audience is required to fetch GPT grounding context.');
  }

  const client = getAzureClientForGrounding();
  const deployment = getAzureGroundingDeploymentName();

  const methodologyLabel = methodology === 'current'
    ? 'current dual-lane macro methodology'
    : 'previous single-lane baseline methodology';

  console.log('[grounding] GPT grounding request start', {
    audience: normalizedAudience,
    methodology,
    methodologyLabel,
    deployment,
  });

  const systemPrompt = [
    'You are a macro-economic trend analyst generating an evidence digest.',
    'Use concise, factual language and avoid marketing filler.',
    'Do not invent URLs. If specific sourcing is uncertain, explicitly state uncertainty.',
    'Prioritize macro-economic forces and culturally relevant behavior implications.',
  ].join(' ');

  const userPrompt = methodology === 'current'
    ? `Audience: "${normalizedAudience}".
Generate an evidence digest for the current dual-lane methodology.
Return plain text with exactly these two headers:
Breaking (last 7 days):
Structural (annual + macro):
Under each header provide 3-6 concise evidence lines.`
    : `Audience: "${normalizedAudience}".
Generate an evidence digest for the previous single-lane baseline methodology.
Return plain text with exactly this header:
Previous Methodology (single-lane baseline):
Then provide 6-10 concise evidence lines.`;

  const completion = await client.chat.completions.create({
    model: deployment,
    temperature: 0.2,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });

  const text = extractCompletionText(completion.choices?.[0]?.message?.content);
  if (!text) {
    throw new Error('GPT grounding returned empty content.');
  }

  console.log('[grounding] GPT grounding request success', {
    audience: normalizedAudience,
    methodology,
    chars: text.length,
  });

  return text;
}
