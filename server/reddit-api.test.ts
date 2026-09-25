import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import handler from '../api/reddit.js';

const { fetchSubredditQuotes } = vi.hoisted(() => ({ fetchSubredditQuotes: vi.fn() }));

vi.mock('../lib/fetchSubredditQuotes.js', () => ({ fetchSubredditQuotes }));

function responseRecorder() {
  return {
    statusCode: 200,
    headers: new Map<string, string>(),
    payload: undefined as unknown,
    setHeader(name: string, value: string) { this.headers.set(name, value); return this; },
    status(code: number) { this.statusCode = code; return this; },
    json(payload: unknown) { this.payload = payload; return this; },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Vercel Reddit API', () => {
  it.each(['POST', 'PUT', 'DELETE', 'OPTIONS'])('rejects %s with Allow: GET before scraping', async (method) => {
    const response = responseRecorder();
    await handler({ method, query: { subreddit: 'GenZ' } } as unknown as Request, response as unknown as Response);

    expect(response.statusCode).toBe(405);
    expect(response.headers.get('Allow')).toBe('GET');
    expect(response.payload).toEqual({ error: 'Method not allowed. Use GET.' });
    expect(fetchSubredditQuotes).not.toHaveBeenCalled();
  });

  it.each([undefined, null, '', '   ', ['GenZ'], { name: 'GenZ' }, 123, 'bad/name', '../admin', 'bad-name'])
    ('returns JSON 400 for a missing or invalid subreddit: %j', async (subreddit) => {
      const response = responseRecorder();
      await handler({ method: 'GET', query: { subreddit } } as unknown as Request, response as unknown as Response);

      expect(response.statusCode).toBe(400);
      expect(response.payload).toEqual({ error: expect.stringMatching(/subreddit/i) });
      expect(fetchSubredditQuotes).not.toHaveBeenCalled();
    });

  it('returns quotes from the existing scraper and normalizes surrounding whitespace', async () => {
    fetchSubredditQuotes.mockResolvedValue(['Audience quote one.', 'Audience quote two.']);
    const response = responseRecorder();
    await handler({ method: 'GET', query: { subreddit: '  Gen_Z2  ' } } as unknown as Request, response as unknown as Response);

    expect(fetchSubredditQuotes).toHaveBeenCalledOnce();
    expect(fetchSubredditQuotes).toHaveBeenCalledWith('Gen_Z2');
    expect(response.statusCode).toBe(200);
    expect(response.payload).toEqual({ quotes: ['Audience quote one.', 'Audience quote two.'] });
  });

  it('returns an empty JSON quotes array when the subreddit has no usable posts', async () => {
    fetchSubredditQuotes.mockResolvedValue([]);
    const response = responseRecorder();
    await handler({ method: 'GET', query: { subreddit: 'GenZ' } } as unknown as Request, response as unknown as Response);

    expect(response.statusCode).toBe(200);
    expect(response.payload).toEqual({ quotes: [] });
  });

  it('returns a generic JSON 503 instead of HTML or upstream diagnostics when scraping fails', async () => {
    fetchSubredditQuotes.mockRejectedValue(new Error('<!DOCTYPE html> private upstream error'));
    const response = responseRecorder();
    await handler({ method: 'GET', query: { subreddit: 'GenZ' } } as unknown as Request, response as unknown as Response);

    expect(response.statusCode).toBe(503);
    expect(response.payload).toEqual({ error: 'Reddit quotes are temporarily unavailable. Please try again.' });
    expect(JSON.stringify(response.payload)).not.toContain('DOCTYPE');
    expect(JSON.stringify(response.payload)).not.toContain('private upstream error');
  });
});
