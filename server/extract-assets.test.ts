import { describe, expect, it, vi } from 'vitest';
import {
  evaluateBrandLogoCandidates,
  extractColorPalette,
  extractTypography,
  pickTopLogoCandidates,
  type RawLogoCandidate,
} from './extract-assets';

describe('evaluateBrandLogoCandidates', () => {
  it('collects og:image, icon links, and logo candidates from semantic containers', () => {
    document.head.innerHTML = `
      <meta property="og:image" content="/meta/brand-og.png" />
      <link rel="icon" href="/favicon.ico" />
      <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      <base href="https://example.com/" />
    `;

    document.body.innerHTML = `
      <header>
        <img src="/assets/header-logo.png" alt="Company logo" />
        <svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" /></svg>
      </header>
      <nav>
        <img src="https://cdn.example.com/nav-logo.svg" />
      </nav>
      <div class="brand-logo-wrap">
        <img src="/assets/class-logo.png" />
      </div>
      <div id="site-logo-block">
        <svg viewBox="0 0 20 20"><rect width="20" height="20" /></svg>
      </div>
    `;

    const result = evaluateBrandLogoCandidates();

    expect(result).toContain('https://example.com/meta/brand-og.png');
    expect(result).toContain('https://example.com/favicon.ico');
    expect(result).toContain('https://example.com/apple-touch-icon.png');
    expect(result).toContain('https://example.com/assets/header-logo.png');
    expect(result).toContain('https://cdn.example.com/nav-logo.svg');
    expect(result).toContain('https://example.com/assets/class-logo.png');
    expect(result.some((value) => value.startsWith('data:image/svg+xml,'))).toBe(true);
  });

  it('deduplicates entries and filters invalid URL schemes', () => {
    document.head.innerHTML = `<base href="https://example.com/" />`;
    document.body.innerHTML = `
      <header>
        <img src="/assets/logo.png" />
      </header>
      <div class="logo">
        <img src="/assets/logo.png" />
        <img src="javascript:alert('x')" />
      </div>
    `;

    const result = evaluateBrandLogoCandidates();

    const logoMatches = result.filter((value) => value === 'https://example.com/assets/logo.png');
    expect(logoMatches).toHaveLength(1);
    expect(result.some((value) => value.startsWith('javascript:'))).toBe(false);
  });
});

describe('pickTopLogoCandidates', () => {
  it('prioritizes header/nav/logo candidates over og:image and icons', () => {
    const candidates: RawLogoCandidate[] = [
      { url: 'https://example.com/og.png', source: 'og:image' },
      { url: 'https://example.com/favicon-32x32.png', source: 'icon', width: 32, height: 32 },
      { url: 'https://example.com/logo-in-header.svg', source: 'header-img', width: 220, height: 80 },
      { url: 'https://example.com/logo-in-nav.svg', source: 'nav-img', width: 180, height: 64 },
      { url: 'https://example.com/logo-class.png', source: 'logo-img', width: 200, height: 60 },
    ];

    const result = pickTopLogoCandidates(candidates, 3);

    expect(result).toEqual([
      'https://example.com/logo-in-header.svg',
      'https://example.com/logo-in-nav.svg',
      'https://example.com/logo-class.png',
    ]);
  });

  it('de-prioritizes tiny favicon-like assets and returns only top 3 unique URLs', () => {
    const candidates: RawLogoCandidate[] = [
      { url: 'https://example.com/favicon.ico', source: 'icon', width: 16, height: 16 },
      { url: 'https://example.com/apple-touch-icon.png', source: 'apple-touch-icon', width: 180, height: 180 },
      { url: 'https://example.com/header-logo.png', source: 'header-img', width: 300, height: 90 },
      { url: 'https://example.com/header-logo.png', source: 'logo-img', width: 300, height: 90 },
      { url: 'https://example.com/nav-logo.svg', source: 'nav-img', width: 200, height: 70 },
      { url: 'https://example.com/logo.svg', source: 'logo-svg' },
      { url: 'javascript:alert(1)', source: 'logo-img' },
    ];

    const result = pickTopLogoCandidates(candidates, 3);

    expect(result).toEqual([
      'https://example.com/header-logo.png',
      'https://example.com/nav-logo.svg',
      'https://example.com/logo.svg',
    ]);
    expect(result).not.toContain('https://example.com/favicon.ico');
  });
});

