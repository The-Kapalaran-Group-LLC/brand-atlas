import type { Request, Response } from 'express';
import { fetchSubredditQuotes } from '../lib/fetchSubredditQuotes.js';

export default async function handler(req: Request, res: Response): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed. Use GET.' });
    return;
  }

  const rawSubreddit = req.query?.subreddit;
  if (typeof rawSubreddit !== 'string' || !/^[A-Za-z0-9_]+$/.test(rawSubreddit.trim())) {
    res.status(400).json({ error: 'Enter a subreddit name using letters, numbers, or underscores.' });
    return;
  }

  const subreddit = rawSubreddit.trim();
  console.log('[reddit-api] Fetching subreddit quotes.', { subreddit });
  try {
    const quotes = await fetchSubredditQuotes(subreddit);
    console.log('[reddit-api] Subreddit quotes fetched.', { subreddit, quoteCount: quotes.length });
    res.status(200).json({ quotes });
  } catch (error) {
    console.error('[reddit-api] Subreddit quotes unavailable.', {
      subreddit,
      message: error instanceof Error ? error.message : 'Unknown scrape failure.',
    });
    res.status(503).json({ error: 'Reddit quotes are temporarily unavailable. Please try again.' });
  }
}
