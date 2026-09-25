import { fetchAudienceContext } from '../lib/grounding.js';
import { searchArchaeologistWeb } from '../server/archaeologist-web-search.js';

export default async function handler(req: any, res: any) {
  if (req.method && req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const rawQuery = Array.isArray(req.query?.q) ? req.query.q[0] : req.query?.q;
  const rawMode = Array.isArray(req.query?.mode) ? req.query.mode[0] : req.query?.mode;
  const rawProvider = Array.isArray(req.query?.provider) ? req.query.provider[0] : req.query?.provider;
  const query = typeof rawQuery === 'string' ? rawQuery.trim() : '';
  const mode = typeof rawMode === 'string' ? rawMode.trim().toLowerCase() : '';
  const providerName = typeof rawProvider === 'string' ? rawProvider.trim().toLowerCase() : '';
  const provider = providerName === 'google' || providerName === 'bing' ? providerName : undefined;
  if (!query) {
    res.status(400).json({ error: 'Missing query' });
    return;
  }

  try {
    const context = await fetchAudienceContext(query, { behaviorFocus: mode === 'behaviors', provider });
    if (context.trim() && !context.startsWith('No web results returned for:')) {
      res.status(200).json({ context });
      return;
    }
  } catch (error) {
    console.warn('[api/search] Primary search unavailable; using Azure web search.', {
      provider: provider || 'auto',
      errorClass: error instanceof Error ? error.name : 'UnknownError',
    });
  }

  try {
    const searchQuery = mode === 'behaviors'
      ? `${query}\nFocus on recurring routines, habits, guides, and behavioral rituals.`
      : query;
    const result = await searchArchaeologistWeb(searchQuery);
    // The analysis service extracts an evidence URL allowlist from this digest.
    const sourceList = result.sources.map((source, index) => `[${index + 1}] ${source.title} | ${source.url}`).join('\n');
    console.log('[api/search] Azure web search completed.', { sourceCount: result.sources.length });
    res.status(200).json({
      context: `${result.context}\n\nSources:\n${sourceList}`,
      sources: result.sources,
      fallback: 'azure-web-search',
    });
  } catch (error) {
    console.warn('[api/search] All web search providers unavailable.', {
      errorClass: error instanceof Error ? error.name : 'UnknownError',
    });
    res.status(503).json({ error: 'Web search is temporarily unavailable. Please try again.' });
  }
}
