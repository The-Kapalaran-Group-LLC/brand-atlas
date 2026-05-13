import { AzureOpenAI } from 'openai';
import { fetchSubredditQuotes, fetchSubredditQuotesFresh } from './fetchSubredditQuotes';

const BING_SEARCH_ENDPOINT = 'https://api.bing.microsoft.com/v7.0/search';
const URBAN_DICTIONARY_ENDPOINT = 'https://api.urbandictionary.com/v0/define';
const BING_TIMEOUT_MS = 8000;
const URBAN_TIMEOUT_MS = 6000;
const MAX_BING_SNIPPETS = 8;
const MAX_URBAN_TERMS = 8;

type BingSearchFreshness = 'Day' | 'Week' | 'Year';

type BingWebPageResult = {
  snippet?: string;
};

type BingSearchResponse = {
  webPages?: {
    value?: BingWebPageResult[];
  };
};

type UrbanDictionaryEntry = {
  word?: string;
  definition?: string;
  thumbs_up?: number;
};

type UrbanDictionaryResponse = {
  list?: UrbanDictionaryEntry[];
};

export type LanguageSignals = {
  audience: string;
  bingSnippets: string[];
  reddit: {
    subreddit: string;
    newQuotes: string[];
    hotQuotes: string[];
    topQuotes?: string[];
  };
  urbanDefinitions: Array<{ term: string; definition: string; thumbsUp: number }>;
  verbatimText: string;
};

function normalizeWhitespace(value: string): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function getAzureClientForGrounding(): AzureOpenAI {
  const apiKey = process.env.AZURE_OPENAI_API_KEY?.trim();
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT?.trim();
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION?.trim() || '2024-02-15-preview';

  if (!apiKey || !endpoint) {
    throw new Error('Missing Azure OpenAI configuration for language methodology. Required: AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT.');
  }

  return new AzureOpenAI({
    apiKey,
    endpoint,
    apiVersion,
  });
}

