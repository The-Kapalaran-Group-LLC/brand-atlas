import { describe, expect, it } from 'vitest';
import { buildBrandWebsiteContextPrompt, type BrandWebsiteContext } from './brand-web-context';

describe('buildBrandWebsiteContextPrompt', () => {
  it('returns empty string when no contexts are available', () => {
    expect(buildBrandWebsiteContextPrompt([])).toBe('');
  });

  it('formats contexts into a prompt section', () => {
    const contexts: BrandWebsiteContext[] = [
      {
        brand: 'Nike',
        website: 'https://www.nike.com',
        pages: [
          {
            url: 'https://www.nike.com/',
            title: 'Nike',
            summary: 'Athletic footwear and apparel.',
          },
          {
            url: 'https://about.nike.com/',
            title: 'About Nike',
            summary: 'Corporate information and leadership updates.',
          },
        ],
      },
    ];

    const prompt = buildBrandWebsiteContextPrompt(contexts);
    expect(prompt).toContain('GROUNDING CONTEXT FROM OFFICIAL BRAND/CORPORATE WEBSITES');
    expect(prompt).toContain('Brand: Nike');
    expect(prompt).toContain('Website: https://www.nike.com');
    expect(prompt).toContain('Source: https://about.nike.com/');
    expect(prompt).toContain('Use this grounding context before any broader inference');
  });
});
