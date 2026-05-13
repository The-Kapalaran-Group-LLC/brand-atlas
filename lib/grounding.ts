import { AzureOpenAI } from 'openai';

const BING_SEARCH_ENDPOINT = 'https://api.bing.microsoft.com/v7.0/search';
const GOOGLE_SEARCH_ENDPOINT = 'https://www.googleapis.com/customsearch/v1';
const DEFAULT_RESULT_COUNT = 5;
const BING_TIMEOUT_MS = 8000;
const MACRO_STRUCTURAL_SUFFIX = 'annual report OR macro trend';

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

type BingSearchFreshness = 'Day' | 'Year';
type SearchProvider = 'google' | 'bing';
type GptMethodology = 'previous' | 'current';

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

function resolveSearchProvider(): SearchProvider {
  // Prefer Bing when available so stale/unauthorized Google CSE credentials
  // do not block grounding in environments where both are configured.
  if (hasBingSearchKey()) {
    return 'bing';
  }
  if (getGoogleSearchConfig()) {
    return 'google';
  }
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

export async function fetchAudienceContext(audience: string): Promise<string> {
  const normalizedAudience = normalizeWhitespace(audience || '');
  if (!normalizedAudience) {
    throw new Error('Audience is required to fetch grounding context.');
  }

  const breakingQuery = normalizedAudience;
  const structuralMacroQuery = `${normalizedAudience} ${MACRO_STRUCTURAL_SUFFIX}`;

  const provider = resolveSearchProvider();
  const fetcher = provider === 'google' ? fetchGoogle : fetchBing;
  console.log('[grounding] Audience context provider selected', { provider });

  const webLanes: Array<{ key: 'breaking' | 'structural'; query: string; freshness?: BingSearchFreshness }> = [
    { key: 'breaking', query: breakingQuery, freshness: 'Day' },
    { key: 'structural', query: structuralMacroQuery, freshness: 'Year' },
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
        fetchBing(breakingQuery, { freshness: 'Day' }),
        fetchBing(structuralMacroQuery, { freshness: 'Year' }),
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
    digestSections.push(`Breaking (last 24h):\n${breakingResult.value.join('\n\n')}`);
  }
  if (structuralResult.status === 'fulfilled' && structuralResult.value.length > 0) {
    digestSections.push(`Structural (annual + macro):\n${structuralResult.value.join('\n\n')}`);
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
Breaking (last 24h):
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
