import { load as cheerioLoad } from 'cheerio';

export interface BrandWebContextPage {
  url: string;
  title: string;
  summary: string;
}

export interface BrandWebContextResult {
  brand: string;
  website: string;
  pages: BrandWebContextPage[];
}

const FETCH_TIMEOUT_MS = 10_000;
const MAX_SUMMARY_LENGTH = 700;
const MAX_CORPORATE_LINKS = 3;

const CORPORATE_HINT_PATTERN =
  /about|company|corporate|investor|leadership|purpose|our-story|press|newsroom|sustainability|responsibility/i;

function normalizeTargetUrl(target: string): URL {
  const trimmed = (target || '').trim();
  if (!trimmed) {
    throw new Error('Target is required.');
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(withProtocol);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http/https URLs are supported.');
  }
  return parsed;
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
        'User-Agent': 'BrandNavigatorWebContextBot/1.0',
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
  } finally {
    clearTimeout(timeout);
  }
}

function compactText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function summarizePage(html: string): { title: string; summary: string } {
  const $ = cheerioLoad(html);

  const title = compactText($('title').first().text() || $('meta[property="og:title"]').first().attr('content') || 'Untitled');
  const description = compactText(
    $('meta[name="description"]').first().attr('content') ||
      $('meta[property="og:description"]').first().attr('content') ||
      ''
  );

  const h1 = compactText($('h1').first().text() || '');
  const h2 = compactText($('h2').first().text() || '');
  const paragraph = compactText($('p').first().text() || '');

  const summaryParts = [description, h1, h2, paragraph].filter(Boolean);
  const summary = summaryParts.join(' ').slice(0, MAX_SUMMARY_LENGTH) || 'No extractable summary from this page.';

  return { title, summary };
}

function getCorporateLinks(html: string, baseUrl: URL): URL[] {
  const $ = cheerioLoad(html);
  const links: URL[] = [];
  const seen = new Set<string>();

  $('a[href]').each((_: number, el: any) => {
    const href = ($(el).attr('href') || '').trim();
    const anchorText = compactText($(el).text() || '');
    if (!href) return;

    const hint = `${href} ${anchorText}`;
    if (!CORPORATE_HINT_PATTERN.test(hint)) return;

    let resolved: URL;
    try {
      resolved = new URL(href, baseUrl);
    } catch {
      return;
    }

    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return;
    if (!(resolved.hostname === baseUrl.hostname || resolved.hostname.endsWith(`.${baseUrl.hostname}`))) return;

    const dedupeKey = resolved.toString().replace(/#.*$/, '');
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    links.push(new URL(dedupeKey));
  });

  return links.slice(0, MAX_CORPORATE_LINKS);
}

export async function extractBrandWebContext(target: string, brand?: string): Promise<BrandWebContextResult> {
  const baseUrl = normalizeTargetUrl(target);
  const homeHtml = await fetchHtml(baseUrl);
  const pages: BrandWebContextPage[] = [];

  const homeSummary = summarizePage(homeHtml);
  pages.push({
    url: baseUrl.toString(),
    title: homeSummary.title,
    summary: homeSummary.summary,
  });

  const corporateLinks = getCorporateLinks(homeHtml, baseUrl);
  const corporatePages = await Promise.all(
    corporateLinks.map(async (link) => {
      try {
        const html = await fetchHtml(link);
        const details = summarizePage(html);
        return {
          url: link.toString(),
          title: details.title,
          summary: details.summary,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          url: link.toString(),
          title: 'Unavailable',
          summary: `Failed to fetch this page: ${message}`,
        };
      }
    })
  );

  pages.push(...corporatePages);

  return {
    brand: (brand || baseUrl.hostname).trim(),
    website: baseUrl.toString(),
    pages,
  };
}
