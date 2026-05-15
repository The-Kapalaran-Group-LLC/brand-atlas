import { Vibrant } from 'node-vibrant/node';

export type RawLogoSource =
  | 'og:image'
  | 'icon'
  | 'apple-touch-icon'
  | 'header-img'
  | 'nav-img'
  | 'logo-img'
  | 'header-svg'
  | 'nav-svg'
  | 'logo-svg';

export interface RawLogoCandidate {
  url: string;
  source: RawLogoSource;
  width?: number;
  height?: number;
}

export interface TypographyStyleSample {
  fontFamily: string;
  fontWeight: string;
  fontSize: string;
  lineHeight: string;
  color: string;
}

export interface TypographyExtractionResult {
  h1: TypographyStyleSample[];
  h2: TypographyStyleSample[];
  h3: TypographyStyleSample[];
  p: TypographyStyleSample[];
  body: TypographyStyleSample[];
}

export interface ColorSwatchMap {
  Vibrant: string | null;
  Muted: string | null;
  DarkVibrant: string | null;
  DarkMuted: string | null;
  LightVibrant: string | null;
  LightMuted: string | null;
}

export interface ExtractedColorPalette {
  primaryAccent: string | null;
  secondaryAccent: string | null;
  darkNeutral: string | null;
  lightNeutral: string | null;
  swatches: ColorSwatchMap;
}

interface TypographyExtractionOptions {
  maxSamplesPerTag?: number;
  launchBrowser?: () => Promise<{
    newPage: () => Promise<{
      goto: (url: string, options?: { waitUntil?: 'networkidle' | 'domcontentloaded' | 'load'; timeout?: number }) => Promise<unknown>;
      evaluate: (pageFunction: (...args: any[]) => unknown, ...args: any[]) => Promise<any>;
      screenshot: (options?: { fullPage?: boolean; type?: 'png' | 'jpeg' }) => Promise<Buffer>;
    }>;
    close: () => Promise<void>;
  }>;
}

interface ColorPaletteExtractionOptions {
  launchBrowser?: () => Promise<{
    newPage: () => Promise<{
      goto: (url: string, options?: { waitUntil?: 'networkidle' | 'domcontentloaded' | 'load'; timeout?: number }) => Promise<unknown>;
      screenshot: (options?: { fullPage?: boolean; type?: 'png' | 'jpeg' }) => Promise<Buffer>;
      evaluate: (pageFunction: (...args: any[]) => unknown, ...args: any[]) => Promise<any>;
    }>;
    close: () => Promise<void>;
  }>;
  extractPalette?: (imageBuffer: Buffer) => Promise<{
    Vibrant?: { hex?: string | null } | null;
    Muted?: { hex?: string | null } | null;
    DarkVibrant?: { hex?: string | null } | null;
    DarkMuted?: { hex?: string | null } | null;
    LightVibrant?: { hex?: string | null } | null;
    LightMuted?: { hex?: string | null } | null;
  }>;
}

function dedupeTypographySamples(samples: TypographyStyleSample[]): TypographyStyleSample[] {
  const output: TypographyStyleSample[] = [];
  const seen = new Set<string>();

  for (const sample of samples) {
    const key = JSON.stringify(sample);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(sample);
  }

  return output;
}

const defaultTypographyResult = (): TypographyExtractionResult => ({
  h1: [],
  h2: [],
  h3: [],
  p: [],
  body: [],
});

async function defaultPlaywrightBrowserLauncher() {
  const moduleName = 'playwright';
  const playwright = await import(moduleName);
  const chromium = playwright.chromium as {
    launch: (options?: { headless?: boolean }) => Promise<{
      newPage: () => Promise<{
        goto: (url: string, options?: { waitUntil?: 'networkidle' | 'domcontentloaded' | 'load'; timeout?: number }) => Promise<unknown>;
        evaluate: (pageFunction: (...args: any[]) => unknown, ...args: any[]) => Promise<any>;
        screenshot: (options?: { fullPage?: boolean; type?: 'png' | 'jpeg' }) => Promise<Buffer>;
      }>;
      close: () => Promise<void>;
    }>;
  };
  return chromium.launch({ headless: true });
}

async function defaultColorPaletteExtractor(imageBuffer: Buffer) {
  return await Vibrant.from(imageBuffer).getPalette();
}

