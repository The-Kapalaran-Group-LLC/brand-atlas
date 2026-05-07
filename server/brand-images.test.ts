import { describe, expect, it, vi } from 'vitest';
import {
  combineDesignTokensForUpdatedPath,
  buildDesignExcavatorVisionSystemPrompt,
  buildWebsiteScreenshotUrl,
  extractDesignTokensFromHtml,
  analyzeBrandDesignFromScreenshot,
} from './brand-images';

describe('extractDesignTokensFromHtml', () => {
  it('extracts unique CSS hex colors and font families with limits', () => {
    const html = `
      <style>
        :root {
          --brand-primary: #1a2b3c;
          --brand-accent: #ABC;
        }
        body { font-family: 'Avenir Next', Arial, sans-serif; color: #1a2b3c; }
        h1 { font-family: "GT America", Helvetica, sans-serif; }
      </style>
      <div style="background:#ff8800;">Hello</div>
    `;

    const result = extractDesignTokensFromHtml(html);

    expect(result.colors).toEqual(['#1A2B3C', '#ABC', '#FF8800']);
    expect(result.fonts).toEqual([
      'Avenir Next, Arial, sans-serif',
      'GT America, Helvetica, sans-serif',
    ]);
  });

  it('extracts rgb/rgba colors and CSS variable font declarations', () => {
    const html = `
      <style>
        :root {
          --brand-primary-rgb: rgb(200, 16, 46);
          --brand-overlay: rgba(8, 8, 8, 0.6);
          --font-body: "Graphik", Arial, sans-serif;
        }
        body {
          color: rgb(200, 16, 46);
          font-family: var(--font-body);
        }
      </style>
    `;

    const result = extractDesignTokensFromHtml(html);

    expect(result.colors).toContain('#C8102E');
    expect(result.colors).toContain('#080808');
    expect(result.fonts).toContain('Graphik, Arial, sans-serif');
  });
});

describe('Design excavator vision helpers', () => {
  it('combines updated path tokens by preferring vision output and keeping scraped fallback', () => {
    const merged = combineDesignTokensForUpdatedPath(
      { colors: ['#635BFF'], fonts: ['Inter'] },
      { colors: ['#0A2540', '#635BFF'], fonts: ['Sohne', 'Inter'] }
    );

    expect(merged.colors).toEqual(['#635BFF', '#0A2540']);
    expect(merged.fonts).toEqual(['Inter', 'Sohne']);
  });

  it('builds thum.io screenshot URL from domain input', () => {
    const screenshotUrl = buildWebsiteScreenshotUrl('stripe.com');
    expect(screenshotUrl).toBe('https://image.thum.io/get/width/1920/noanimate/https://stripe.com/');
  });

  it('includes explicit typography, visual hierarchy, and color balance guidance in system prompt', () => {
    const prompt = buildDesignExcavatorVisionSystemPrompt();
    expect(prompt).toMatch(/typography/i);
    expect(prompt).toMatch(/visual hierarchy/i);
    expect(prompt).toMatch(/color balance/i);
    expect(prompt).toMatch(/provided screenshot/i);
  });

  it('sends image_url content to GPT-4o vision call', async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              fontFamilies: ['Inter', 'Sohne'],
              primaryColors: ['#635BFF', '#0A2540'],
              typographyHierarchy: ['Large bold headline'],
              visualHierarchy: ['Headline > CTA > proof points'],
              colorBalance: 'Indigo-led palette with strong neutral contrast',
              imageryStyle: ['Minimal product mockups'],
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

    const result = await analyzeBrandDesignFromScreenshot('stripe.com', { client: fakeClient });

    expect(create).toHaveBeenCalledTimes(1);
    const payload = create.mock.calls[0][0];
    expect(payload.model).toBe(process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4o');
    const userMessage = payload.messages.find((msg: any) => msg.role === 'user');
    expect(Array.isArray(userMessage.content)).toBe(true);
    expect(userMessage.content[1]).toEqual({
      type: 'image_url',
      image_url: {
        url: 'https://image.thum.io/get/width/1920/noanimate/https://stripe.com/',
      },
    });
    expect(result?.fontFamilies).toEqual(['Inter', 'Sohne']);
  });
});
