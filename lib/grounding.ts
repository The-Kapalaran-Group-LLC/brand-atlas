const BING_SEARCH_ENDPOINT = 'https://api.bing.microsoft.com/v7.0/search';
const GOOGLE_SEARCH_ENDPOINT = 'https://www.googleapis.com/customsearch/v1';
const ITUNES_SEARCH_ENDPOINT = 'https://itunes.apple.com/search';
const DEFAULT_RESULT_COUNT = 5;
const BING_TIMEOUT_MS = 8000;
const MACRO_STRUCTURAL_SUFFIX = 'annual report OR macro trend';
const PODCAST_TRANSCRIPT_SUFFIX = 'podcast transcript OR episode transcript OR show notes';

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

type GoogleSearchResult = {
  title?: string;
  link?: string;
  snippet?: string;
};

type GoogleSearchResponse = {
  items?: GoogleSearchResult[];
};

type ItunesPodcastResult = {
  trackName?: string;
  collectionName?: string;
  artistName?: string;
  releaseDate?: string;
  description?: string;
  trackViewUrl?: string;
};

type ItunesSearchResponse = {
  results?: ItunesPodcastResult[];
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
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

function cleanHtmlToText(value: string): string {
  return normalizeWhitespace(value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' '));
}

async function fetchItunesPodcasts(query: string): Promise<string[]> {
  const normalizedQuery = normalizeWhitespace(query);
  if (!normalizedQuery) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BING_TIMEOUT_MS);
  const searchUrl = new URL(ITUNES_SEARCH_ENDPOINT);
  searchUrl.searchParams.set('term', normalizedQuery);
  searchUrl.searchParams.set('media', 'podcast');
  searchUrl.searchParams.set('entity', 'podcastEpisode');
  searchUrl.searchParams.set('limit', String(DEFAULT_RESULT_COUNT));
  searchUrl.searchParams.set('country', 'US');
  searchUrl.searchParams.set('lang', 'en_us');

  try {
    console.log('[grounding] iTunes podcast query start', { query: normalizedQuery });
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
      throw new Error(`iTunes podcast API error: ${message}`);
    }

    const data = (await response.json()) as ItunesSearchResponse;
    const snippets = (data.results || [])
      .slice(0, DEFAULT_RESULT_COUNT)
      .map((item) => {
        const trackName = normalizeWhitespace(item.trackName || '');
        const collection = normalizeWhitespace(item.collectionName || '');
        const artist = normalizeWhitespace(item.artistName || '');
        const description = cleanHtmlToText(item.description || '');
        const trackUrl = normalizeWhitespace(item.trackViewUrl || '');
        const date = normalizeWhitespace(item.releaseDate || '');
        const dateLabel = date ? `date=${date.slice(0, 10)}` : '';
        const title = [trackName, collection ? `(${collection})` : '', artist ? `by ${artist}` : '']
          .filter(Boolean)
          .join(' ')
          .trim();
        const summary = [description, dateLabel, trackUrl].filter(Boolean).join(' | ');
        if (title && summary) return `${title}: ${summary}`;
        if (summary) return summary;
        return title;
      })
      .filter(Boolean);

    console.log('[grounding] iTunes podcast query success', {
      query: normalizedQuery,
      snippetCount: snippets.length,
    });
    return snippets;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('iTunes podcast API request timed out.');
    }
    const message = error instanceof Error ? error.message : 'Unknown iTunes podcast API error.';
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
  const transcriptQuery = `${normalizedAudience} ${PODCAST_TRANSCRIPT_SUFFIX}`;

  const provider = resolveSearchProvider();
  const fetcher = provider === 'google' ? fetchGoogle : fetchBing;
  console.log('[grounding] Audience context provider selected', { provider });

  const webLanes: Array<{ key: 'breaking' | 'structural' | 'transcript'; query: string; freshness?: BingSearchFreshness }> = [
    { key: 'breaking', query: breakingQuery, freshness: 'Day' },
    { key: 'structural', query: structuralMacroQuery, freshness: 'Year' },
    { key: 'transcript', query: transcriptQuery, freshness: 'Year' },
  ];

  let webResults = await Promise.allSettled(webLanes.map((lane) => fetcher(lane.query, { freshness: lane.freshness })));
  const podcastResult = await Promise.allSettled([fetchItunesPodcasts(normalizedAudience)]);
  let [breakingResult, structuralResult, transcriptResult] = webResults;
  const [itunesResult] = podcastResult;

  const allWebFailed = webResults.every((result) => result.status === 'rejected');
  if (provider === 'google' && allWebFailed) {
    const firstErrorMessage =
      (breakingResult.status === 'rejected' ? String(breakingResult.reason?.message || '') : '') ||
      (structuralResult.status === 'rejected' ? String(structuralResult.reason?.message || '') : '') ||
      (transcriptResult.status === 'rejected' ? String(transcriptResult.reason?.message || '') : '');

    if (isGoogleCustomSearchAccessError(firstErrorMessage) && hasBingSearchKey()) {
      console.warn('[grounding] Google search unavailable; retrying with Bing fallback.', {
        reason: firstErrorMessage,
      });
      webResults = await Promise.allSettled([
        fetchBing(breakingQuery, { freshness: 'Day' }),
        fetchBing(structuralMacroQuery, { freshness: 'Year' }),
        fetchBing(transcriptQuery, { freshness: 'Year' }),
      ]);
      [breakingResult, structuralResult, transcriptResult] = webResults;
    }
  }

  if (
    breakingResult.status === 'rejected' &&
    structuralResult.status === 'rejected' &&
    transcriptResult.status === 'rejected' &&
    itunesResult.status === 'rejected'
  ) {
    const reason =
      breakingResult.reason?.message ||
      structuralResult.reason?.message ||
      transcriptResult.reason?.message ||
      itunesResult.reason?.message ||
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
  if (transcriptResult.status === 'fulfilled' && transcriptResult.value.length > 0) {
    digestSections.push(`Podcast Transcript Signals:\n${transcriptResult.value.join('\n\n')}`);
  }
  if (itunesResult.status === 'fulfilled' && itunesResult.value.length > 0) {
    digestSections.push(`Podcasts (Apple):\n${itunesResult.value.join('\n\n')}`);
  }

  if (!digestSections.length) {
    return `No web results returned for: "${normalizedAudience}".`;
  }

  console.log('[grounding] Audience context composed', {
    audience: normalizedAudience,
    hasBreakingContext: breakingResult.status === 'fulfilled' && breakingResult.value.length > 0,
    hasStructuralContext: structuralResult.status === 'fulfilled' && structuralResult.value.length > 0,
    hasTranscriptContext: transcriptResult.status === 'fulfilled' && transcriptResult.value.length > 0,
    hasPodcastApiContext: itunesResult.status === 'fulfilled' && itunesResult.value.length > 0,
    sections: digestSections.length,
  });

  return digestSections.join('\n\n');
}
