import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchAudienceContext,
  fetchAudienceContextExperimentalMethodology,
  fetchAudienceContextPreviousMethodology,
  fetchCommunityContextBarbellMethodology,
  fetchCommunityContextPreviousMethodology,
} from './grounding';

describe('fetchAudienceContext', () => {
  const originalKey = process.env.BING_SEARCH_KEY;
  const originalGoogleKey = process.env.GOOGLE_SEARCH_API_KEY;
  const originalGoogleEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;
  const originalGoogleCx = process.env.GOOGLE_CSE_CX;

  beforeEach(() => {
    process.env.BING_SEARCH_KEY = 'test-key';
    delete process.env.GOOGLE_SEARCH_API_KEY;
    delete process.env.GOOGLE_SEARCH_ENGINE_ID;
    delete process.env.GOOGLE_CSE_CX;
  });

  afterEach(() => {
    if (typeof originalKey === 'string') {
      process.env.BING_SEARCH_KEY = originalKey;
    } else {
      delete process.env.BING_SEARCH_KEY;
    }

    if (typeof originalGoogleKey === 'string') {
      process.env.GOOGLE_SEARCH_API_KEY = originalGoogleKey;
    } else {
      delete process.env.GOOGLE_SEARCH_API_KEY;
    }

    if (typeof originalGoogleEngineId === 'string') {
      process.env.GOOGLE_SEARCH_ENGINE_ID = originalGoogleEngineId;
    } else {
      delete process.env.GOOGLE_SEARCH_ENGINE_ID;
    }

    if (typeof originalGoogleCx === 'string') {
      process.env.GOOGLE_CSE_CX = originalGoogleCx;
    } else {
      delete process.env.GOOGLE_CSE_CX;
    }

    vi.restoreAllMocks();
  });

  it('executes two macro web lanes and combines snippets into a moments digest', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          webPages: {
            value: [
              { snippet: 'Breaking shift in consumer discretionary spending this week.' },
              { snippet: 'Tariff volatility is changing short-term purchasing behavior.' },
            ],
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          webPages: {
            value: [
              { snippet: 'Annual report commentary shows margin compression by segment.' },
              { snippet: 'Macro trend: premiumization plus value-seeking coexistence.' },
            ],
          },
        }),
      } as Response);

    const context = await fetchAudienceContext('Gen Z beauty buyers');

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstUrl = new URL(fetchMock.mock.calls[0][0] as string);
    const secondUrl = new URL(fetchMock.mock.calls[1][0] as string);

    expect(firstUrl.searchParams.get('freshness')).toBe('Week');
    expect(firstUrl.searchParams.get('q')).toContain('Gen Z beauty buyers');

    expect(secondUrl.searchParams.get('freshness')).toBe('Year');
    expect(secondUrl.searchParams.get('q')).toContain('annual report OR macro trend');

    expect(context).toContain('Breaking (last 7 days):');
    expect(context).toContain('Structural (annual + macro):');
    expect(context).toContain('Breaking shift in consumer discretionary spending this week.');
    expect(context).toContain('Annual report commentary shows margin compression by segment.');
  });

  it('supports behavior-focused grounding by appending ritual query terms without strict recency filters', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          webPages: {
            value: [
              { snippet: 'Morning money-tracking routines are becoming normalized among Gen Z households.' },
            ],
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          webPages: {
            value: [
              { snippet: 'Behavioral guide content increasingly drives repeat product usage rituals.' },
            ],
          },
        }),
      } as Response);

    const context = await fetchAudienceContext('Gen Z beauty buyers', { behaviorFocus: true });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstUrl = new URL(fetchMock.mock.calls[0][0] as string);
    const secondUrl = new URL(fetchMock.mock.calls[1][0] as string);
    const firstQuery = firstUrl.searchParams.get('q') || '';
    const secondQuery = secondUrl.searchParams.get('q') || '';

    expect(firstUrl.searchParams.get('freshness')).toBeNull();
    expect(secondUrl.searchParams.get('freshness')).toBeNull();
    expect(firstQuery).toContain('routine');
    expect(firstQuery).toContain('habit');
    expect(secondQuery).toContain('guide');

    expect(context).toContain('Behavioral routines (up-to-date, stabilized):');
    expect(context).toContain('Morning money-tracking routines are becoming normalized among Gen Z households.');
    expect(context).toContain('Behavioral guide content increasingly drives repeat product usage rituals.');
  });

  it('returns partial context when one web lane fails but the other lane succeeds', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          webPages: {
            value: [{ snippet: 'Short-term hiring slowdown is affecting creator economies.' }],
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ message: 'upstream error' }),
        text: async () => 'upstream error',
      } as Response);

    const context = await fetchAudienceContext('Millennial freelancers');

    expect(context).toContain('Breaking (last 7 days):');
    expect(context).toContain('Short-term hiring slowdown is affecting creator economies.');
    expect(context).not.toContain('Structural (annual + macro):');
  });

  it('throws when all lanes fail', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ message: 'service unavailable' }),
        text: async () => 'service unavailable',
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ message: 'upstream error' }),
        text: async () => 'upstream error',
      } as Response);

    await expect(fetchAudienceContext('Urban commuters')).rejects.toThrow('Bing Web Search API error');
  });

  it('uses Google Custom Search when Google credentials are configured', async () => {
    delete process.env.BING_SEARCH_KEY;
    process.env.GOOGLE_SEARCH_API_KEY = 'google-test-key';
    process.env.GOOGLE_SEARCH_ENGINE_ID = 'google-test-engine';

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          items: [{ title: 'Google Result', link: 'https://example.com/r1', snippet: 'Breaking culture shift from Google source.' }],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          items: [{ snippet: 'Structural macro signal from Google source.' }],
        }),
      } as Response);

    const context = await fetchAudienceContext('Gen Z creators');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstUrl = new URL(fetchMock.mock.calls[0][0] as string);
    const secondUrl = new URL(fetchMock.mock.calls[1][0] as string);

    expect(firstUrl.origin + firstUrl.pathname).toBe('https://www.googleapis.com/customsearch/v1');
    expect(firstUrl.searchParams.get('dateRestrict')).toBe('d7');
    expect(secondUrl.searchParams.get('dateRestrict')).toBe('y1');
    expect(firstUrl.searchParams.get('cx')).toBe('google-test-engine');

    expect(context).toContain('Breaking culture shift from Google source.');
    expect(context).toContain('https://example.com/r1');
    expect(context).toContain('Structural macro signal from Google source.');
  });

  it('prefers Bing when both Bing and Google credentials are present', async () => {
    process.env.BING_SEARCH_KEY = 'bing-test-key';
    process.env.GOOGLE_SEARCH_API_KEY = 'google-test-key';
    process.env.GOOGLE_SEARCH_ENGINE_ID = 'google-test-engine';

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          webPages: {
            value: [{ snippet: 'Bing breaking signal for Gen Z.' }],
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          webPages: {
            value: [{ snippet: 'Bing structural macro signal for Gen Z.' }],
          },
        }),
      } as Response);

    const context = await fetchAudienceContext('Gen Z');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstUrl = new URL(fetchMock.mock.calls[0][0] as string);
    const secondUrl = new URL(fetchMock.mock.calls[1][0] as string);

    expect(firstUrl.origin + firstUrl.pathname).toBe('https://api.bing.microsoft.com/v7.0/search');
    expect(secondUrl.origin + secondUrl.pathname).toBe('https://api.bing.microsoft.com/v7.0/search');
    expect(context).toContain('Bing breaking signal for Gen Z.');
    expect(context).toContain('Bing structural macro signal for Gen Z.');
  });

  it('returns explicit no-results context when all lanes succeed with empty payloads', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ webPages: { value: [] } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ webPages: { value: [] } }),
      } as Response);

    const context = await fetchAudienceContext('Nilay Patel Gen Z AI');

    expect(context).toContain('No web results returned for: "Nilay Patel Gen Z AI".');
  });

  it('supports previous methodology with a single baseline lane', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          webPages: {
            value: [
              { snippet: 'Baseline signal about Gen Z spending pressure and creator income volatility.' },
            ],
          },
        }),
      } as Response);

    const context = await fetchAudienceContextPreviousMethodology('Gen Z');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstUrl = new URL(fetchMock.mock.calls[0][0] as string);

    expect(firstUrl.searchParams.get('q')).toBe('Gen Z');
    expect(firstUrl.searchParams.get('freshness')).toBeNull();
    expect(context).toContain('Previous Methodology (single-lane baseline):');
    expect(context).toContain('Baseline signal about Gen Z spending pressure and creator income volatility.');
  });

  it('supports experimental methodology with broad-intake queries and strict synthesis output', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          webPages: {
            value: [
              { snippet: 'Snippet A: Gen Z increasingly relies on creator-led practical budgeting routines.' },
              { snippet: 'Snippet B: Early-career Gen Z workers are using AI assistants in everyday workflow tasks.' },
            ],
          },
        }),
      } as Response);

    const context = await fetchAudienceContextExperimentalMethodology('Gen Z', {
      queryGenerator: async () => [
        'Gen Z macro-economic pressure and spending rituals',
        'Gen Z daily AI workflow routines early career',
        'Gen Z creator trust and practical utility behavior',
        'Gen Z identity and value-first consumer behavior',
      ],
      synthesisGenerator: async () => ({
        insights: [
          {
            classification: 'breaking',
            insight: 'Practical creator-led budgeting routines are rising in discussion among Gen Z.',
            source_citation: 'Snippet A: Gen Z increasingly relies on creator-led practical budgeting routines.',
          },
          {
            classification: 'structural',
            insight: 'AI assistants are becoming default workflow infrastructure for early-career Gen Z.',
            source_citation: 'Snippet B: Early-career Gen Z workers are using AI assistants in everyday workflow tasks.',
          },
        ],
      }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(context).toContain('Experimental Methodology (broad-intake + strict synthesis):');
    expect(context).toContain('Broad intake queries:');
    expect(context).toContain('Breaking (last 7 days):');
    expect(context).toContain('Structural (annual + macro):');
    expect(context).toContain('citation: "Snippet A: Gen Z increasingly relies on creator-led practical budgeting routines."');
    expect(context).toContain('citation: "Snippet B: Early-career Gen Z workers are using AI assistants in everyday workflow tasks."');
  });

  it('supports previous community methodology with a single baseline lane', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          webPages: {
            value: [
              { snippet: 'Large legacy subreddit hubs continue to influence identity signaling patterns.' },
            ],
          },
        }),
      } as Response);

    const context = await fetchCommunityContextPreviousMethodology('Gen Z');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(firstUrl.searchParams.get('q')).toContain('community identity anchors');
    expect(firstUrl.searchParams.get('freshness')).toBeNull();
    expect(context).toContain('Previous Community Methodology (single-lane baseline):');
    expect(context).toContain('Large legacy subreddit hubs continue to influence identity signaling patterns.');
  });

  it('uses a community barbell retrieval mix with foundational hubs and breakout micro-communities', async () => {
    const requests: string[] = [];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      requests.push(url);

      if (url.includes('api.bing.microsoft.com/v7.0/search')) {
        if (url.includes('freshness=Month')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              webPages: {
                value: [
                  { snippet: 'Discord invite links and Substack communities are rising in the last 30 days.' },
                ],
              },
            }),
          } as Response;
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({
            webPages: {
              value: [
                { snippet: 'Legacy creator forums and large subreddit hubs remain foundational to identity norms.' },
              ],
            },
          }),
        } as Response;
      }

      if (url.includes('/r/GenZ/top.json')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              children: [{ data: { title: 'Weekly identity thread', selftext: 'Longstanding shared rituals' } }],
            },
          }),
        } as Response;
      }

      if (url.includes('/r/GenZ/new.json')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              children: [{ data: { title: 'New Discord dropped', selftext: 'Private creator micro-channel' } }],
            },
          }),
        } as Response;
      }

      if (url.includes('/r/GenZ/hot.json')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              children: [{ data: { title: 'Substack growth spike', selftext: 'Niche paid community momentum' } }],
            },
          }),
        } as Response;
      }

      if (url.includes('/r/teenagers/top.json') || url.includes('/r/teenagers/new.json') || url.includes('/r/teenagers/hot.json')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: { children: [] } }),
        } as Response;
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const context = await fetchCommunityContextBarbellMethodology('Gen Z');

    expect(requests.some((url) => url.includes('api.bing.microsoft.com/v7.0/search') && url.includes('freshness=Month'))).toBe(true);
    expect(requests.some((url) => url.includes('/r/GenZ/top.json'))).toBe(true);
    expect(requests.some((url) => url.includes('/r/GenZ/new.json'))).toBe(true);
    expect(requests.some((url) => url.includes('/r/GenZ/hot.json'))).toBe(true);

    expect(context).toContain('Foundational hubs (long-standing):');
    expect(context).toContain('Breakout micro-communities (last 30 days):');
    expect(context).toContain('Reddit (r/GenZ top posts):');
    expect(context).toContain('Reddit (r/GenZ new/hot posts):');
    expect(context).toContain('Location fallback rule:');
  });
});
