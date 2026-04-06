import { describe, expect, it, vi, afterEach } from 'vitest';
import { fetchSubredditQuotes } from './fetchSubredditQuotes';

describe('fetchSubredditQuotes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns sanitized quotes from hot posts', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          children: [
            {
              data: {
                title: 'My title https://example.com',
                selftext: 'Body with symbols $$$ and link www.example.org',
              },
            },
          ],
        },
      }),
    } as Response);

    const quotes = await fetchSubredditQuotes('marketing');

    expect(quotes).toEqual(['My title Body with symbols and link']);
  });

  it('filters removed and deleted placeholder posts', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          children: [
            { data: { title: '[removed]', selftext: '' } },
            { data: { title: '[deleted]', selftext: '' } },
            { data: { title: 'Real post', selftext: '' } },
          ],
        },
      }),
    } as Response);

    const quotes = await fetchSubredditQuotes('marketing');

    expect(quotes).toEqual(['Real post']);
  });

  it('throws on invalid subreddit names', async () => {
    await expect(fetchSubredditQuotes('bad/name')).rejects.toThrow('Invalid subreddit name format.');
  });
});
