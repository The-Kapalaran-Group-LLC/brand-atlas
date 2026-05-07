import { load as cheerioLoad } from 'cheerio';
import { AzureOpenAI } from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { z } from 'zod';

export interface BrandImagesResult {
  logoUrl: string | null;
  heroImageUrl: string | null;
  designTokens: {
    colors: string[];
    fonts: string[];
  };
}

export interface BrandVisionAnalysis {
  sourceWebsite: string;
  screenshotUrl: string;
  fontFamilies: string[];
  primaryColors: string[];
  typographyHierarchy: string[];
  visualHierarchy: string[];
  colorBalance: string;
  imageryStyle: string[];
}

const FETCH_TIMEOUT_MS = 10000;
const LOGO_HINT = /logo/i;
const DESIGN_VISION_MODEL = process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4o';
const HEX_COLOR_REGEX = /#([a-fA-F0-9]{6}|[a-fA-F0-9]{3})\b/g;
const RGB_COLOR_REGEX = /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)/gi;

type LogoSource = 'jsonld' | 'og-logo' | 'header-nav-logo' | 'page-logo' | 'link-logo' | 'icon';

interface LogoCandidate {
  url: string;
  source: LogoSource;
}

const BrandVisionAnalysisSchema = z.object({
  fontFamilies: z.array(z.string()).default([]),
  primaryColors: z.array(z.string()).default([]),
  typographyHierarchy: z.array(z.string()).default([]),
  visualHierarchy: z.array(z.string()).default([]),
  colorBalance: z.string().default('Not available'),
  imageryStyle: z.array(z.string()).default([]),
});

type ChatCompletionClient = {
  chat: {
    completions: {
      create: (params: any) => Promise<any>;
    };
  };
};

function getAzureVisionClient(): ChatCompletionClient | null {
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-02-15-preview';

  if (!apiKey || !endpoint) {
    console.log('[design-excavator-vision] Azure OpenAI credentials missing. Falling back to HTML/CSS scraping.');
    return null;
  }

  return new AzureOpenAI({
    apiKey,
    endpoint,
    apiVersion,
  }) as unknown as ChatCompletionClient;
}

function isFaviconLikeUrl(url?: string | null): boolean {
  if (!url) return false;
  return /favicon|apple-touch-icon|android-chrome|mstile|mask-icon/i.test(url);
}

function normalizeDomainToUrl(domain: string): URL {
  const candidate = (domain || '').trim();
  const withProtocol = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
  const url = new URL(withProtocol);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http/https domains are supported.');
  }
  return url;
}

export function buildWebsiteScreenshotUrl(websiteUrl: string): string {
  const parsedUrl = normalizeDomainToUrl(websiteUrl);
  return `https://image.thum.io/get/width/1920/noanimate/${parsedUrl.toString()}`;
}

export function buildDesignExcavatorVisionSystemPrompt(): string {
  return [
    'You are a senior visual identity analyst for Design Excavator.',
    'Analyze the provided screenshot directly; do not infer from source code, brand memory, or prior knowledge.',
    'Extract typography hierarchy, visual hierarchy, and color balance using only what is visibly present.',
    'Return concise, implementation-friendly observations for typography scale/contrast, layout priority, and palette usage.',
    'If uncertain, state uncertainty rather than fabricating details.',
  ].join(' ');
}

function resolveSecureAbsoluteUrl(rawUrl: string | null | undefined, baseUrl: URL): string | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  try {
    if (trimmed.startsWith('//')) {
      return new URL(`https:${trimmed}`).toString();
    }

    const absolute = new URL(trimmed, baseUrl);
    if (absolute.protocol !== 'http:' && absolute.protocol !== 'https:') return null;
    if (absolute.protocol === 'http:') {
      absolute.protocol = 'https:';
    }
    return absolute.toString();
  } catch {
    return null;
  }
}

