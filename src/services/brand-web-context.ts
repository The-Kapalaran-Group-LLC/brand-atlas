import { sanitizeApiBaseUrl } from './external-links';

export interface BrandWebsiteContextPage {
  url: string;
  title: string;
  summary: string;
}

export interface BrandWebsiteContext {
  brand: string;
  website: string;
  pages: BrandWebsiteContextPage[];
}

const getApiBaseUrl = (): string => {
  const configured =
    (((import.meta as any).env?.VITE_API_BASE_URL as string) || '').trim() ||
    (((import.meta as any).env?.VITE_IMAGE_PROXY_BASE_URL as string) || '').trim();
  if (configured) {
    const sanitized = sanitizeApiBaseUrl(configured);
    console.log('[brand-web-context] Resolved API base URL.', { configured, sanitized });
    return sanitized;
  }
  return '';
};

const normalizeHttpUrl = (rawValue: string): string | null => {
  const trimmed = (rawValue || '').trim();
  if (!trimmed) return null;

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
};

export const fetchBrandWebsiteContext = async (
  brand: string,
  websiteOrDomain: string
): Promise<BrandWebsiteContext | null> => {
  const normalizedTarget = normalizeHttpUrl(websiteOrDomain);
  if (!normalizedTarget) {
    return null;
  }

  const apiBase = getApiBaseUrl();
  const endpoint = `${apiBase}/api/brand-web-context?target=${encodeURIComponent(normalizedTarget)}&brand=${encodeURIComponent(brand)}`;

  try {
    const response = await fetch(endpoint);
    if (!response.ok) {
      console.warn('[brand-web-context] Failed request', {
        brand,
        target: normalizedTarget,
        status: response.status,
      });
      return null;
    }

    const parsed = await response.json();
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.pages)) {
      return null;
    }

    const pages = parsed.pages
      .filter((page: unknown) => {
        if (!page || typeof page !== 'object') return false;
        const entry = page as Record<string, unknown>;
        return (
          typeof entry.url === 'string' &&
          typeof entry.title === 'string' &&
          typeof entry.summary === 'string'
        );
      })
      .slice(0, 6) as BrandWebsiteContextPage[];

    if (pages.length === 0) {
      return null;
    }

    return {
      brand: String(parsed.brand || brand),
      website: String(parsed.website || normalizedTarget),
      pages,
    };
  } catch (error) {
    console.error('[brand-web-context] Unexpected fetch error', { brand, target: normalizedTarget, error });
    return null;
  }
};

export const buildBrandWebsiteContextPrompt = (contexts: BrandWebsiteContext[]): string => {
  if (!contexts || contexts.length === 0) {
    return '';
  }

  const lines: string[] = [
    'GROUNDING CONTEXT FROM OFFICIAL BRAND/CORPORATE WEBSITES:',
    'Use this grounding context before any broader inference. Prioritize these pages when summarizing mission, positioning, offerings, and channels.',
  ];

  contexts.forEach((context) => {
    lines.push(`- Brand: ${context.brand}`);
    lines.push(`  Website: ${context.website}`);
    context.pages.forEach((page) => {
      lines.push(`  Source: ${page.url}`);
      lines.push(`  Title: ${page.title}`);
      lines.push(`  Summary: ${page.summary}`);
    });
  });

  return lines.join('\n');
};
