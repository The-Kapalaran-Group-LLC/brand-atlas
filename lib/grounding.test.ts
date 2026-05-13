import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAudienceContext, fetchAudienceContextPreviousMethodology } from './grounding';

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

    expect(firstUrl.searchParams.get('freshness')).toBe('Day');
    expect(firstUrl.searchParams.get('q')).toContain('Gen Z beauty buyers');

    expect(secondUrl.searchParams.get('freshness')).toBe('Year');
    expect(secondUrl.searchParams.get('q')).toContain('annual report OR macro trend');

    expect(context).toContain('Breaking (last 24h):');
    expect(context).toContain('Structural (annual + macro):');
    expect(context).toContain('Breaking shift in consumer discretionary spending this week.');
    expect(context).toContain('Annual report commentary shows margin compression by segment.');
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

    expect(context).toContain('Breaking (last 24h):');
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
    expect(firstUrl.searchParams.get('dateRestrict')).toBe('d1');
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
});