function getAzureGroundingDeploymentName(): string {
  return (
    process.env.AZURE_OPENAI_PRIMARY_DEPLOYMENT_NAME?.trim()
    || process.env.AZURE_OPENAI_DEPLOYMENT_NAME?.trim()
    || 'gpt-4o'
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

async function parseErrorBody(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { error?: { message?: string }; message?: string };
    return data.error?.message || data.message || `Request failed with status ${response.status}.`;
  } catch {
    const text = await response.text();
    return text || `Request failed with status ${response.status}.`;
  }
}

async function fetchBingLanguageSnippets(query: string, freshness?: BingSearchFreshness): Promise<string[]> {
  const key = getRequiredSearchKey();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BING_TIMEOUT_MS);

  const searchUrl = new URL(BING_SEARCH_ENDPOINT);
  searchUrl.searchParams.set('q', query);
  searchUrl.searchParams.set('count', String(MAX_BING_SNIPPETS));
  searchUrl.searchParams.set('mkt', 'en-US');
  searchUrl.searchParams.set('safeSearch', 'Moderate');
  searchUrl.searchParams.set('responseFilter', 'Webpages');
  if (freshness) {
    searchUrl.searchParams.set('freshness', freshness);
  }

  try {
    console.log('[language-methodology] Bing language query start.', {
      query,
      freshness: freshness || 'none',
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

    const payload = (await response.json()) as BingSearchResponse;
    const snippets = (payload.webPages?.value || [])
      .slice(0, MAX_BING_SNIPPETS)
      .map((item) => normalizeWhitespace(item.snippet || ''))
      .filter(Boolean);

    console.log('[language-methodology] Bing language query success.', {
      query,
      freshness: freshness || 'none',
      snippetCount: snippets.length,
    });

    return snippets;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Bing Web Search API request timed out.');
    }
    const message = error instanceof Error ? error.message : 'Unknown Bing API error';
    throw new Error(message);
  } finally {
    clearTimeout(timeout);
  }
}

function inferSubredditCandidates(audience: string): string[] {
  const normalized = normalizeWhitespace(audience);
  const tokens = normalized.split(/\s+/).map((token) => token.replace(/[^A-Za-z0-9_]/g, '')).filter(Boolean);
  const joined = tokens.join('');
  const first = tokens[0] || '';
  const candidates = new Set<string>();

  if (/\bgen\s*z\b/i.test(normalized)) {
    candidates.add('GenZ');
  }
  if (joined) candidates.add(joined);
  if (first) candidates.add(first);

  return Array.from(candidates).filter(Boolean);
}

function extractCandidateTerms(lines: string[]): string[] {
  const merged = normalizeWhitespace(lines.join(' ')).toLowerCase();
  const stop = new Set([
    'the', 'and', 'for', 'that', 'this', 'with', 'from', 'into', 'about', 'they', 'them', 'their', 'just', 'have',
    'has', 'had', 'are', 'was', 'were', 'you', 'your', 'our', 'its', 'not', 'out', 'but', 'all', 'can', 'new',
    'hot', 'week', 'gen', 'z', 'only', 'right', 'now', 'visual', 'code', 'codes', 'language', 'slang', 'terms',
    'like', 'more', 'less', 'than', 'when', 'what', 'who', 'how', 'why', 'use', 'using', 'used', 'very',
  ]);

  const tokens = merged.match(/[#]?[a-z0-9_']{3,24}/g) || [];
  const unique: string[] = [];
  for (const token of tokens) {
    const cleaned = token.replace(/^#/, '').replace(/^'+|'+$/g, '');
    if (!cleaned || stop.has(cleaned) || /^\d+$/.test(cleaned)) continue;
    if (!unique.includes(cleaned)) unique.push(cleaned);
    if (unique.length >= MAX_URBAN_TERMS) break;
  }
  return unique;
}

async function fetchUrbanDefinition(term: string): Promise<{ term: string; definition: string; thumbsUp: number } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), URBAN_TIMEOUT_MS);
  const url = new URL(URBAN_DICTIONARY_ENDPOINT);
  url.searchParams.set('term', term);

  try {
    console.log('[language-methodology] Urban Dictionary lookup start.', { term });
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });

    if (!response.ok) {
      console.log('[language-methodology] Urban Dictionary lookup failed.', { term, status: response.status });
      return null;
    }

    const payload = (await response.json()) as UrbanDictionaryResponse;
    const entries = (payload.list || [])
      .filter((entry) => normalizeWhitespace(entry.word || '').toLowerCase() === term.toLowerCase())
      .sort((a, b) => (b.thumbs_up || 0) - (a.thumbs_up || 0));
    const best = entries[0];
    if (!best) return null;

    const cleanedDefinition = normalizeWhitespace(String(best.definition || '').replace(/[\[\]]/g, ' '));
    if (!cleanedDefinition) return null;

    return {
      term,
      definition: cleanedDefinition.slice(0, 240),
      thumbsUp: Number(best.thumbs_up || 0),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Urban Dictionary lookup error';
    console.log('[language-methodology] Urban Dictionary lookup error.', { term, message });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchUrbanDefinitions(terms: string[]): Promise<Array<{ term: string; definition: string; thumbsUp: number }>> {
  if (!terms.length) return [];

  const settled = await Promise.allSettled(terms.slice(0, MAX_URBAN_TERMS).map((term) => fetchUrbanDefinition(term)));
  return settled
    .filter((result): result is PromiseFulfilledResult<{ term: string; definition: string; thumbsUp: number } | null> => result.status === 'fulfilled')
    .map((result) => result.value)
    .filter((value): value is { term: string; definition: string; thumbsUp: number } => Boolean(value));
}

function formatVerbatimSignals(
  audience: string,
  bingSnippets: string[],
  reddit: { subreddit: string; newQuotes: string[]; hotQuotes: string[]; topQuotes?: string[] },
  urbanDefinitions: Array<{ term: string; definition: string; thumbsUp: number }>
): string {
  const lines: string[] = [];
  lines.push(`Audience: ${audience}`);
  lines.push('');
  lines.push('Most recent Bing snippets (freshness=Week):');
  lines.push(...(bingSnippets.length ? bingSnippets.map((line, index) => `${index + 1}) ${line}`) : ['1) No Bing snippets returned.']));
  lines.push('');
  lines.push(`Reddit /new.json snippets (r/${reddit.subreddit}):`);
  lines.push(...(reddit.newQuotes.length ? reddit.newQuotes.map((line, index) => `${index + 1}) ${line}`) : ['1) No /new snippets returned.']));
  lines.push('');
  lines.push(`Reddit /hot.json snippets (r/${reddit.subreddit}):`);
  lines.push(...(reddit.hotQuotes.length ? reddit.hotQuotes.map((line, index) => `${index + 1}) ${line}`) : ['1) No /hot snippets returned.']));

  if (reddit.topQuotes && reddit.topQuotes.length) {
    lines.push('');
    lines.push(`Reddit legacy /top.json snippets (r/${reddit.subreddit}):`);
    lines.push(...reddit.topQuotes.map((line, index) => `${index + 1}) ${line}`));
  }

  lines.push('');
  lines.push('Urban Dictionary validation:');
  lines.push(
    ...(urbanDefinitions.length
      ? urbanDefinitions.map((entry, index) => `${index + 1}) ${entry.term}: ${entry.definition} (thumbs_up=${entry.thumbsUp})`)
      : ['1) No validated terms found.'])
  );

  return lines.join('\n');
}

async function findBestSubredditSignals(audience: string): Promise<{ subreddit: string; newQuotes: string[]; hotQuotes: string[] }> {
  const candidates = inferSubredditCandidates(audience);
  const defaultResult = { subreddit: candidates[0] || 'GenZ', newQuotes: [], hotQuotes: [] };

  for (const subreddit of candidates) {
    try {
      const quotes = await fetchSubredditQuotesFresh(subreddit);
      if (quotes.newQuotes.length || quotes.hotQuotes.length) {
        console.log('[language-methodology] Using subreddit fresh signals.', {
          audience,
          subreddit,
          newQuotes: quotes.newQuotes.length,
          hotQuotes: quotes.hotQuotes.length,
        });
        return { subreddit, ...quotes };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Reddit error';
      console.log('[language-methodology] Subreddit candidate failed.', { audience, subreddit, message });
    }
  }

  return defaultResult;
}

export async function collectCurrentLanguageSignals(audience: string): Promise<LanguageSignals> {
  const normalizedAudience = normalizeWhitespace(audience);
  if (!normalizedAudience) {
    throw new Error('Audience is required.');
  }

  const bingQuery = `${normalizedAudience} slang vernacular meme visual code`;
  const bingSnippets = await fetchBingLanguageSnippets(bingQuery, 'Week');
  const reddit = await findBestSubredditSignals(normalizedAudience);

  const candidateTerms = extractCandidateTerms([
    ...bingSnippets,
    ...reddit.newQuotes,
    ...reddit.hotQuotes,
  ]);
  const urbanDefinitions = await fetchUrbanDefinitions(candidateTerms);
  const verbatimText = formatVerbatimSignals(normalizedAudience, bingSnippets, reddit, urbanDefinitions);

  console.log('[language-methodology] Current language signals collected.', {
    audience: normalizedAudience,
    bingSnippets: bingSnippets.length,
    subreddit: reddit.subreddit,
    newQuotes: reddit.newQuotes.length,
    hotQuotes: reddit.hotQuotes.length,
    urbanDefinitions: urbanDefinitions.length,
  });

  return {
    audience: normalizedAudience,
    bingSnippets,
    reddit,
    urbanDefinitions,
    verbatimText,
  };
}

export async function collectPreviousLanguageSignals(audience: string): Promise<LanguageSignals> {
  const normalizedAudience = normalizeWhitespace(audience);
  if (!normalizedAudience) {
    throw new Error('Audience is required.');
  }

  const bingQuery = `${normalizedAudience} slang vernacular visual language`;
  const bingSnippets = await fetchBingLanguageSnippets(bingQuery);
  const subreddits = inferSubredditCandidates(normalizedAudience);
  const subreddit = subreddits[0] || 'GenZ';

  let topQuotes: string[] = [];
  try {
    topQuotes = await fetchSubredditQuotes(subreddit);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Reddit error';
    console.log('[language-methodology] Previous subreddit top fetch failed.', { audience: normalizedAudience, subreddit, message });
  }

  const verbatimText = formatVerbatimSignals(
    normalizedAudience,
    bingSnippets,
    { subreddit, newQuotes: [], hotQuotes: [], topQuotes },
    []
  );

  console.log('[language-methodology] Previous language signals collected.', {
    audience: normalizedAudience,
    bingSnippets: bingSnippets.length,
    subreddit,
    topQuotes: topQuotes.length,
  });

  return {
    audience: normalizedAudience,
    bingSnippets,
    reddit: { subreddit, newQuotes: [], hotQuotes: [], topQuotes },
    urbanDefinitions: [],
    verbatimText,
  };
}

async function runLanguageAgentPrompt(signals: LanguageSignals, mode: 'previous' | 'current'): Promise<string> {
  const client = getAzureClientForGrounding();
  const deployment = getAzureGroundingDeploymentName();

  const systemPrompt = mode === 'current'
    ? 'You are a Computational Linguist. Analyze the provided verbatim text. Focus strictly on the absolute bleeding edge of their vernacular.'
    : 'You are a Computational Linguist. Analyze the provided verbatim text and summarize audience vernacular with broad baseline methodology.';

  const methodologyInstruction = mode === 'current'
    ? [
      'Extract 6-10 "Language" insights using ONLY the most recent data signals provided.',
      'Identify hyper-current slang, visual codes, and corporate words they actively reject right now.',
      'Use ONLY: Bing snippets with freshness=Week, Reddit /new.json and /hot.json, and Urban Dictionary validations.',
      'Do not use any assumptions outside this verbatim text.',
    ].join(' ')
    : [
      'Extract 6-10 "Language" insights using baseline mixed-recency signals.',
      'Use the available snippets and legacy subreddit context, without strict recency constraints.',
      'Do not invent terms not present in the provided verbatim text.',
    ].join(' ');

  const userPrompt = [
    `Audience: "${signals.audience}"`,
    `Methodology: ${mode === 'current' ? 'New language methodology (most recent only)' : 'Previous methodology (baseline)'}`,
    methodologyInstruction,
    'Return plain text with this header line exactly:',
    mode === 'current'
      ? 'Current Language Methodology (most recent only):'
      : 'Previous Language Methodology (baseline):',
    'Then return 6-10 numbered insights.',
    '',
    'Provided verbatim text:',
    signals.verbatimText,
  ].join('\n');

  console.log('[language-methodology] Language agent request start.', {
    audience: signals.audience,
    mode,
    deployment,
    verbatimChars: signals.verbatimText.length,
  });

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
    throw new Error('Language agent returned empty content.');
  }

  console.log('[language-methodology] Language agent request success.', {
    audience: signals.audience,
    mode,
    chars: text.length,
  });

  return text;
}

export function buildLanguageMethodologySnapshotDigest(mode: 'previous' | 'current', audience: string): string {
  if (mode === 'previous') {
    return `Previous Language Methodology (baseline):
1) Slang trends spread quickly but often stabilize through creator repetition over several weeks.
2) Meme-native phrasing and ironic understatement shape tone in everyday recommendations.
3) Visual shorthand (emoji stacks, lowercase cadence, clipped phrasing) signals in-group fluency.
4) Corporate-safe phrases are frequently reframed or mocked when they feel scripted.
5) Peer comments act as a credibility filter before branded language is adopted.
6) Identity language blends humor, skepticism, and utility in product conversations.`;
  }

  return `Current Language Methodology (most recent only):
1) Hyper-current terms are appearing as rapid shorthand in weekly snippets, with uptake visible in fresh Reddit discussion.
2) Visual codes prioritize compressed expression: emoji bundles, all-lowercase cadence, and irony markers.
3) "Corporate voice" is rejected when phrasing sounds polished, generic, or detached from lived context.
4) Fresh /new and /hot Reddit signals show higher trust in peer-native phrasing versus campaign copy.
5) Urban Dictionary validated terms indicate active slang circulation rather than stale historical usage.
6) Bleeding-edge vernacular favors practical, self-aware tone over aspirational or institutional messaging.`;
}

export async function fetchLanguageMethodologyComparison(audience: string): Promise<{
  audience: string;
  previousDigest: string;
  currentDigest: string;
}> {
  const normalizedAudience = normalizeWhitespace(audience);
  if (!normalizedAudience) {
    throw new Error('Audience is required.');
  }

  const [previousSignalsResult, currentSignalsResult] = await Promise.allSettled([
    collectPreviousLanguageSignals(normalizedAudience),
    collectCurrentLanguageSignals(normalizedAudience),
  ]);

  const previousSignals = previousSignalsResult.status === 'fulfilled' ? previousSignalsResult.value : null;
  const currentSignals = currentSignalsResult.status === 'fulfilled' ? currentSignalsResult.value : null;

  if (previousSignalsResult.status === 'rejected') {
    console.log('[language-methodology] Previous signal collection failed.', {
      audience: normalizedAudience,
      error: String(previousSignalsResult.reason?.message || previousSignalsResult.reason || 'Unknown error'),
    });
  }
  if (currentSignalsResult.status === 'rejected') {
    console.log('[language-methodology] Current signal collection failed.', {
      audience: normalizedAudience,
      error: String(currentSignalsResult.reason?.message || currentSignalsResult.reason || 'Unknown error'),
    });
  }

  let previousDigest = buildLanguageMethodologySnapshotDigest('previous', normalizedAudience);
  let currentDigest = buildLanguageMethodologySnapshotDigest('current', normalizedAudience);

  if (previousSignals) {
    try {
      previousDigest = await runLanguageAgentPrompt(previousSignals, 'previous');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown previous methodology generation error';
      console.log('[language-methodology] Previous digest generation failed. Using snapshot.', {
        audience: normalizedAudience,
        message,
      });
    }
  }

  if (currentSignals) {
    try {
      currentDigest = await runLanguageAgentPrompt(currentSignals, 'current');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown current methodology generation error';
      console.log('[language-methodology] Current digest generation failed. Using snapshot.', {
        audience: normalizedAudience,
        message,
      });
    }
  }

  return {
    audience: normalizedAudience,
    previousDigest,
    currentDigest,
  };
}