export function extractDesignTokensFromHtml(html: string): { colors: string[]; fonts: string[] } {
  const fontRegex = /font-family:\s*([^;}{]+)/gi;
  const fontVariableRegex = /--[\w-]*font[\w-]*\s*:\s*([^;}{]+)/gi;
  const anyVariableRegex = /(--[\w-]+)\s*:\s*([^;}{]+)/gi;

  const hexColors = Array.from(new Set((html.match(HEX_COLOR_REGEX) || []).map((value) => value.toUpperCase())));

  RGB_COLOR_REGEX.lastIndex = 0;
  const rgbColors: string[] = [];
  let rgbMatch: RegExpExecArray | null = null;
  while ((rgbMatch = RGB_COLOR_REGEX.exec(html)) !== null) {
    const r = Math.max(0, Math.min(255, Number.parseInt(rgbMatch[1], 10)));
    const g = Math.max(0, Math.min(255, Number.parseInt(rgbMatch[2], 10)));
    const b = Math.max(0, Math.min(255, Number.parseInt(rgbMatch[3], 10)));
    if ([r, g, b].some((value) => Number.isNaN(value))) continue;
    rgbColors.push(
      `#${[r, g, b]
        .map((value) => value.toString(16).toUpperCase().padStart(2, '0'))
        .join('')}`
    );
  }

  const colors = Array.from(new Set([...hexColors, ...rgbColors])).slice(0, 15);

  const cssVariables = new Map<string, string>();
  let cssVariableMatch: RegExpExecArray | null = null;
  while ((cssVariableMatch = anyVariableRegex.exec(html)) !== null) {
    const name = (cssVariableMatch[1] || '').trim();
    const value = (cssVariableMatch[2] || '').trim();
    if (!name || !value) continue;
    cssVariables.set(name, value);
  }

  const normalizeFontValue = (fontValue: string): string => {
    const resolved = fontValue.trim().replace(/var\((--[\w-]+)\)/gi, (_full, varName: string) => {
      const replacement = cssVariables.get(varName.trim());
      return replacement ? replacement : `var(${varName})`;
    });
    return resolved.replace(/['"]/g, '').replace(/\s{2,}/g, ' ').trim();
  };

  const rawFonts: string[] = [];
  let fontMatch: RegExpExecArray | null = null;
  while ((fontMatch = fontRegex.exec(html)) !== null) {
    const cleaned = normalizeFontValue(fontMatch[1] || '');
    if (cleaned) rawFonts.push(cleaned);
  }

  let fontVariableMatch: RegExpExecArray | null = null;
  while ((fontVariableMatch = fontVariableRegex.exec(html)) !== null) {
    const cleaned = normalizeFontValue(fontVariableMatch[1] || '');
    if (cleaned) rawFonts.push(cleaned);
  }

  const seenFonts = new Set<string>();
  const fonts = rawFonts.filter((font) => {
    const key = font.toLowerCase();
    if (seenFonts.has(key)) return false;
    seenFonts.add(key);
    return true;
  }).slice(0, 5);

  return { colors, fonts };
}

function normalizeVisionHexColors(colorCandidates: string[]): string[] {
  const normalized: string[] = [];
  for (const candidate of colorCandidates) {
    const matches = candidate.match(HEX_COLOR_REGEX) || [];
    for (const match of matches) {
      normalized.push(match.toUpperCase());
    }
  }
  return Array.from(new Set(normalized)).slice(0, 15);
}

export function combineDesignTokensForUpdatedPath(
  preferred: { colors: string[]; fonts: string[] },
  fallback: { colors: string[]; fonts: string[] }
) {
  return {
    colors: Array.from(new Set([...preferred.colors, ...fallback.colors])).slice(0, 15),
    fonts: Array.from(new Set([...preferred.fonts, ...fallback.fonts])).slice(0, 5),
  };
}

export async function analyzeBrandDesignFromScreenshot(
  domain: string,
  options?: { client?: ChatCompletionClient }
): Promise<BrandVisionAnalysis | null> {
  const baseUrl = normalizeDomainToUrl(domain);
  const screenshotUrl = buildWebsiteScreenshotUrl(baseUrl.toString());
  const client = options?.client || getAzureVisionClient();

  if (!client) {
    return null;
  }

  console.log('[design-excavator-vision] Sending screenshot to GPT-4o for direct visual analysis.', {
    sourceWebsite: baseUrl.toString(),
    screenshotUrl,
    model: DESIGN_VISION_MODEL,
  });

  try {
    const response = await client.chat.completions.create({
      model: DESIGN_VISION_MODEL,
      messages: [
        {
          role: 'system',
          content: buildDesignExcavatorVisionSystemPrompt(),
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: "Analyze this brand's website design from the screenshot. Extract the typography hierarchy, primary colors, describe visual hierarchy, and summarize color balance and imagery style.",
            },
            {
              type: 'image_url',
              image_url: {
                url: screenshotUrl,
              },
            },
          ],
        },
      ],
      response_format: zodResponseFormat(BrandVisionAnalysisSchema, 'design_report'),
    });

    const content = response.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('Vision response content was empty.');
    }

    const parsed = BrandVisionAnalysisSchema.parse(JSON.parse(content));
    return {
      sourceWebsite: baseUrl.toString(),
      screenshotUrl,
      ...parsed,
    };
  } catch (error) {
    console.log('[design-excavator-vision] Vision analysis failed. Falling back to HTML/CSS scraping.', {
      domain: baseUrl.toString(),
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function fetchHtml(url: URL): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (compatible; CulturalArchaeologistAssetBot/1.0)',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch HTML (${response.status})`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      throw new Error(`Unexpected content type: ${contentType || 'unknown'}`);
    }

    return await response.text();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown network error';
    throw new Error(`HTML request failed for ${url.hostname}: ${message}`);
  } finally {
    clearTimeout(timeout);
  }
}