export async function extractTypography(
  url: string,
  options?: TypographyExtractionOptions
): Promise<TypographyExtractionResult> {
  const target = (url || '').trim();
  if (!target) {
    throw new Error('A valid URL is required for typography extraction.');
  }

  const maxSamplesPerTag = Math.max(1, Math.min(10, Number(options?.maxSamplesPerTag || 3)));
  const launchBrowser = options?.launchBrowser || defaultPlaywrightBrowserLauncher;
  const browser = await launchBrowser();
  const page = await browser.newPage();

  try {
    await page.goto(target, { waitUntil: 'networkidle', timeout: 30_000 });

    const rawTypography = await page.evaluate((sampleLimit: number) => {
      const empty = {
        h1: [],
        h2: [],
        h3: [],
        p: [],
      };

      const sampleStyles = (selector: 'h1' | 'h2' | 'h3' | 'p') => {
        const nodes = Array.from(document.querySelectorAll(selector)).slice(0, sampleLimit);
        if (!nodes.length) return [];

        return nodes.map((element) => {
          const styles = window.getComputedStyle(element as Element);
          return {
            fontFamily: styles.fontFamily,
            fontWeight: styles.fontWeight,
            fontSize: styles.fontSize,
            lineHeight: styles.lineHeight,
            color: styles.color,
          };
        });
      };

      return {
        ...empty,
        h1: sampleStyles('h1'),
        h2: sampleStyles('h2'),
        h3: sampleStyles('h3'),
        p: sampleStyles('p'),
      };
    }, maxSamplesPerTag);

    const result = defaultTypographyResult();
    result.h1 = dedupeTypographySamples(Array.isArray(rawTypography?.h1) ? rawTypography.h1 : []);
    result.h2 = dedupeTypographySamples(Array.isArray(rawTypography?.h2) ? rawTypography.h2 : []);
    result.h3 = dedupeTypographySamples(Array.isArray(rawTypography?.h3) ? rawTypography.h3 : []);
    result.p = dedupeTypographySamples(Array.isArray(rawTypography?.p) ? rawTypography.p : []);
    result.body = [...result.p];

    return result;
  } finally {
    await browser.close();
  }
}

function toSafeHttpUrl(rawUrl: string): string {
  const parsed = new URL((rawUrl || '').trim());
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http/https URLs are supported.');
  }
  return parsed.toString();
}

function pickPaletteHex(
  palette: {
    Vibrant?: { hex?: string | null } | null;
    Muted?: { hex?: string | null } | null;
    DarkVibrant?: { hex?: string | null } | null;
    DarkMuted?: { hex?: string | null } | null;
    LightVibrant?: { hex?: string | null } | null;
    LightMuted?: { hex?: string | null } | null;
  },
  keys: Array<'Vibrant' | 'Muted' | 'DarkVibrant' | 'DarkMuted' | 'LightVibrant' | 'LightMuted'>
): string | null {
  for (const key of keys) {
    const hex = palette[key]?.hex;
    if (typeof hex === 'string' && hex.trim()) return hex;
  }
  return null;
}

export async function extractColorPalette(
  url: string,
  options?: ColorPaletteExtractionOptions
): Promise<ExtractedColorPalette | null> {
  const target = toSafeHttpUrl(url);
  const launchBrowser = options?.launchBrowser || defaultPlaywrightBrowserLauncher;
  const extractPalette = options?.extractPalette || defaultColorPaletteExtractor;
  const browser = await launchBrowser();
  const page = await browser.newPage();

  try {
    await page.goto(target, { waitUntil: 'networkidle', timeout: 30_000 });

    const screenshotBuffer = await page.screenshot({
      fullPage: false,
      type: 'png',
    });

    let palette: Awaited<ReturnType<typeof extractPalette>>;
    try {
      palette = await extractPalette(screenshotBuffer);
    } catch (error) {
      console.error('[extract-color-palette] node-vibrant failed to process screenshot buffer.', { target, error });
      return null;
    }

    return {
      primaryAccent: pickPaletteHex(palette, ['Vibrant', 'LightVibrant', 'Muted']),
      secondaryAccent: pickPaletteHex(palette, ['LightVibrant', 'Vibrant', 'Muted']),
      darkNeutral: pickPaletteHex(palette, ['DarkMuted', 'DarkVibrant', 'Muted']),
      lightNeutral: pickPaletteHex(palette, ['LightMuted', 'Muted', 'LightVibrant']),
      swatches: {
        Vibrant: palette.Vibrant?.hex || null,
        Muted: palette.Muted?.hex || null,
        DarkVibrant: palette.DarkVibrant?.hex || null,
        DarkMuted: palette.DarkMuted?.hex || null,
        LightVibrant: palette.LightVibrant?.hex || null,
        LightMuted: palette.LightMuted?.hex || null,
      },
    };
  } catch (error) {
    console.error('[extract-color-palette] Color palette extraction failed.', { target, error });
    return null;
  } finally {
    await browser.close();
  }
}

