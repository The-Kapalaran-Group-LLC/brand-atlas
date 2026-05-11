const GOOGLE_SEARCH_ENDPOINT = 'https://www.googleapis.com/customsearch/v1';
const BING_SEARCH_ENDPOINT = 'https://api.bing.microsoft.com/v7.0/search';
const ITUNES_SEARCH_ENDPOINT = 'https://itunes.apple.com/search';

async function parseErrorBody(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: { message?: string }; message?: string };
    return payload.error?.message || payload.message || `HTTP ${response.status}`;
  } catch {
    try {
      const text = await response.text();
      return text || `HTTP ${response.status}`;
    } catch {
      return `HTTP ${response.status}`;
    }
  }
}

function suggestionForError(message: string): string | null {
  const normalized = (message || '').toLowerCase();
  if (!normalized) return null;
  if (normalized.includes('api key not valid')) {
    return 'GOOGLE_SEARCH_API_KEY appears invalid. Regenerate the key and update Vercel env vars.';
  }
  if (normalized.includes('referer') || normalized.includes('referrer')) {
    return 'Google key likely has HTTP referrer restrictions. For server-side Vercel calls, remove referrer restrictions or use an unrestricted/server-restricted key.';
  }
  if (normalized.includes('custom search json api has not been used')) {
    return 'Enable "Custom Search JSON API" in Google Cloud APIs for the same project as the API key.';
  }
  if (normalized.includes('does not have the access to custom search') || normalized.includes('permission')) {
    return 'Verify billing is enabled and the key/project has Custom Search JSON API access.';
  }
  if (normalized.includes('invalid value') && normalized.includes('cx')) {
    return 'GOOGLE_SEARCH_ENGINE_ID / GOOGLE_CSE_CX appears invalid. Use your exact Programmable Search Engine ID.';
  }
  return null;
}

export default async function handler(req: any, res: any) {
  const hasGoogleKey = Boolean(process.env.GOOGLE_SEARCH_API_KEY?.trim());
  const googleEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID?.trim() || process.env.GOOGLE_CSE_CX?.trim() || '';
  const hasGoogleEngineId = Boolean(googleEngineId);
  const hasBingKey = Boolean(process.env.BING_SEARCH_KEY?.trim());
  const query = (Array.isArray(req.query?.q) ? req.query.q[0] : req.query?.q || 'gen z ai behavior').toString().trim();

  const provider = hasGoogleKey && hasGoogleEngineId ? 'google' : hasBingKey ? 'bing' : 'none';
  const diagnostics: Record<string, any> = {};

  if (provider === 'google') {
    const googleUrl = new URL(GOOGLE_SEARCH_ENDPOINT);
    googleUrl.searchParams.set('key', process.env.GOOGLE_SEARCH_API_KEY!.trim());
    googleUrl.searchParams.set('cx', googleEngineId);
    googleUrl.searchParams.set('q', query);
    googleUrl.searchParams.set('num', '1');
    googleUrl.searchParams.set('hl', 'en');
    googleUrl.searchParams.set('gl', 'us');
    try {
      const response = await fetch(googleUrl, { headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (!response.ok) {
        const message = await parseErrorBody(response);
        diagnostics.google = {
          ok: false,
          status: response.status,
          error: message,
          suggestion: suggestionForError(message),
        };
      } else {
        const payload = (await response.json()) as { items?: unknown[] };
        diagnostics.google = {
          ok: true,
          status: 200,
          resultCount: Array.isArray(payload.items) ? payload.items.length : 0,
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Google probe error';
      diagnostics.google = {
        ok: false,
        error: message,
        suggestion: suggestionForError(message),
      };
    }
  }

  if (hasBingKey) {
    const bingUrl = new URL(BING_SEARCH_ENDPOINT);
    bingUrl.searchParams.set('q', query);
    bingUrl.searchParams.set('count', '1');
    bingUrl.searchParams.set('mkt', 'en-US');
    try {
      const response = await fetch(bingUrl, {
        headers: {
          Accept: 'application/json',
          'Ocp-Apim-Subscription-Key': process.env.BING_SEARCH_KEY!.trim(),
        },
        cache: 'no-store',
      });
      diagnostics.bing = {
        ok: response.ok,
        status: response.status,
        error: response.ok ? null : await parseErrorBody(response),
      };
    } catch (error) {
      diagnostics.bing = {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown Bing probe error',
      };
    }
  }

  try {
    const podcastUrl = new URL(ITUNES_SEARCH_ENDPOINT);
    podcastUrl.searchParams.set('term', query);
    podcastUrl.searchParams.set('media', 'podcast');
    podcastUrl.searchParams.set('entity', 'podcastEpisode');
    podcastUrl.searchParams.set('limit', '1');
    const response = await fetch(podcastUrl, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!response.ok) {
      diagnostics.podcastsApple = {
        ok: false,
        status: response.status,
        error: await parseErrorBody(response),
      };
    } else {
      const payload = (await response.json()) as { results?: unknown[] };
      diagnostics.podcastsApple = {
        ok: true,
        status: 200,
        resultCount: Array.isArray(payload.results) ? payload.results.length : 0,
      };
    }
  } catch (error) {
    diagnostics.podcastsApple = {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown Apple podcasts probe error',
    };
  }

  const googleOk = diagnostics.google?.ok !== false;

  res.status(200).json({
    ok: provider !== 'none' && googleOk,
    provider,
    queryProbe: query,
    env: {
      GOOGLE_SEARCH_API_KEY: hasGoogleKey,
      GOOGLE_SEARCH_ENGINE_ID_OR_CX: hasGoogleEngineId,
      BING_SEARCH_KEY: hasBingKey,
    },
    diagnostics,
  });
}
