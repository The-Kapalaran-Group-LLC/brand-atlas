import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { collectCurrentLanguageSignals } from './language-methodology';

function mockJsonResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  } as Response;
}

describe('collectCurrentLanguageSignals', () => {
  beforeEach(() => {
    process.env.BING_SEARCH_KEY = 'bing-test-key';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.BING_SEARCH_KEY;
  });

  it('uses Bing freshness=Week, Reddit /new + /hot, and Urban Dictionary validation', async () => {
    const requests: string[] = [];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      requests.push(url);

      if (url.includes('api.bing.microsoft.com/v7.0/search')) {
        return mockJsonResponse({
          webPages: {
            value: [
              { snippet: 'Gen Z says rizz and delulu in meme-heavy clips.' },
              { snippet: 'Visual code includes emoji stacks and lowercase irony.' },
            ],
          },
        });
      }

      if (url.includes('/r/GenZ/new.json')) {
        return mockJsonResponse({
          data: {
            children: [
              { data: { title: 'rizz check', selftext: 'delulu if corporate' } },
            ],
          },
        });
      }

      if (url.includes('/r/GenZ/hot.json')) {
        return mockJsonResponse({
          data: {
            children: [
              { data: { title: 'mid is dead', selftext: 'aura points only' } },
            ],
          },
        });
      }

      if (url.includes('api.urbandictionary.com/v0/define')) {
        return mockJsonResponse({
          list: [
            {
              word: 'rizz',
              definition: 'Charm game.',
              thumbs_up: 1200,
            },
          ],
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const signals = await collectCurrentLanguageSignals('Gen Z');

    expect(signals.bingSnippets.length).toBeGreaterThan(0);
    expect(signals.reddit.newQuotes.length).toBeGreaterThan(0);
    expect(signals.reddit.hotQuotes.length).toBeGreaterThan(0);
    expect(signals.urbanDefinitions.length).toBeGreaterThan(0);

    const bingCall = requests.find((url) => url.includes('api.bing.microsoft.com/v7.0/search'));
    expect(bingCall).toBeDefined();
    expect(bingCall).toContain('freshness=Week');

    expect(requests.some((url) => url.includes('/r/GenZ/new.json'))).toBe(true);
    expect(requests.some((url) => url.includes('/r/GenZ/hot.json'))).toBe(true);
    expect(requests.some((url) => url.includes('api.urbandictionary.com/v0/define?term='))).toBe(true);
  });

  it('applies gatekeeper filter before building verbatim digest payload', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('api.bing.microsoft.com/v7.0/search')) {
        return mockJsonResponse({
          webPages: {
            value: [
              { snippet: 'Gen Z visual code includes emoji stacks and lowercase irony.' },
            ],
          },
        });
      }

      if (url.includes('/r/GenZ/new.json')) {
        return mockJsonResponse({
          data: {
            children: [
              { data: { title: 'safe quote', selftext: 'this is high signal' } },
            ],
          },
        });
      }

      if (url.includes('/r/GenZ/hot.json')) {
        return mockJsonResponse({
          data: {
            children: [
              { data: { title: 'filtered out', selftext: 'low signal quote' } },
            ],
          },
        });
      }

      if (url.includes('api.urbandictionary.com/v0/define')) {
        return mockJsonResponse({
          list: [
            {
              word: 'rizz',
              definition: 'Charm game.',
              thumbs_up: 1200,
            },
          ],
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const signals = await collectCurrentLanguageSignals('Gen Z', {
      gatekeeperFilter: async (_audience, rawSignals) => rawSignals.filter((quote) => quote.includes('safe quote')),
    });

    expect(signals.verbatimText).toContain('High-signal community vernacular (gatekeeper score >= 7):');
    expect(signals.verbatimText).toContain('safe quote');
    expect(signals.verbatimText).not.toContain('filtered out');
    expect(signals.verbatimText).not.toContain('Urban Dictionary validation:');
  });
});
