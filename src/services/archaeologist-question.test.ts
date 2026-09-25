import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { askMatrixQuestion, type CulturalMatrix } from './azure-openai';

const { createCompletion } = vi.hoisted(() => ({ createCompletion: vi.fn() }));
vi.mock('openai', () => ({
  AzureOpenAI: class {
    chat = { completions: { create: createCompletion } };
  },
}));

const matrix: CulturalMatrix = {
  demographics: {},
  sociological_analysis: 'People seek affordable community activities.',
  moments: [{ text: 'Local running clubs are growing.', isHighlyUnique: false }],
  beliefs: [], tone: [], language: [], behaviors: [], contradictions: [], community: [], influencers: [],
  sources: [],
};
const sources = [{ title: 'Running research', url: 'https://example.com/running' }];
const answer = '[KNOWN] Local running clubs are growing in the cultural analysis. Web research also points to affordable community activities [1].';

describe('Ask the Archaeologist web research', () => {
  beforeEach(() => {
    createCompletion.mockReset().mockImplementation(async (request) => {
      const schemaName = request.response_format.json_schema.name;
      // Support the previous implementation so failures identify the missing web-search behavior.
      const content = schemaName === 'sub_query_plan'
        ? { queries: ['running culture', 'community activities', 'running affordability', 'club growth'] }
        : { answer, relevantInsights: [matrix.moments[0].text, 'Invented insight'] };
      return { choices: [{ message: { content: JSON.stringify(content) } }] };
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ context: 'Recent research connects running clubs with affordable socializing [1].', sources }),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('searches Azure with the question and audience, then combines web evidence with the existing results', async () => {
    const result = await askMatrixQuestion(matrix, 'Why are running clubs growing?', {
      audience: 'Gen Z runners', brand: 'Nike', topicFocus: 'Belonging',
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toMatch(/\/api\/archaeologist\/web-search$/);
    expect(options?.method).toBe('POST');
    expect(JSON.parse(options!.body as string).query).toEqual(expect.stringContaining('Why are running clubs growing?'));
    expect(JSON.parse(options!.body as string).query).toContain('Gen Z runners');
    expect(JSON.parse(options!.body as string).query).toContain('Nike');
    expect(createCompletion).toHaveBeenCalledTimes(1);
    const prompt = createCompletion.mock.calls[0][0].messages.map((message) => message.content).join('\n');
    expect(prompt).toContain(JSON.stringify(matrix));
    expect(prompt).toContain('Recent research connects running clubs');
    expect(prompt).toContain('[1] Running research');
    expect(prompt).toContain('https://example.com/running');
    expect(result).toMatchObject({ answer, sources, webSearchStatus: 'completed', relevantInsights: [matrix.moments[0].text] });
  });

  it.each([true, false])('requests a scannable answer with web research available: %s', async (webAvailable) => {
    if (!webAvailable) vi.mocked(fetch).mockResolvedValue({ ok: false, status: 503 } as Response);

    await askMatrixQuestion(matrix, 'Why are running clubs growing?');

    const request = createCompletion.mock.calls.at(-1)![0];
    const systemPrompt = request.messages.find((message) => message.role === 'system').content;
    expect(systemPrompt).toMatch(/start with.*direct answer.*1.?2 short sentences/i);
    expect(systemPrompt).toContain('##');
    expect(systemPrompt).toMatch(/bullet.*numbered lists/i);
    expect(systemPrompt).toContain('**bold**');
    expect(systemPrompt).toMatch(/simple questions.*short paragraph/i);
    expect(systemPrompt).toMatch(/caveats.*brief.*natural language/i);
    expect(systemPrompt).toMatch(/exact insight text.*only in.*relevantInsights/i);
    expect(systemPrompt).toMatch(/do not.*sources section/i);
    expect(systemPrompt).not.toContain('Connect present signals to at least one historical or cross-industry parallel.');
  });

  it('preserves Markdown formatting and verified citations while filtering unsupported references and insights', async () => {
    const formattedAnswer = [
      '**Running clubs** offer an affordable way to meet people [1].',
      '',
      '## Why they appeal',
      '',
      '- **Community:** Shared activity makes socializing easier [1].',
      '- **Cost:** Participation can be affordable [7].',
      '',
      'The cultural analysis suggests growing interest; it does not establish a universal trend.',
    ].join('\n');
    createCompletion.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({
      answer: formattedAnswer,
      relevantInsights: [matrix.moments[0].text, 'Invented insight', matrix.moments[0].text],
    }) } }] });

    const result = await askMatrixQuestion(matrix, 'Why are running clubs growing?');

    expect(result.answer).toBe(formattedAnswer.replace('[7]', ''));
    expect(result.sources).toEqual(sources);
    expect(result.relevantInsights).toEqual([matrix.moments[0].text]);
  });

  it.each(['http', 'network', 'malformed', 'empty', 'unsafe'])('answers from existing results and reports unavailable search on %s failure', async (failure) => {
    const fetchMock = vi.mocked(fetch);
    if (failure === 'network') fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    else fetchMock.mockResolvedValue({
      ok: failure !== 'http', status: 503,
      json: async () => failure === 'malformed' ? { context: 123 }
        : failure === 'empty' ? { context: '', sources: [] }
          : failure === 'unsafe' ? { context: 'Untrusted', sources: [{ title: 'Unsafe', url: 'javascript:alert(1)' }] }
            : { error: 'Provider unavailable' },
    } as Response);

    const result = await askMatrixQuestion(matrix, 'What do the results show?');

    expect(result).toMatchObject({ sources: [], webSearchStatus: 'unavailable' });
    expect(result.answer).toContain('Local running clubs');
    const prompt = createCompletion.mock.calls.at(-1)![0].messages.map((message) => message.content).join('\n');
    expect(prompt).toContain(JSON.stringify(matrix));
    expect(prompt).toMatch(/web search.*unavailable/i);
    expect(prompt).toMatch(/only.*provided cultural analysis/i);
    expect(result.answer).not.toContain('[1]');
  });

  it('does not relabel unsupported citation numbers as verified sources', async () => {
    createCompletion.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({
      answer: `${answer} An unsupported additional source should not be linked [8].`, relevantInsights: [],
    }) } }] });
    const result = await askMatrixQuestion(matrix, 'What else is happening?');
    expect(result.answer).toContain('[1]');
    expect(result.answer).not.toContain('[8]');
  });

  it('uses the deployment default temperature when composing a web-grounded answer', async () => {
    createCompletion.mockImplementation(async (request) => {
      if (request.temperature !== undefined) {
        throw Object.assign(new Error('Only the default temperature is supported by this model.'), {
          status: 400, code: 'unsupported_value', param: 'temperature',
        });
      }
      return { choices: [{ message: { content: JSON.stringify({ answer, relevantInsights: [] }) } }] };
    });

    await expect(askMatrixQuestion(matrix, 'What is happening now?')).resolves.toMatchObject({
      answer, sources, webSearchStatus: 'completed',
    });
    expect(createCompletion).toHaveBeenCalledTimes(1);
    expect(createCompletion.mock.calls[0][0]).not.toHaveProperty('temperature');
  });
});