describe('extractTypography', () => {
  it('extracts and deduplicates computed typography samples by tag', async () => {
    const close = vi.fn(async () => {});
    const goto = vi.fn(async () => {});
    const screenshot = vi.fn(async () => Buffer.from('unused'));
    const evaluate = vi.fn(async () => ({
      h1: [
        { fontFamily: 'Inter, sans-serif', fontWeight: '700', fontSize: '48px', lineHeight: '56px', color: 'rgb(0, 0, 0)' },
        { fontFamily: 'Inter, sans-serif', fontWeight: '700', fontSize: '48px', lineHeight: '56px', color: 'rgb(0, 0, 0)' },
      ],
      h2: [],
      h3: [
        { fontFamily: 'Inter, sans-serif', fontWeight: '600', fontSize: '28px', lineHeight: '36px', color: 'rgb(25, 25, 25)' },
      ],
      p: [
        { fontFamily: 'Inter, sans-serif', fontWeight: '400', fontSize: '16px', lineHeight: '24px', color: 'rgb(51, 51, 51)' },
        { fontFamily: 'Inter, sans-serif', fontWeight: '400', fontSize: '16px', lineHeight: '24px', color: 'rgb(51, 51, 51)' },
      ],
    }));
    const newPage = vi.fn(async () => ({ goto, evaluate, screenshot }));
    const launchBrowser = vi.fn(async () => ({ newPage, close }));

    const result = await extractTypography('https://example.com', { launchBrowser, maxSamplesPerTag: 3 });

    expect(goto).toHaveBeenCalledWith('https://example.com', expect.objectContaining({ waitUntil: 'networkidle' }));
    expect(result.h1).toHaveLength(1);
    expect(result.h2).toHaveLength(0);
    expect(result.h3).toHaveLength(1);
    expect(result.p).toHaveLength(1);
    expect(result.body).toEqual(result.p);
    expect(close).toHaveBeenCalled();
  });

  it('returns empty arrays for missing tags and still provides a stable shape', async () => {
    const close = vi.fn(async () => {});
    const goto = vi.fn(async () => {});
    const screenshot = vi.fn(async () => Buffer.from('unused'));
    const evaluate = vi.fn(async () => ({}));
    const newPage = vi.fn(async () => ({ goto, evaluate, screenshot }));
    const launchBrowser = vi.fn(async () => ({ newPage, close }));

    const result = await extractTypography('https://example.com', { launchBrowser });

    expect(result).toEqual({
      h1: [],
      h2: [],
      h3: [],
      p: [],
      body: [],
    });
    expect(close).toHaveBeenCalled();
  });
});

describe('extractColorPalette', () => {
  it('maps node-vibrant swatches into custom accent/neutral keys', async () => {
    const close = vi.fn(async () => {});
    const goto = vi.fn(async () => {});
    const screenshot = vi.fn(async () => Buffer.from('fake-png-buffer'));
    const evaluate = vi.fn(async () => ({}));
    const newPage = vi.fn(async () => ({ goto, screenshot, evaluate }));
    const launchBrowser = vi.fn(async () => ({ newPage, close }));
    const extractPalette = vi.fn(async () => ({
      Vibrant: { hex: '#0A66FA' },
      Muted: { hex: '#6C7A89' },
      DarkVibrant: { hex: '#0B2F7F' },
      DarkMuted: { hex: '#334455' },
      LightVibrant: { hex: '#8CC4FF' },
      LightMuted: { hex: '#D8DEE6' },
    }));

    const result = await extractColorPalette('https://example.com', { launchBrowser, extractPalette });

    expect(goto).toHaveBeenCalledWith('https://example.com/', expect.objectContaining({ waitUntil: 'networkidle' }));
    expect(screenshot).toHaveBeenCalledWith(expect.objectContaining({ fullPage: false, type: 'png' }));
    expect(result).toEqual({
      primaryAccent: '#0A66FA',
      secondaryAccent: '#8CC4FF',
      darkNeutral: '#334455',
      lightNeutral: '#D8DEE6',
      swatches: {
        Vibrant: '#0A66FA',
        Muted: '#6C7A89',
        DarkVibrant: '#0B2F7F',
        DarkMuted: '#334455',
        LightVibrant: '#8CC4FF',
        LightMuted: '#D8DEE6',
      },
    });
    expect(close).toHaveBeenCalled();
  });

  it('returns null when node-vibrant throws', async () => {
    const close = vi.fn(async () => {});
    const goto = vi.fn(async () => {});
    const screenshot = vi.fn(async () => Buffer.from('fake-png-buffer'));
    const evaluate = vi.fn(async () => ({}));
    const newPage = vi.fn(async () => ({ goto, screenshot, evaluate }));
    const launchBrowser = vi.fn(async () => ({ newPage, close }));
    const extractPalette = vi.fn(async () => {
      throw new Error('palette parse failed');
    });

    const result = await extractColorPalette('https://example.com', { launchBrowser, extractPalette });

    expect(result).toBeNull();
    expect(close).toHaveBeenCalled();
  });
});
