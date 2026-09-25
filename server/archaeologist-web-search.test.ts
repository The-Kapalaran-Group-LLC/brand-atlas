import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { createArchaeologistWebSearchHandler, searchArchaeologistWeb } from './archaeologist-web-search';

const { createResponse, constructClient } = vi.hoisted(() => ({
  createResponse: vi.fn(),
  constructClient: vi.fn(),
}));

vi.mock('openai', () => ({
  AzureOpenAI: class {
    responses = { create: createResponse };
    constructor(options: unknown) { constructClient(options); }
  },
}));

const citation = (text: string, marker: string, url = 'https://unesco.org/heritage', title = 'UNESCO') => ({
  type: 'url_citation',
  start_index: text.indexOf(marker),
  end_index: text.indexOf(marker) + marker.length,
  url,
  title,
});

function groundedResponse(text = 'Heritage reflects living culture. citeturn0search0') {
  return {
    status: 'completed',
    output: [
      { type: 'reasoning' },
      { type: 'web_search_call', status: 'completed', action: { type: 'search' } },
      {
        type: 'message', status: 'completed', role: 'assistant',
        content: [{ type: 'output_text', text, annotations: [citation(text, 'citeturn0search0')] }],
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('AZURE_OPENAI_API_KEY', 'unit-test-key');
  vi.stubEnv('AZURE_OPENAI_ENDPOINT', 'https://test-resource.openai.azure.com/');
  vi.stubEnv('AZURE_OPENAI_DEPLOYMENT', 'gpt-6-astra');
  vi.stubEnv('AZURE_OPENAI_DEPLOYMENT_NAME', 'legacy-deployment');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  createResponse.mockResolvedValue(groundedResponse());
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('searchArchaeologistWeb', () => {
  it('requires Azure web search on the configured deployment and returns numbered verified citations', async () => {
    const result = await searchArchaeologistWeb('What shapes heritage today?');

    expect(constructClient).toHaveBeenCalledWith(expect.objectContaining({
      baseURL: 'https://test-resource.openai.azure.com/openai/v1/',
      apiVersion: 'v1', apiKey: 'unit-test-key', maxRetries: 0, timeout: 300_000,
    }));
    expect(createResponse).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gpt-6-astra', tools: [{ type: 'web_search' }], tool_choice: 'required', store: false,
      input: 'What shapes heritage today?',
    }));
    expect(result).toEqual({
      context: 'Heritage reflects living culture. [1]',
      sources: [{ title: 'UNESCO', url: 'https://unesco.org/heritage' }],
    });
  });

  it('supports the existing deployment name and an already normalized v1 endpoint', async () => {
    vi.stubEnv('AZURE_OPENAI_DEPLOYMENT', '');
    vi.stubEnv('AZURE_OPENAI_ENDPOINT', 'https://test-resource.openai.azure.com/openai/v1/');
    await searchArchaeologistWeb('Question');
    expect(createResponse).toHaveBeenCalledWith(expect.objectContaining({ model: 'legacy-deployment' }));
    expect(constructClient).toHaveBeenCalledWith(expect.objectContaining({
      baseURL: 'https://test-resource.openai.azure.com/openai/v1/',
    }));
  });

  it('deduplicates sources across message parts and keeps every source number consistent', async () => {
    const response = groundedResponse();
    const text = 'More evidence. citeturn0search1 Repeat. citeturn0search0';
    response.output.push({
      type: 'message', status: 'completed', role: 'assistant', content: [{
        type: 'output_text', text, annotations: [
          citation(text, 'citeturn0search1', 'https://museum.org/research', 'Museum'),
          citation(text, 'citeturn0search0'),
        ],
      }],
    });
    createResponse.mockResolvedValue(response);
    const result = await searchArchaeologistWeb('Question');
    expect(result.context).toBe('Heritage reflects living culture. [1]\n\nMore evidence. [2] Repeat. [1]');
    expect(result.sources).toEqual([
      { title: 'UNESCO', url: 'https://unesco.org/heritage' },
      { title: 'Museum', url: 'https://museum.org/research' },
    ]);
  });

  it('preserves cited claim text when annotation ranges cover prose instead of a citation marker', async () => {
    const text = 'Living heritage matters.';
    const response = groundedResponse(text);
    response.output[2].content[0].annotations = [citation(text, 'Living heritage')];
    createResponse.mockResolvedValue(response);
    expect((await searchArchaeologistWeb('Question')).context).toBe('Living heritage [1] matters.');
  });

  it('excludes unsafe annotation URLs and any URLs invented in plain output text', async () => {
    const text = 'Evidence. citeturn0search0 Bad. citeturn0search1 https://invented.example';
    const response = groundedResponse(text);
    response.output[2].content[0].annotations.push(citation(text, 'citeturn0search1', 'javascript:alert(1)', 'Bad'));
    createResponse.mockResolvedValue(response);
    const result = await searchArchaeologistWeb('Question');
    expect(result.sources).toEqual([{ title: 'UNESCO', url: 'https://unesco.org/heritage' }]);
    expect(result.context).not.toContain('');
    expect(result.context).not.toContain('[2]');
  });

  it.each(['incomplete', 'no_search', 'unfinished_search', 'empty', 'no_citations'])('rejects %s responses instead of claiming a successful web search', async (scenario) => {
    const response = groundedResponse();
    if (scenario === 'incomplete') response.status = 'incomplete';
    if (scenario === 'no_search') response.output = response.output.filter((item) => item.type !== 'web_search_call');
    if (scenario === 'unfinished_search') response.output[1].status = 'in_progress';
    if (scenario === 'empty') response.output[2].content[0].text = '';
    if (scenario === 'no_citations') response.output[2].content[0].annotations = [];
    createResponse.mockResolvedValue(response);
    await expect(searchArchaeologistWeb('Question')).rejects.toThrow();
    expect(createResponse).toHaveBeenCalledTimes(1);
  });

  it.each([408, 409, 429, 503])('retries transient HTTP %s and succeeds', async (status) => {
    vi.useFakeTimers();
    createResponse.mockRejectedValueOnce({ status });
    const pending = searchArchaeologistWeb('Question');
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toHaveProperty('sources');
    expect(createResponse).toHaveBeenCalledTimes(2);
  });

  it('retries stream disconnects five times with exponential backoff and safe logs', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const failure = new Error('stream disconnected before completion: response.failed event received secret-provider-detail');
    createResponse.mockRejectedValue(failure);
    const pending = expect(searchArchaeologistWeb('private question')).rejects.toThrow();
    await vi.runAllTimersAsync();
    await pending;
    expect(createResponse).toHaveBeenCalledTimes(6);
    const logs = vi.mocked(console.log).mock.calls;
    const retries = logs.filter(([event]) => event === '[archaeologist-web-search] retry');
    expect(retries.map(([, metadata]) => metadata.delayMs)).toEqual([500, 1000, 2000, 4000, 8000]);
    expect(JSON.stringify(logs)).not.toMatch(/unit-test-key|private question|secret-provider-detail/);
  });

  it('does not retry permanent authentication failures', async () => {
    createResponse.mockRejectedValue({ status: 401 });
    await expect(searchArchaeologistWeb('Question')).rejects.toThrow();
    expect(createResponse).toHaveBeenCalledTimes(1);
  });

  it('fails clearly before an API call when server configuration is missing', async () => {
    vi.stubEnv('AZURE_OPENAI_API_KEY', '');
    await expect(searchArchaeologistWeb('Question')).rejects.toThrow(/configured/i);
    expect(createResponse).not.toHaveBeenCalled();
  });
});

