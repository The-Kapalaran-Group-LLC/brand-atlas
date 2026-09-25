import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import handler from '../api/archaeologist/web-search.js';

const { createResponse } = vi.hoisted(() => ({ createResponse: vi.fn() }));

vi.mock('openai', () => ({
  AzureOpenAI: class {
    responses = { create: createResponse };
  },
}));

function responseRecorder() {
  const response = {
    statusCode: 200,
    headers: new Map<string, string>(),
    payload: undefined as unknown,
    setHeader(name: string, value: string) { this.headers.set(name, value); return this; },
    status(code: number) { this.statusCode = code; return this; },
    json(payload: unknown) { this.payload = payload; return this; },
  };
  return response;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('AZURE_OPENAI_API_KEY', 'test-server-key');
  vi.stubEnv('AZURE_OPENAI_ENDPOINT', 'https://test-resource.openai.azure.com');
  vi.stubEnv('AZURE_OPENAI_DEPLOYMENT', 'test-deployment');
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('Vercel archaeologist web-search API', () => {
  it.each(['GET', 'PUT', 'DELETE', 'OPTIONS', undefined])('rejects %s with the supported method and no model request', async (method) => {
    const response = responseRecorder();
    await handler({ method, body: { query: 'Question' } } as Request, response as unknown as Response);
    expect(response.statusCode).toBe(405);
    expect(response.headers.get('Allow')).toBe('POST');
    expect(response.payload).toEqual({ error: 'Method not allowed. Use POST.' });
    expect(createResponse).not.toHaveBeenCalled();
  });

  it('serves a POST through the shared Azure search implementation with source citations', async () => {
    const text = 'Museums preserve local heritage. citeturn0search0';
    const markerStart = text.indexOf('');
    createResponse.mockResolvedValue({
      status: 'completed',
      output: [
        { type: 'web_search_call', status: 'completed' },
        {
          type: 'message', status: 'completed', content: [{
            type: 'output_text', text,
            annotations: [{
              type: 'url_citation', start_index: markerStart, end_index: text.length,
              title: 'Museum research', url: 'https://museum.example/research',
            }],
          }],
        },
      ],
    });
    const response = responseRecorder();
    await handler({ method: 'POST', body: { query: '  How do museums help communities?  ' } } as Request, response as unknown as Response);
    expect(response.statusCode).toBe(200);
    expect(response.payload).toEqual({
      context: 'Museums preserve local heritage. [1]',
      sources: [{ title: 'Museum research', url: 'https://museum.example/research' }],
    });
    expect(createResponse).toHaveBeenCalledWith(expect.objectContaining({
      input: 'How do museums help communities?', tools: [{ type: 'web_search' }], tool_choice: 'required',
    }));
  });

  it.each([undefined, null, {}, { query: '' }, { query: ['Question'] }, { query: 'a'.repeat(12001) }])('returns a client error for invalid JSON input', async (body) => {
    const response = responseRecorder();
    await handler({ method: 'POST', body } as Request, response as unknown as Response);
    expect(response.statusCode).toBe(400);
    expect(response.payload).toEqual({ error: 'Enter a question of 1–12,000 characters.' });
    expect(createResponse).not.toHaveBeenCalled();
  });

  it('returns the recoverable shared error without exposing provider details', async () => {
    createResponse.mockRejectedValue({ status: 401, message: 'private provider diagnostic' });
    const response = responseRecorder();
    await handler({ method: 'POST', body: { query: 'Question' } } as Request, response as unknown as Response);
    expect(response.statusCode).toBe(503);
    expect(response.payload).toEqual({ error: expect.stringMatching(/try again/i) });
    expect(JSON.stringify(response.payload)).not.toContain('private provider diagnostic');
  });
});
