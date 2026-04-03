/**
 * Brand image extraction utility for the Cultural Archeologist – Brand Deep Dive.
 *
 * extractBrandImages(domain)
 *   1. Scrapes the brand's website with cheerio to find a website-native logo URL.
 *   2. Scrapes the brand's website with cheerio to find the best hero/OG image.
 *      Priority: og:image → twitter:image → largest <img> (by declared dimensions or
 *      heuristic size scoring) → first non-tracking-pixel <img src>.
 *   3. Resolves relative URLs against the site origin.
 *
 * Returns { logoUrl, heroImageUrl }.
 */

import { load as cheerioLoad } from 'cheerio';

export interface BrandImagesResult {
  logoUrl: string;
  heroImageUrl: string | null;
}

// Minimum dimension (px) for a candidate image to be considered a real asset.
const MIN_DIMENSION = 100;
// Fetch timeout in ms.
const FETCH_TIMEOUT_MS = 10_000;

/**
 * Patterns that strongly indicate a decorative / tracking pixel rather than a
 * genuine hero image.
 */
const NOISE_PATTERNS =
  /\b(pixel|tracker|tracking|beacon|spacer|blank|1x1|transparent|placeholder|avatar|gravatar|icon|favicon|sprite|badge)\b/i;

const LOGO_HINT_PATTERNS = /\b(logo|logotype|wordmark|brandmark|brand\s*mark|mark)\b/i;

/**
 * Attempt to fetch the raw HTML of a URL.  Returns null (rather than throwing)
 * on non-2xx responses, network errors, or timeouts so callers can handle
 * gracefully.
 */
