import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAudienceContext } from './grounding';

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

  it('executes web lanes plus podcast lanes and combines snippets', async () => {
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
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          webPages: {
            value: [
              { snippet: 'Podcast transcript themes emphasize workflow acceleration with authenticity checks.' },
            ],
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            {
              trackName: 'AI in Workflows',
              collectionName: 'Future Work Podcast',
              artistName: 'Host A',
              releaseDate: '2026-05-08T00:00:00Z',
              description: 'Episode explores pragmatic AI use among younger workers.',
              trackViewUrl: 'https://podcasts.apple.com/example-episode',
            },
          ],
        }),
      } as Response);

    const context = await fetchAudienceContext('Gen Z beauty buyers');

    expect(fetchMock).toHaveBeenCalledTimes(4);

    const firstUrl = new URL(fetchMock.mock.calls[0][0] as string);
    const secondUrl = new URL(fetchMock.mock.calls[1][0] as string);
    const thirdUrl = new URL(fetchMock.mock.calls[2][0] as string);
    const fourthUrl = new URL(fetchMock.mock.calls[3][0] as string);

    expect(firstUrl.searchParams.get('freshness')).toBe('Day');
    expect(firstUrl.searchParams.get('q')).toContain('Gen Z beauty buyers');

    expect(secondUrl.searchParams.get('freshness')).toBe('Year');
    expect(secondUrl.searchParams.get('q')).toContain('annual report OR macro trend');

    expect(thirdUrl.searchParams.get('freshness')).toBe('Year');
    expect(thirdUrl.searchParams.get('q')).toContain('podcast transcript');

    expect(fourthUrl.origin + fourthUrl.pathname).toBe('https://itunes.apple.com/search');
    expect(fourthUrl.searchParams.get('media')).toBe('podcast');
    expect(fourthUrl.searchParams.get('entity')).toBe('podcastEpisode');

    expect(context).toContain('Breaking (last 24h):');
    expect(context).toContain('Structural (annual + macro):');
    expect(context).toContain('Podcast Transcript Signals:');
    expect(context).toContain('Podcasts (Apple):');
    expect(context).toContain('Breaking shift in consumer discretionary spending this week.');
    expect(context).toContain('Annual report commentary shows margin compression by segment.');
    expect(context).toContain('workflow acceleration with authenticity checks');
    expect(context).toContain('Future Work Podcast');
  });

  it('returns partial context when one web lane fails but transcript lane succeeds', async () => {
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
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          webPages: {
            value: [{ snippet: 'Transcript snippets capture concerns about AI detectability.' }],
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ results: [] }),
      } as Response);

    const context = await fetchAudienceContext('Millennial freelancers');

    expect(context).toContain('Breaking (last 24h):');
    expect(context).toContain('Short-term hiring slowdown is affecting creator economies.');
    expect(context).toContain('Podcast Transcript Signals:');
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
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ message: 'transcript lane error' }),
        text: async () => 'transcript lane error',
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ message: 'podcast api error' }),
        text: async () => 'podcast api error',
      } as Response);

    await expect(fetchAudienceContext('Urban commuters')).rejects.toThrow('Bing Web Search API error');
  });

  it('uses Google Custom Search when Google credentials are configured', async () => {
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
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          items: [{ snippet: 'Transcript signal from Google source.' }],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            {
              trackName: 'AI and Gen Z',
              collectionName: 'CultureCast',
              artistName: 'Host B',
              description: 'Discussion on Gen Z AI usage.',
              trackViewUrl: 'https://podcasts.apple.com/example2',
            },
          ],
        }),
      } as Response);

    const context = await fetchAudienceContext('Gen Z creators');

    expect(fetchMock).toHaveBeenCalledTimes(4);
    const firstUrl = new URL(fetchMock.mock.calls[0][0] as string);
    const secondUrl = new URL(fetchMock.mock.calls[1][0] as string);
    const thirdUrl = new URL(fetchMock.mock.calls[2][0] as string);
    const fourthUrl = new URL(fetchMock.mock.calls[3][0] as string);

    expect(firstUrl.origin + firstUrl.pathname).toBe('https://www.googleapis.com/customsearch/v1');
    expect(firstUrl.searchParams.get('dateRestrict')).toBe('d1');
    expect(secondUrl.searchParams.get('dateRestrict')).toBe('y1');
    expect(thirdUrl.searchParams.get('dateRestrict')).toBe('y1');
    expect(firstUrl.searchParams.get('cx')).toBe('google-test-engine');
    expect(fourthUrl.origin + fourthUrl.pathname).toBe('https://itunes.apple.com/search');

    expect(context).toContain('Breaking culture shift from Google source.');
    expect(context).toContain('https://example.com/r1');
    expect(context).toContain('Structural macro signal from Google source.');
    expect(context).toContain('Transcript signal from Google source.');
    expect(context).toContain('CultureCast');
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
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ webPages: { value: [] } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ results: [] }),
      } as Response);

    const context = await fetchAudienceContext('Nilay Patel Gen Z AI');

    expect(context).toContain('No web results returned for: "Nilay Patel Gen Z AI".');
  });
});
