import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '../api/search';
import { fetchAudienceContext } from '../lib/grounding';
import { searchArchaeologistWeb } from './archaeologist-web-search';

vi.mock('../lib/grounding', () => ({ fetchAudienceContext: vi.fn() }));
vi.mock('./archaeologist-web-search', () => ({ searchArchaeologistWeb: vi.fn() }));

function responseRecorder() {
  const res = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

describe('search API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchAudienceContext).mockResolvedValue('Provider evidence https://example.org/report');
    vi.mocked(searchArchaeologistWeb).mockResolvedValue({
      context: 'Retrieved evidence [1].',
      sources: [{ title: 'Research report', url: 'https://example.org/research' }],
    });
  });

  it('passes the selected provider and behavioral focus to the primary search', async () => {
    const res = responseRecorder();
    await handler({ method: 'GET', query: { q: ' Audience routines ', mode: 'behaviors', provider: 'bing' } }, res);
    expect(fetchAudienceContext).toHaveBeenCalledWith('Audience routines', { behaviorFocus: true, provider: 'bing' });
    expect(searchArchaeologistWeb).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('uses actual Azure web search when Google denies access and preserves URLs for evidence validation', async () => {
    vi.mocked(fetchAudienceContext).mockRejectedValue(new Error('Custom Search API access denied'));
    const res = responseRecorder();
    await handler({ method: 'GET', query: { q: 'Audience culture', provider: 'google' } }, res);
    expect(searchArchaeologistWeb).toHaveBeenCalledWith('Audience culture');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      context: expect.stringContaining('[1] Research report | https://example.org/research'),
      fallback: 'azure-web-search',
      sources: [{ title: 'Research report', url: 'https://example.org/research' }],
    }));
  });

  it('retains behavioral focus when falling back to Azure', async () => {
    vi.mocked(fetchAudienceContext).mockRejectedValue(new Error('Unavailable'));
    const res = responseRecorder();
    await handler({ method: 'GET', query: { q: 'Coffee drinkers', mode: 'behaviors' } }, res);
    expect(searchArchaeologistWeb).toHaveBeenCalledWith(expect.stringMatching(/Coffee drinkers.*routines.*habits/s));
  });

  it('tries Azure when the primary provider returns no evidence', async () => {
    vi.mocked(fetchAudienceContext).mockResolvedValue('No web results returned for: "Culture".');
    const res = responseRecorder();
    await handler({ method: 'GET', query: { q: 'Culture' } }, res);
    expect(searchArchaeologistWeb).toHaveBeenCalledWith('Culture');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns a truthful recoverable error when every search provider fails', async () => {
    vi.mocked(fetchAudienceContext).mockRejectedValue(new Error('private-provider-detail'));
    vi.mocked(searchArchaeologistWeb).mockRejectedValue(new Error('private-key-detail'));
    const res = responseRecorder();
    await handler({ method: 'GET', query: { q: 'Culture' } }, res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ error: 'Web search is temporarily unavailable. Please try again.' });
    expect(JSON.stringify(res.json.mock.calls)).not.toMatch(/private-|context/);
  });

  it('rejects non-GET methods with Allow before calling providers', async () => {
    const res = responseRecorder();
    await handler({ method: 'POST', query: { q: 'Culture' } }, res);
    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.setHeader).toHaveBeenCalledWith('Allow', 'GET');
    expect(fetchAudienceContext).not.toHaveBeenCalled();
  });
});