function parseJsonLdBlocks($: any): Array<Record<string, any>> {
  const nodes = $('script[type="application/ld+json"]').toArray();
  const output: Array<Record<string, any>> = [];

  for (const node of nodes) {
    const raw = $(node).contents().text().trim();
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.forEach((item) => {
          if (item && typeof item === 'object') output.push(item as Record<string, any>);
        });
        continue;
      }

      if (parsed && typeof parsed === 'object') {
        if (Array.isArray((parsed as any)['@graph'])) {
          (parsed as any)['@graph'].forEach((item: unknown) => {
            if (item && typeof item === 'object') output.push(item as Record<string, any>);
          });
        }
        output.push(parsed as Record<string, any>);
      }
    } catch {
      // Keep scraping resilient: ignore malformed JSON-LD blocks.
    }
  }

  return output;
}

function isOrgLikeType(rawType: unknown): boolean {
  if (!rawType) return false;
  if (Array.isArray(rawType)) return rawType.some((t) => /organization|brand/i.test(String(t)));
  return /organization|brand/i.test(String(rawType));
}

function extractImageValue(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractImageValue(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, any>;
    return obj.url || obj.contentUrl || obj['@id'] || null;
  }
  return null;
}

function extractFromJsonLdOrg(blocks: Array<Record<string, any>>, key: 'logo' | 'image'): string | null {
  for (const block of blocks) {
    if (!isOrgLikeType(block['@type'])) continue;
    const candidate = extractImageValue(block[key]);
    if (candidate) return candidate;
  }
  return null;
}

function getLogoSourceBaseScore(source: LogoSource): number {
  switch (source) {
    case 'jsonld':
      return 100;
    case 'og-logo':
      return 92;
    case 'header-nav-logo':
      return 84;
    case 'page-logo':
      return 72;
    case 'link-logo':
      return 64;
    case 'icon':
      return 10;
    default:
      return 0;
  }
}

