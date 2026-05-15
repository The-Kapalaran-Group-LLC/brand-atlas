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
