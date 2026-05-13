import { describe, expect, it, vi, afterEach } from 'vitest';
import { fetchSubredditQuotes, fetchSubredditQuotesFresh } from './fetchSubredditQuotes';

describe('fetchSubredditQuotes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns sanitized quotes from top yearly posts', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
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
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(fetchSpy.mock.calls[0][0].toString()).toContain('/r/marketing/top.json');
    expect(fetchSpy.mock.calls[0][0].toString()).toContain('t=year');
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

  it('falls back to top monthly posts when yearly results are empty', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            children: [],
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            children: [
              { data: { title: 'Consensus signal', selftext: '' } },
            ],
          },
        }),
      } as Response);

    const quotes = await fetchSubredditQuotes('marketing');

    expect(quotes).toEqual(['Consensus signal']);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[0][0].toString()).toContain('/r/marketing/top.json');
    expect(fetchSpy.mock.calls[0][0].toString()).toContain('t=year');
    expect(fetchSpy.mock.calls[1][0].toString()).toContain('/r/marketing/top.json');
    expect(fetchSpy.mock.calls[1][0].toString()).toContain('t=month');
  });

  it('throws on invalid subreddit names', async () => {
    await expect(fetchSubredditQuotes('bad/name')).rejects.toThrow('Invalid subreddit name format.');
  });
});

describe('fetchSubredditQuotesFresh', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches latest /new and /hot listings for fresh vernacular signals', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            children: [
              { data: { title: 'new signal one', selftext: 'new details' } },
            ],
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            children: [
              { data: { title: 'hot signal one', selftext: 'hot details' } },
            ],
          },
        }),
      } as Response);

    const quotes = await fetchSubredditQuotesFresh('GenZ');

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[0][0].toString()).toContain('/r/GenZ/new.json');
    expect(fetchSpy.mock.calls[1][0].toString()).toContain('/r/GenZ/hot.json');
    expect(quotes.newQuotes).toEqual(['new signal one new details']);
    expect(quotes.hotQuotes).toEqual(['hot signal one hot details']);
  });
});