function scoreLogoCandidate(candidate: LogoCandidate): number {
  const lowerUrl = candidate.url.toLowerCase();
  let score = getLogoSourceBaseScore(candidate.source);

  if (isFaviconLikeUrl(candidate.url)) {
    score -= 85;
  }

  if (/(16x16|24x24|32x32|48x48|57x57|60x60|72x72|96x96|120x120|128x128|144x144|152x152|167x167|180x180|192x192|256x256)/.test(lowerUrl)) {
    score -= 40;
  }

  if (/sprite|avatar|gravatar/.test(lowerUrl)) {
    score -= 25;
  }

  if (/logo|wordmark|brandmark|brand-mark/.test(lowerUrl)) {
    score += 22;
  }

  if (/\.svg($|\?)/.test(lowerUrl)) {
    score += 8;
  }

  return score;
}

function pickBestLogoCandidate(candidates: LogoCandidate[]): string | null {
  if (!candidates.length) return null;

  const deduped: LogoCandidate[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const key = candidate.url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(candidate);
  }

  deduped.sort((a, b) => scoreLogoCandidate(b) - scoreLogoCandidate(a));
  const best = deduped[0];

  if (!best || scoreLogoCandidate(best) < 15) {
    return null;
  }

  return best.url;
}

function extractLogoUrl($: any, baseUrl: URL): string | null {
  const candidates: LogoCandidate[] = [];

  // Priority A: JSON-LD Organization/Brand logo.
  const jsonLd = parseJsonLdBlocks($);
  const jsonLdLogo = resolveSecureAbsoluteUrl(extractFromJsonLdOrg(jsonLd, 'logo'), baseUrl);
  if (jsonLdLogo) {
    candidates.push({ url: jsonLdLogo, source: 'jsonld' });
  }

  // Priority B: Meta og:logo.
  const ogLogo = resolveSecureAbsoluteUrl($('meta[property="og:logo"]').first().attr('content'), baseUrl);
  if (ogLogo) {
    candidates.push({ url: ogLogo, source: 'og-logo' });
  }

  // Priority C: Header/nav images with logo hints.
  $('header img, nav img').each((_: number, el: any) => {
    const src = $(el).attr('src') || $(el).attr('data-src') || '';
    const alt = $(el).attr('alt') || '';
    const cls = $(el).attr('class') || '';
    const id = $(el).attr('id') || '';
    const ctx = `${src} ${alt} ${cls} ${id}`;
    if (!LOGO_HINT.test(ctx)) return;

    const resolved = resolveSecureAbsoluteUrl(src, baseUrl);
    if (resolved) {
      candidates.push({ url: resolved, source: 'header-nav-logo' });
    }
  });

  // Priority D: Any page image with strong logo hints.
  $('img[alt*="logo" i], img[class*="logo" i], img[id*="logo" i]').each((_: number, el: any) => {
    const src = $(el).attr('src') || $(el).attr('data-src') || '';
    const resolved = resolveSecureAbsoluteUrl(src, baseUrl);
    if (resolved) {
      candidates.push({ url: resolved, source: 'page-logo' });
    }
  });

  // Priority E: Link rel values that explicitly mention logo.
  $('link[rel*="logo" i]').each((_: number, el: any) => {
    const href = $(el).attr('href') || '';
    const resolved = resolveSecureAbsoluteUrl(href, baseUrl);
    if (resolved) {
      candidates.push({ url: resolved, source: 'link-logo' });
    }
  });

  // Priority F: Icon links only as weak fallback evidence.
  const appleTouch = resolveSecureAbsoluteUrl($('link[rel="apple-touch-icon"]').first().attr('href'), baseUrl);
  if (appleTouch) {
    candidates.push({ url: appleTouch, source: 'icon' });
  }

  const icon192 = resolveSecureAbsoluteUrl($('link[rel="icon"][sizes="192x192"]').first().attr('href'), baseUrl);
  if (icon192) {
    candidates.push({ url: icon192, source: 'icon' });
  }

  const best = pickBestLogoCandidate(candidates);
  if (best) {
    return best;
  }

  // Final fallback only.
  return `https://logo.clearbit.com/${baseUrl.hostname}`;
}