describe('createArchaeologistWebSearchHandler', () => {
  function responseRecorder() {
    const res = { status: vi.fn(), json: vi.fn() };
    res.status.mockReturnValue(res);
    return res;
  }

  it('returns web context from valid input', async () => {
    const result = { context: 'Evidence [1]', sources: [{ title: 'Source', url: 'https://example.org/' }] };
    const search = vi.fn().mockResolvedValue(result);
    const res = responseRecorder();
    await createArchaeologistWebSearchHandler(search)({ body: { query: '  Question  ' } } as Request, res as unknown as Response);
    expect(search).toHaveBeenCalledWith('Question');
    expect(res.json).toHaveBeenCalledWith(result);
  });

  it.each([undefined, '', '   ', 3, { query: 'nested' }, 'a'.repeat(12001)])('rejects invalid query input without calling the model', async (query) => {
    const search = vi.fn();
    const res = responseRecorder();
    await createArchaeologistWebSearchHandler(search)({ body: { query } } as Request, res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(search).not.toHaveBeenCalled();
  });

  it('returns a recoverable error without provider details', async () => {
    const search = vi.fn().mockRejectedValue(new Error('secret-provider-detail'));
    const res = responseRecorder();
    await createArchaeologistWebSearchHandler(search)({ body: { query: 'Question' } } as Request, res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringMatching(/try again/i) }));
    expect(JSON.stringify(res.json.mock.calls)).not.toContain('secret-provider-detail');
  });
});
