import { describe, expect, it, vi } from 'vitest';
import { analyzeBrandWithVision } from './services/analyzeBrandWithVision';

describe('analyzeBrandWithVision', () => {
  it('sends a base64 screenshot to gpt-4o vision with json_object response format', async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              imageryStyle: ['Editorial product photography', 'Minimal UI overlays'],
              layoutComposition: 'Clear top-down hierarchy with strong CTA emphasis.',
              lightingAndTone: 'Soft, high-key lighting with clean contrast.',
              distinctivenessAssessment: 'Recognizable due to restrained palette and geometric framing.',
            }),
          },
        },
      ],
    });

    const fakeClient = {
      chat: {
        completions: {
          create,
        },
      },
    } as any;

    const result = await analyzeBrandWithVision('ZmFrZS1pbWFnZS1ieXRlcw==', { client: fakeClient });

    expect(create).toHaveBeenCalledTimes(1);
    const payload = create.mock.calls[0][0];
    expect(payload.model).toBe('gpt-4o');
    expect(payload.response_format).toEqual({ type: 'json_object' });
    expect(payload.messages[1].content[1]).toEqual({
      type: 'image_url',
      image_url: {
        url: 'data:image/jpeg;base64,ZmFrZS1pbWFnZS1ieXRlcw==',
      },
    });
    expect(result.imageryStyle).toEqual(['Editorial product photography', 'Minimal UI overlays']);
  });

  it('keeps provided data URL mime type when passed a full data URL', async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              imageryStyle: [],
              layoutComposition: 'Balanced.',
              lightingAndTone: 'Neutral.',
              distinctivenessAssessment: 'Moderate.',
            }),
          },
        },
      ],
    });

    const fakeClient = {
      chat: {
        completions: {
          create,
        },
      },
    } as any;

    await analyzeBrandWithVision('data:image/png;base64,AAAABBBB', { client: fakeClient });
    const payload = create.mock.calls[0][0];
    expect(payload.messages[1].content[1].image_url.url).toBe('data:image/png;base64,AAAABBBB');
  });

  it('recovers valid JSON when model wraps it in extra text', async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: `Here is the analysis:\n{"imageryStyle":["Cinematic"],"layoutComposition":"Layered","lightingAndTone":"Warm highlights","distinctivenessAssessment":"High memory value"}\nThanks.`,
          },
        },
      ],
    });

    const fakeClient = {
      chat: {
        completions: {
          create,
        },
      },
    } as any;

    const result = await analyzeBrandWithVision('ZmFrZS1pbWFnZS1ieXRlcw==', { client: fakeClient });
    expect(result.layoutComposition).toBe('Layered');
    expect(result.lightingAndTone).toBe('Warm highlights');
  });

  it('throws a clear error when screenshot input is empty', async () => {
    await expect(analyzeBrandWithVision('   ', { client: {} as any })).rejects.toThrow(
      'base64Image is required',
    );
  });
});