async function fetchHtml(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'User-Agent':
          'Mozilla/5.0 (compatible; CulturalArcheologistBot/1.0; +https://github.com/cultural-archeologist)',
      },
      redirect: 'follow',
    });

    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('html')) return null;

    return await response.text();
  } catch {
    // AbortError (timeout), DNS failure, TLS error, etc.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Make a potentially relative URL absolute given the root origin of the page.
 */
function resolveUrl(raw: string | undefined | null, baseOrigin: string): string | null {
  if (!raw) return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Already absolute.
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  // Protocol-relative.
  if (trimmed.startsWith('//')) return `https:${trimmed}`;

  // Root-relative or relative path.
  return `${baseOrigin}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
}

/**
 * Score an image URL/element heuristically.  Higher = more likely to be a
 * meaningful hero image.
 */
function scoreCandidate(
  src: string,
  width: number | null,
  height: number | null,
): number {
  if (NOISE_PATTERNS.test(src)) return -1;

  const area = width !== null && height !== null ? width * height : 0;
  const sizeBonus = area > 0 ? Math.log(area) : 0;

  const heroBonus =
    /\b(hero|banner|cover|header|feature|og[_-]?image|social|preview)\b/i.test(src) ? 5 : 0;

  // Prefer common image formats.
  const formatBonus = /\.(jpe?g|png|webp|avif)(\?|$)/i.test(src) ? 2 : 0;

  return sizeBonus + heroBonus + formatBonus;
}

function scoreLogoCandidate(src: string, width: number | null, height: number | null): number {
  const lower = src.toLowerCase();
  const logoHint = LOGO_HINT_PATTERNS.test(lower) ? 8 : 0;
  const spritePenalty = /\b(sprite|badge|avatar|gravatar|pixel|tracking|tracker)\b/i.test(lower) ? -20 : 0;

  const area = width !== null && height !== null ? width * height : 0;
  const areaScore = area > 0 ? Math.min(12, Math.log(area)) : 2;
  const aspectRatio = width && height ? width / height : null;
  const ratioBonus = aspectRatio && aspectRatio >= 1.2 && aspectRatio <= 8 ? 4 : 0;

  return logoHint + areaScore + ratioBonus + spritePenalty;
}

function extractLogoFromHtml(html: string, baseOrigin: string): string | null {
  const $ = cheerioLoad(html);

  // Priority 1: explicit logo metadata
  const metadataCandidates = [
    $('meta[property="og:logo"]').first().attr('content'),
    $('meta[name="logo"]').first().attr('content'),
    $('meta[itemprop="logo"]').first().attr('content'),
  ];

  for (const candidate of metadataCandidates) {
    const resolved = resolveUrl(candidate, baseOrigin);
    if (resolved) return resolved;
  }

  // Priority 2: icon/link tags from site itself
  const linkCandidates = [
    'link[rel="apple-touch-icon"]',
    'link[rel="apple-touch-icon-precomposed"]',
    'link[rel="icon"]',
    'link[rel="shortcut icon"]',
    'link[rel="mask-icon"]',
  ];

  for (const selector of linkCandidates) {
    const href = $(selector).first().attr('href');
    const resolved = resolveUrl(href, baseOrigin);
    if (resolved) return resolved;
  }

  // Priority 3: best logo-like <img>
  let bestSrc: string | null = null;
  let bestScore = -Infinity;

  $('img').each((_i, el) => {
    const src = resolveUrl($(el).attr('src') ?? $(el).attr('data-src'), baseOrigin);
    if (!src) return;

    const context = `${src} ${$(el).attr('alt') || ''} ${$(el).attr('class') || ''}`;
    if (!LOGO_HINT_PATTERNS.test(context)) return;

    const widthAttr = parseInt($(el).attr('width') ?? '0', 10) || null;
    const heightAttr = parseInt($(el).attr('height') ?? '0', 10) || null;
    const score = scoreLogoCandidate(src, widthAttr, heightAttr);

    if (score > bestScore) {
      bestScore = score;
      bestSrc = src;
    }
  });

  if (bestSrc) return bestSrc;

  // Priority 4: common on-site logo/icon paths
  const commonLogoPaths = [
    '/logo.svg',
    '/logo.png',
    '/logo.webp',
    '/assets/logo.svg',
    '/assets/logo.png',
    '/images/logo.svg',
    '/images/logo.png',
    '/img/logo.svg',
    '/img/logo.png',
    '/brand/logo.svg',
    '/favicon.svg',
    '/favicon.png',
    '/favicon.ico',
    '/apple-touch-icon.png',
  ];

  return `${baseOrigin}${commonLogoPaths[0]}`;
}

/**
 * Extract hero image candidate from parsed HTML.
 * Returns the absolute URL of the best candidate, or null.
 */
function extractHeroFromHtml(html: string, baseOrigin: string): string | null {
  const $ = cheerioLoad(html);

  // ── Priority 1: Open Graph image ────────────────────────────────────────────
  const ogImage = $('meta[property="og:image"]').first().attr('content');
  if (ogImage) {
    const resolved = resolveUrl(ogImage, baseOrigin);
    if (resolved) return resolved;
  }

  // ── Priority 2: Twitter Card image ───────────────────────────────────────────
  const twitterImage =
    $('meta[name="twitter:image"]').first().attr('content') ??
    $('meta[name="twitter:image:src"]').first().attr('content');
  if (twitterImage) {
    const resolved = resolveUrl(twitterImage, baseOrigin);
    if (resolved) return resolved;
  }

  // ── Priority 3: Best <img> on the page ───────────────────────────────────────
  let bestSrc: string | null = null;
  let bestScore = -Infinity;

  $('img').each((_i, el) => {
    const src = resolveUrl($(el).attr('src') ?? $(el).attr('data-src'), baseOrigin);
    if (!src) return;

    const widthAttr = parseInt($(el).attr('width') ?? '0', 10) || null;
    const heightAttr = parseInt($(el).attr('height') ?? '0', 10) || null;

    // Skip obvious small assets.
    if (widthAttr !== null && widthAttr < MIN_DIMENSION) return;
    if (heightAttr !== null && heightAttr < MIN_DIMENSION) return;

    const score = scoreCandidate(src, widthAttr, heightAttr);
    if (score < 0) return; // noise

    if (score > bestScore) {
      bestScore = score;
      bestSrc = src;
    }
  });

  return bestSrc;
}

/**
 * Given a company website URL (or bare domain), return:
 *  - `logoUrl`      – Website-native logo/icon URL
 *  - `heroImageUrl` – Best hero/OG image found on the page, or null
 */
export async function extractBrandImages(domain: string): Promise<BrandImagesResult> {
  // ── Normalise to a usable URL ────────────────────────────────────────────────
  let siteUrl: URL;
  try {
    const withProtocol = /^https?:\/\//i.test(domain.trim())
      ? domain.trim()
      : `https://${domain.trim()}`;
    siteUrl = new URL(withProtocol);
  } catch {
    throw new Error(`Invalid domain: "${domain}"`);
  }

  if (siteUrl.protocol !== 'http:' && siteUrl.protocol !== 'https:') {
    throw new Error('Only http/https domains are supported.');
  }

  const baseOrigin = siteUrl.origin;

  // ── Hero image via scraping ──────────────────────────────────────────────────
  const html = await fetchHtml(siteUrl.toString());

  if (!html) {
    // Fall back to on-site favicon path when HTML cannot be scraped.
    return {
      logoUrl: `${baseOrigin}/favicon.ico`,
      heroImageUrl: null,
    };
  }

  const logoUrl = extractLogoFromHtml(html, baseOrigin) || `${baseOrigin}/favicon.ico`;
  const heroImageUrl = extractHeroFromHtml(html, baseOrigin);

  return { logoUrl, heroImageUrl };
}