export const evaluateBrandLogoCandidates = (): string[] => {
  const candidates = new Set<string>();
  const baseUrl = document.baseURI || window.location.href;

  const addResolvedUrl = (value: string | null | undefined) => {
    const raw = (value || '').trim();
    if (!raw) return;

    try {
      if (raw.startsWith('data:image/')) {
        candidates.add(raw);
        return;
      }

      const resolved = new URL(raw, baseUrl);
      if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return;
      candidates.add(resolved.toString());
    } catch {
      // Ignore malformed values to keep extraction resilient.
    }
  };

  // 1. Meta and link tags that commonly hold canonical branding assets.
  const ogImage = document.querySelector<HTMLMetaElement>('meta[property="og:image"]');
  addResolvedUrl(ogImage?.content);

  const iconLinks = document.querySelectorAll<HTMLLinkElement>('link[rel*="icon" i], link[rel="apple-touch-icon" i]');
  iconLinks.forEach((linkEl) => addResolvedUrl(linkEl.href || linkEl.getAttribute('href')));

  // 2. Header/nav/logo-context image candidates.
  const imageSelectors = [
    'header img',
    'nav img',
    '[class*="logo" i] img',
    '[id*="logo" i] img',
    'img[class*="logo" i]',
    'img[id*="logo" i]',
  ].join(', ');

  const logoImages = document.querySelectorAll<HTMLImageElement>(imageSelectors);
  logoImages.forEach((img) => addResolvedUrl(img.currentSrc || img.src || img.getAttribute('src')));

  // 3. Inline SVG candidates in semantic logo containers.
  const svgSelectors = [
    'header svg',
    'nav svg',
    '[class*="logo" i] svg',
    '[id*="logo" i] svg',
    'svg[class*="logo" i]',
    'svg[id*="logo" i]',
  ].join(', ');

  const svgLogos = document.querySelectorAll<SVGElement>(svgSelectors);
  svgLogos.forEach((svg) => {
    const svgString = new XMLSerializer().serializeToString(svg);
    const encoded = encodeURIComponent(svgString)
      .replace(/'/g, '%27')
      .replace(/"/g, '%22');
    candidates.add(`data:image/svg+xml,${encoded}`);
  });

  return Array.from(candidates);
};

function isUrlAllowed(url: string): boolean {
  if (!url) return false;
  if (url.startsWith('data:image/')) return true;
  return /^https?:\/\//i.test(url);
}

function normalizeDimension(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function scoreCandidate(candidate: RawLogoCandidate): number {
  const baseScoreBySource: Record<RawLogoSource, number> = {
    'header-img': 100,
    'nav-img': 95,
    'logo-img': 92,
    'header-svg': 90,
    'nav-svg': 88,
    'logo-svg': 86,
    'og:image': 70,
    'apple-touch-icon': 35,
    'icon': 25,
  };

  const url = (candidate.url || '').toLowerCase();
  const width = normalizeDimension(candidate.width);
  const height = normalizeDimension(candidate.height);
  let score = baseScoreBySource[candidate.source] ?? 0;

  if (/logo|brand|wordmark|logomark/.test(url)) {
    score += 10;
  }

  if (/favicon|apple-touch-icon|android-chrome|mstile|mask-icon/.test(url)) {
    score -= 45;
  }

  if (width > 0 && height > 0) {
    const maxSide = Math.max(width, height);
    if (maxSide <= 32) {
      score -= 75;
    } else if (maxSide <= 48) {
      score -= 55;
    } else if (maxSide <= 96) {
      score -= 20;
    }
  }

  return score;
}

export function pickTopLogoCandidates(candidates: RawLogoCandidate[], maxResults = 3): string[] {
  if (!Array.isArray(candidates) || !candidates.length) return [];

  const bestByUrl = new Map<string, { url: string; score: number }>();

  for (const rawCandidate of candidates) {
    const url = String(rawCandidate?.url || '').trim();
    if (!isUrlAllowed(url)) continue;

    const candidate: RawLogoCandidate = {
      url,
      source: rawCandidate.source,
      width: normalizeDimension(rawCandidate.width),
      height: normalizeDimension(rawCandidate.height),
    };

    const score = scoreCandidate(candidate);
    const existing = bestByUrl.get(url);
    if (!existing || score > existing.score) {
      bestByUrl.set(url, { url, score });
    }
  }

  return Array.from(bestByUrl.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, maxResults))
    .map((entry) => entry.url);
}
