import { fetchAudienceContext } from '../lib/grounding';

export default async function handler(req: any, res: any) {
  if (req.method && req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const rawQuery = Array.isArray(req.query?.q) ? req.query.q[0] : req.query?.q;
  const rawMode = Array.isArray(req.query?.mode) ? req.query.mode[0] : req.query?.mode;
  const query = typeof rawQuery === 'string' ? rawQuery.trim() : '';
  const mode = typeof rawMode === 'string' ? rawMode.trim().toLowerCase() : '';
  if (!query) {
    res.status(400).json({ error: 'Missing query' });
    return;
  }

  try {
    const context = await fetchAudienceContext(query, { behaviorFocus: mode === 'behaviors' });
    res.status(200).json({ context });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Search API error';
    console.error('[api/search] failed', { query, error: message });
    res.status(500).json({ error: message });
  }
}