function extractHeroImageUrl($: any, baseUrl: URL): string | null {
  // Priority A: Open Graph image
  const ogSecure = resolveSecureAbsoluteUrl($('meta[property="og:image:secure_url"]').first().attr('content'), baseUrl);
  if (ogSecure) return ogSecure;

  const ogImage = resolveSecureAbsoluteUrl($('meta[property="og:image"]').first().attr('content'), baseUrl);
  if (ogImage) return ogImage;

  // Priority B: JSON-LD Organization/Brand image
  const jsonLd = parseJsonLdBlocks($);
  return resolveSecureAbsoluteUrl(extractFromJsonLdOrg(jsonLd, 'image'), baseUrl);
}

export async function extractPreciseBrandAssets(domain: string): Promise<BrandImagesResult> {
  try {
    const baseUrl = normalizeDomainToUrl(domain);
    const html = await fetchHtml(baseUrl);
    const $ = cheerioLoad(html);
    const scrapedDesignTokens = extractDesignTokensFromHtml(html);
    const visionAnalysis = await analyzeBrandDesignFromScreenshot(baseUrl.toString());
    const visionDesignTokens = visionAnalysis
      ? {
          colors: normalizeVisionHexColors(visionAnalysis.primaryColors),
          fonts: Array.from(new Set((visionAnalysis.fontFamilies || []).map((font) => (font || '').trim()).filter(Boolean))).slice(0, 5),
        }
      : { colors: [], fonts: [] };

    const designTokens = combineDesignTokensForUpdatedPath(visionDesignTokens, scrapedDesignTokens);
    console.log('[design-excavator-vision] Final design tokens assembled.', {
      domain: baseUrl.toString(),
      scrapedColorCount: scrapedDesignTokens.colors.length,
      scrapedFontCount: scrapedDesignTokens.fonts.length,
      visionColorCount: visionDesignTokens.colors.length,
      visionFontCount: visionDesignTokens.fonts.length,
      finalColorCount: designTokens.colors.length,
      finalFontCount: designTokens.fonts.length,
    });

    return {
      logoUrl: extractLogoUrl($, baseUrl),
      heroImageUrl: extractHeroImageUrl($, baseUrl),
      designTokens,
    };
  } catch {
    // Fail-safe return so callers can proceed gracefully.
    return {
      logoUrl: null,
      heroImageUrl: null,
      designTokens: {
        colors: [],
        fonts: [],
      },
    };
  }
}

export async function extractLegacyBrandAssets(domain: string): Promise<BrandImagesResult> {
  try {
    const baseUrl = normalizeDomainToUrl(domain);
    const html = await fetchHtml(baseUrl);
    const $ = cheerioLoad(html);
    const designTokens = extractDesignTokensFromHtml(html);

    console.log('[design-excavator-legacy] Returning scraping-only brand assets.', {
      domain: baseUrl.toString(),
      colorCount: designTokens.colors.length,
      fontCount: designTokens.fonts.length,
    });

    return {
      logoUrl: extractLogoUrl($, baseUrl),
      heroImageUrl: extractHeroImageUrl($, baseUrl),
      designTokens,
    };
  } catch (error) {
    console.log('[design-excavator-legacy] Scraping-only extraction failed.', {
      domain,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      logoUrl: null,
      heroImageUrl: null,
      designTokens: {
        colors: [],
        fonts: [],
      },
    };
  }
}

// Backward-compatible export used by current Brand Deep Dive server endpoint.
export async function extractBrandImages(domain: string): Promise<BrandImagesResult> {
  return extractPreciseBrandAssets(domain);
}
