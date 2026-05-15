import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
// Removed nodemailer and googleapis (no email/Google Sheets)
import dotenv from 'dotenv';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  fetchAudienceContext,
  fetchAudienceContextPreviousMethodology,
  fetchCommunityContextBarbellMethodology,
  fetchCommunityContextPreviousMethodology,
  fetchAudienceContextWithGptSearch,
} from '../lib/grounding.js';
import { fetchSubredditQuotes } from '../lib/fetchSubredditQuotes.js';
import { processImageForUI, type ProcessedImageResult } from './image-processing';
import {
  analyzeBrandDesignFromScreenshot,
  extractLegacyBrandAssets,
  extractBrandImages,
  type BrandImagesResult,
  type BrandVisionAnalysis,
} from './brand-images';
import {
  extractColorPalette,
  extractTypography,
  pickTopLogoCandidates,
  type RawLogoCandidate,
} from './extract-assets';
import { extractBrandWebContext, type BrandWebContextResult } from './brand-web-context';
import {
  buildLanguageMethodologySnapshotDigest,
  fetchLanguageMethodologyComparison,
} from '../lib/language-methodology.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load local env for backend runtime (Vite does not inject these into Node process.env).
dotenv.config({ path: path.resolve(__dirname, '../.env.local'), quiet: true });
dotenv.config({ quiet: true });

const app = express();
const parsedPort = Number(process.env.PORT || 3001);
const PORT = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 3001;
const publicDir = path.resolve(__dirname, '../public');

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.get('/design-excavator-comparison', (_req, res) => {
  res.sendFile(path.join(publicDir, 'design-excavator-comparison.html'));
});
app.get('/design-excavator-comparison.html', (_req, res) => {
  res.sendFile(path.join(publicDir, 'design-excavator-comparison.html'));
});

const countDigestLines = (value: string): number => value
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean).length;

const buildComparisonFallbackDigest = (
  methodology: 'previous' | 'current',
  reason: unknown
): string => {
  const reasonText = String((reason as any)?.message || reason || '').trim();
  const label = methodology === 'previous' ? 'Previous methodology' : 'Current methodology';
  const generic = `${label} evidence is temporarily unavailable.`;
  if (!reasonText) return generic;

  // Never leak provider-specific failures in UI payloads.
  const blockedPatterns = [
    'google custom search',
    'bing web search',
    'custom search json api',
    'ocp-apim-subscription-key',
  ];
  const normalized = reasonText.toLowerCase();
  if (blockedPatterns.some((pattern) => normalized.includes(pattern))) {
    return generic;
  }

  return `${generic} Details: ${reasonText}`;
};

const buildBehaviorMethodologySnapshotDigest = (
  methodology: 'previous' | 'current',
  audience: string
): string => {
  if (methodology === 'previous') {
    return `Previous Methodology (single-lane baseline) for "${audience}":
1) Short-form video trends heavily influence what this audience tries and buys.
2) Peer-led recommendation loops shape trial behavior and repeat usage.
3) Value sensitivity drives switching and delayed purchasing.
4) Creator trust strongly affects habit formation around products and routines.
5) Identity expression is encoded through visible lifestyle choices and social signaling.
6) Mental wellness framing appears across routine decisions.
7) Community rituals emerge in niche creator ecosystems.`;
  }

  return `Behavioral routines (up-to-date, stabilized):
1) Weekly budget check-ins and app-based spend tracking are becoming routine among this audience.
2) "Refill and rebuy" rituals increasingly follow creator guide content over one-off ads.
3) Habit-stacking behavior (productivity + wellness + finance micro-routines) is becoming normalized.
4) Purchase rituals are often "research-first": quick guide videos, peer comments, then delayed checkout.
5) Recurring value-audit rituals (compare, dupe-check, waitlist) shape baskets and brand choice.

Behavioral macro context (habit persistence + guides):
1) Cost pressure reinforces repeatable low-risk routines over spontaneous trend buying.
2) Social proof has shifted from hype spikes to practical guide formats and lived-use evidence.
3) Platform-native tutorials are becoming durable behavior infrastructure, not just trend content.
4) Community belonging is reinforced by shared routines (reset days, study blocks, no-spend challenges).
5) Recent viral challenges still appear, but sustained rituals remain the stronger predictor of repeat behavior.`;
};

const shouldUseBehaviorSnapshotFallback = (digest: string): boolean => {
  const normalized = (digest || '').toLowerCase();
  return (
    normalized.includes('temporarily unavailable') ||
    normalized.startsWith('no web results returned for:')
  );
};

const buildCommunityMethodologySnapshotDigest = (
  methodology: 'previous' | 'current',
  audience: string
): string => {
  if (methodology === 'previous') {
    return `Previous Community Methodology (single-lane baseline) for "${audience}":
1) Large subreddits and long-standing forums still anchor broad identity narratives.
2) Legacy creator ecosystems continue to function as social proof engines.
3) Public mainstream channels dominate visibility but flatten niche nuance.
4) Community trust tends to cluster around durable hubs with stable posting cadence.
5) Identity signaling is often shaped by familiar platform-native communities.
6) Discovery of new micro-communities is inconsistent under the baseline method.`;
  }

  return `Community Barbell Methodology (foundational + breakout) for "${audience}":
Foundational hubs (long-standing):
1) High-tenure Reddit communities and legacy creator collectives remain core identity anchors.
2) Established forum-style groups still set norms, language, and recurring rituals.
3) Durable public hubs function as orientation points before users branch into niche spaces.

Breakout micro-communities (last 30 days):
1) Fast-growing Discord circles and invite-only channels are rising around specific micro-identities.
2) Niche Substack communities and independent creator comment ecosystems are accelerating.
3) Emerging Reddit threads and smaller creator-led pods are acting as breakout trust nodes.

Location fallback rule:
If exact micro-community names are uncertain, identify platform location first (Reddit, Discord, Substack).`;
};

const shouldUseCommunitySnapshotFallback = (digest: string): boolean => {
  const normalized = (digest || '').toLowerCase();
  return (
    normalized.includes('temporarily unavailable') ||
    normalized.startsWith('no web results returned for:')
  );
};

const buildInfluencerMethodologySnapshotDigest = (
  methodology: 'previous' | 'current',
  audience: string
): string => {
  if (methodology === 'previous') {
    return `Previous Influencer Methodology (single-lane baseline) for "${audience}":
1) Influence mapping emphasizes highly visible creator names and broad follower counts.
2) Legacy authority voices are included, but without explicit balancing against rising creators.
3) Fast-moving breakout creators are intermittently captured and often underweighted.
4) Conversion context is generalized rather than niche-fit specific.
5) Audience penetration is inferred from visibility but not scored with a framework.
6) Naming confidence issues are not always surfaced explicitly in outputs.`;
  }

  return `Influencer Barbell Methodology (legacy + high-velocity) for "${audience}":
Established legacy authorities (long-standing):
1) Include 3-4 durable category voices with sustained cross-platform authority.
2) Prioritize proven educators/analysts with multi-year audience trust and repeat conversion impact.
3) Validate penetration with broad discoverability and recurring citation in category conversations.

Breakout micro-creators (high-velocity now):
1) Include 3-4 rapidly rising niche creators with strong 30-day momentum.
2) Prioritize creators whose audience overlap is tightly aligned to ${audience} subculture interests.
3) Surface high-signal breakout creators even if their total follower base is still comparatively small.

Framework scoring requirement:
1) Resonance = growth speed.
2) Conversion = niche fit.
3) Penetration = visibility.

Social Blade integration rule:
If Social Blade is integrated, run both "Top Followers" and "Highest 30-Day Growth" queries.

Hallucination-risk safeguard:
If the system is struggling to identify or assign a current breakout name, explicitly say so and avoid inventing names.`;
};

const shouldUseInfluencerSnapshotFallback = (digest: string): boolean => {
  const normalized = (digest || '').toLowerCase();
  return (
    normalized.includes('temporarily unavailable') ||
    normalized.startsWith('no web results returned for:')
  );
};

const escapeHtml = (value: string): string => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

async function renderMethodologyComparisonHtml(audience = 'Gen Z'): Promise<string> {
  const templatePath = path.join(publicDir, '__test__cultural-archaeologist-methodology-comparison.html');
  const template = await readFile(templatePath, 'utf8');
  const normalizedAudience = audience.trim() || 'Gen Z';

  const [previousResult, currentResult] = await Promise.allSettled([
    fetchAudienceContextWithGptSearch(normalizedAudience, 'previous'),
    fetchAudienceContextWithGptSearch(normalizedAudience, 'current'),
  ]);

  const previousDigest = previousResult.status === 'fulfilled'
    ? previousResult.value
    : buildComparisonFallbackDigest('previous', previousResult.reason);
  const currentDigest = currentResult.status === 'fulfilled'
    ? currentResult.value
    : buildComparisonFallbackDigest('current', currentResult.reason);

  const previousLines = countDigestLines(previousDigest);
  const currentLines = countDigestLines(currentDigest);
  const hasBreaking = (currentDigest.includes('Breaking (last 7 days):') || currentDigest.includes('Breaking (last 24h):')) ? 'Yes' : 'No';
  const hasStructural = currentDigest.includes('Structural (annual + macro):') ? 'Yes' : 'No';
  const initialStatus = `Preloaded comparison for "${normalizedAudience}".`;

  return template
    .replace('__INITIAL_STATUS__', escapeHtml(initialStatus))
    .replace('__INITIAL_PREVIOUS_LINES__', String(previousLines))
    .replace('__INITIAL_CURRENT_LINES__', String(currentLines))
    .replace('__INITIAL_HAS_BREAKING__', hasBreaking)
    .replace('__INITIAL_HAS_STRUCTURAL__', hasStructural)
    .replace('__INITIAL_PREVIOUS_DIGEST__', escapeHtml(previousDigest))
    .replace('__INITIAL_CURRENT_DIGEST__', escapeHtml(currentDigest));
}

async function renderBehaviorMethodologyComparisonHtml(audience = 'Gen Z'): Promise<string> {
  const templatePath = path.join(publicDir, '__test__cultural-archaeologist-behaviors-methodology-comparison.html');
  const template = await readFile(templatePath, 'utf8');
  const normalizedAudience = audience.trim() || 'Gen Z';

  const [previousResult, currentResult] = await Promise.allSettled([
    fetchAudienceContextPreviousMethodology(normalizedAudience),
    fetchAudienceContext(normalizedAudience, { behaviorFocus: true }),
  ]);

  const previousDigest = previousResult.status === 'fulfilled'
    ? previousResult.value
    : buildComparisonFallbackDigest('previous', previousResult.reason);
  const currentDigest = currentResult.status === 'fulfilled'
    ? currentResult.value
    : buildComparisonFallbackDigest('current', currentResult.reason);
  const safePreviousDigest = shouldUseBehaviorSnapshotFallback(previousDigest)
    ? buildBehaviorMethodologySnapshotDigest('previous', normalizedAudience)
    : previousDigest;
  const safeCurrentDigest = shouldUseBehaviorSnapshotFallback(currentDigest)
    ? buildBehaviorMethodologySnapshotDigest('current', normalizedAudience)
    : currentDigest;

  const previousLines = countDigestLines(safePreviousDigest);
  const currentLines = countDigestLines(safeCurrentDigest);
  const hasBehavioralRoutines = safeCurrentDigest.includes('Behavioral routines (up-to-date, stabilized):') ? 'Yes' : 'No';
  const hasBehavioralMacroContext = safeCurrentDigest.includes('Behavioral macro context (habit persistence + guides):') ? 'Yes' : 'No';
  const initialStatus = `Preloaded behavior-methodology comparison for "${normalizedAudience}".`;

  return template
    .replace('__INITIAL_STATUS__', escapeHtml(initialStatus))
    .replace('__INITIAL_PREVIOUS_LINES__', String(previousLines))
    .replace('__INITIAL_CURRENT_LINES__', String(currentLines))
    .replace('__INITIAL_HAS_BEHAVIORAL_ROUTINES__', hasBehavioralRoutines)
    .replace('__INITIAL_HAS_BEHAVIORAL_MACRO__', hasBehavioralMacroContext)
    .replace('__INITIAL_PREVIOUS_DIGEST__', escapeHtml(safePreviousDigest))
    .replace('__INITIAL_CURRENT_DIGEST__', escapeHtml(safeCurrentDigest));
}

async function renderLanguageMethodologyComparisonHtml(audience = 'Gen Z'): Promise<string> {
  const templatePath = path.join(publicDir, '__test__cultural-archaeologist-language-methodology-comparison.html');
  const template = await readFile(templatePath, 'utf8');
  const normalizedAudience = audience.trim() || 'Gen Z';

  const comparison = await fetchLanguageMethodologyComparison(normalizedAudience)
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unknown language methodology error';
      console.error('[language-methodology-compare] Failed to generate live comparison; using snapshots.', { message });
      return {
        audience: normalizedAudience,
        previousDigest: buildLanguageMethodologySnapshotDigest('previous', normalizedAudience),
        currentDigest: buildLanguageMethodologySnapshotDigest('current', normalizedAudience),
      };
    });

  const previousDigest = comparison.previousDigest || buildLanguageMethodologySnapshotDigest('previous', normalizedAudience);
  const currentDigest = comparison.currentDigest || buildLanguageMethodologySnapshotDigest('current', normalizedAudience);

  const previousLines = countDigestLines(previousDigest);
  const currentLines = countDigestLines(currentDigest);
  const hasMostRecentOnly = currentDigest.toLowerCase().includes('most recent');
  const hasUrbanValidation = currentDigest.toLowerCase().includes('urban');
  const hasCorporateRejection = currentDigest.toLowerCase().includes('corporate');
  const initialStatus = `Preloaded language-methodology comparison for "${normalizedAudience}".`;

  return template
    .replace('__INITIAL_STATUS__', escapeHtml(initialStatus))
    .replace('__INITIAL_PREVIOUS_LINES__', String(previousLines))
    .replace('__INITIAL_CURRENT_LINES__', String(currentLines))
    .replace('__INITIAL_HAS_MOST_RECENT__', hasMostRecentOnly ? 'Yes' : 'No')
    .replace('__INITIAL_HAS_URBAN_VALIDATION__', hasUrbanValidation ? 'Yes' : 'No')
    .replace('__INITIAL_HAS_CORPORATE_REJECTION__', hasCorporateRejection ? 'Yes' : 'No')
    .replace('__INITIAL_PREVIOUS_DIGEST__', escapeHtml(previousDigest))
    .replace('__INITIAL_CURRENT_DIGEST__', escapeHtml(currentDigest));
}

async function renderCommunityMethodologyComparisonHtml(audience = 'Gen Z'): Promise<string> {
  const templatePath = path.join(publicDir, '__test__cultural-archaeologist-community-methodology-comparison.html');
  const template = await readFile(templatePath, 'utf8');
  const normalizedAudience = audience.trim() || 'Gen Z';

  const [previousResult, currentResult] = await Promise.allSettled([
    fetchCommunityContextPreviousMethodology(normalizedAudience),
    fetchCommunityContextBarbellMethodology(normalizedAudience),
  ]);

  const previousDigest = previousResult.status === 'fulfilled'
    ? previousResult.value
    : buildComparisonFallbackDigest('previous', previousResult.reason);
  const currentDigest = currentResult.status === 'fulfilled'
    ? currentResult.value
    : buildComparisonFallbackDigest('current', currentResult.reason);
  const safePreviousDigest = shouldUseCommunitySnapshotFallback(previousDigest)
    ? buildCommunityMethodologySnapshotDigest('previous', normalizedAudience)
    : previousDigest;
  const safeCurrentDigest = shouldUseCommunitySnapshotFallback(currentDigest)
    ? buildCommunityMethodologySnapshotDigest('current', normalizedAudience)
    : currentDigest;

  const previousLines = countDigestLines(safePreviousDigest);
  const currentLines = countDigestLines(safeCurrentDigest);
  const hasFoundational = safeCurrentDigest.toLowerCase().includes('foundational hubs');
  const hasBreakout = safeCurrentDigest.toLowerCase().includes('breakout micro-communities');
  const hasLocationFallback = safeCurrentDigest.toLowerCase().includes('location fallback');
  const initialStatus = `Preloaded community-methodology comparison for "${normalizedAudience}".`;

  return template
    .replace('__INITIAL_STATUS__', escapeHtml(initialStatus))
    .replace('__INITIAL_PREVIOUS_LINES__', String(previousLines))
    .replace('__INITIAL_CURRENT_LINES__', String(currentLines))
    .replace('__INITIAL_HAS_FOUNDATIONAL__', hasFoundational ? 'Yes' : 'No')
    .replace('__INITIAL_HAS_BREAKOUT__', hasBreakout ? 'Yes' : 'No')
    .replace('__INITIAL_HAS_LOCATION_FALLBACK__', hasLocationFallback ? 'Yes' : 'No')
    .replace('__INITIAL_PREVIOUS_DIGEST__', escapeHtml(safePreviousDigest))
    .replace('__INITIAL_CURRENT_DIGEST__', escapeHtml(safeCurrentDigest));
}

async function renderInfluencerMethodologyComparisonHtml(audience = 'Gen Z'): Promise<string> {
  const templatePath = path.join(publicDir, '__test__cultural-archaeologist-influencers-methodology-comparison.html');
  const template = await readFile(templatePath, 'utf8');
  const normalizedAudience = audience.trim() || 'Gen Z';

  const [previousResult, currentResult] = await Promise.allSettled([
    fetchAudienceContextPreviousMethodology(normalizedAudience),
    fetchAudienceContext(normalizedAudience),
  ]);

  const previousDigest = previousResult.status === 'fulfilled'
    ? previousResult.value
    : buildComparisonFallbackDigest('previous', previousResult.reason);
  const currentDigest = currentResult.status === 'fulfilled'
    ? currentResult.value
    : buildComparisonFallbackDigest('current', currentResult.reason);
  const safePreviousDigest = shouldUseInfluencerSnapshotFallback(previousDigest)
    ? buildInfluencerMethodologySnapshotDigest('previous', normalizedAudience)
    : previousDigest;
  const safeCurrentDigest = shouldUseInfluencerSnapshotFallback(currentDigest)
    ? buildInfluencerMethodologySnapshotDigest('current', normalizedAudience)
    : currentDigest;

  const previousLines = countDigestLines(safePreviousDigest);
  const currentLines = countDigestLines(safeCurrentDigest);
  const hasBarbell = /barbell|legacy.*micro-creators|micro-creators.*legacy/i.test(safeCurrentDigest);
  const hasSocialBlade = /social blade|top followers|highest 30-day growth/i.test(safeCurrentDigest);
  const hasHallucinationRule = /struggling to identify|avoid inventing names|hallucination/i.test(safeCurrentDigest);
  const initialStatus = `Preloaded influencer-methodology comparison for "${normalizedAudience}".`;

  return template
    .replace('__INITIAL_STATUS__', escapeHtml(initialStatus))
    .replace('__INITIAL_PREVIOUS_LINES__', String(previousLines))
    .replace('__INITIAL_CURRENT_LINES__', String(currentLines))
    .replace('__INITIAL_HAS_BARBELL__', hasBarbell ? 'Yes' : 'No')
    .replace('__INITIAL_HAS_SOCIAL_BLADE__', hasSocialBlade ? 'Yes' : 'No')
    .replace('__INITIAL_HAS_HALLUCINATION_RULE__', hasHallucinationRule ? 'Yes' : 'No')
    .replace('__INITIAL_PREVIOUS_DIGEST__', escapeHtml(safePreviousDigest))
    .replace('__INITIAL_CURRENT_DIGEST__', escapeHtml(safeCurrentDigest));
}

app.get('/__test/cultural-archaeologist-methodology-comparison', async (_req, res) => {
  try {
    const html = await renderMethodologyComparisonHtml('Gen Z');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.send(html);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown render error';
    console.error('[methodology-compare] Failed to render preloaded comparison page.', { message });
    res.sendFile(path.join(publicDir, '__test__cultural-archaeologist-methodology-comparison.html'));
  }
});
app.get('/__test/cultural-archaeologist-methodology-comparison.html', async (_req, res) => {
  try {
    const html = await renderMethodologyComparisonHtml('Gen Z');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.send(html);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown render error';
    console.error('[methodology-compare] Failed to render preloaded comparison page.', { message });
    res.sendFile(path.join(publicDir, '__test__cultural-archaeologist-methodology-comparison.html'));
  }
});
app.get('/__test/cultural-archaeologist-behaviors-methodology-comparison', async (_req, res) => {
  try {
    const html = await renderBehaviorMethodologyComparisonHtml('Gen Z');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.send(html);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown render error';
    console.error('[behavior-methodology-compare] Failed to render preloaded comparison page.', { message });
    res.sendFile(path.join(publicDir, '__test__cultural-archaeologist-behaviors-methodology-comparison-static.html'));
  }
});
app.get('/__test/cultural-archaeologist-behaviors-methodology-comparison.html', async (_req, res) => {
  try {
    const html = await renderBehaviorMethodologyComparisonHtml('Gen Z');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.send(html);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown render error';
    console.error('[behavior-methodology-compare] Failed to render preloaded comparison page.', { message });
    res.sendFile(path.join(publicDir, '__test__cultural-archaeologist-behaviors-methodology-comparison-static.html'));
  }
});
app.get('/__test/cultural-archaeologist-language-methodology-comparison', async (_req, res) => {
  try {
    const html = await renderLanguageMethodologyComparisonHtml('Gen Z');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.send(html);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown render error';
    console.error('[language-methodology-compare] Failed to render preloaded comparison page.', { message });
    res.sendFile(path.join(publicDir, '__test__cultural-archaeologist-language-methodology-comparison.html'));
  }
});
app.get('/__test/cultural-archaeologist-language-methodology-comparison.html', async (_req, res) => {
  try {
    const html = await renderLanguageMethodologyComparisonHtml('Gen Z');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.send(html);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown render error';
    console.error('[language-methodology-compare] Failed to render preloaded comparison page.', { message });
    res.sendFile(path.join(publicDir, '__test__cultural-archaeologist-language-methodology-comparison.html'));
  }
});
app.get('/__test/cultural-archaeologist-community-methodology-comparison', async (_req, res) => {
  try {
    const html = await renderCommunityMethodologyComparisonHtml('Gen Z');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.send(html);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown render error';
    console.error('[community-methodology-compare] Failed to render preloaded comparison page.', { message });
    res.sendFile(path.join(publicDir, '__test__cultural-archaeologist-community-methodology-comparison-static.html'));
  }
});
app.get('/__test/cultural-archaeologist-community-methodology-comparison.html', async (_req, res) => {
  try {
    const html = await renderCommunityMethodologyComparisonHtml('Gen Z');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.send(html);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown render error';
    console.error('[community-methodology-compare] Failed to render preloaded comparison page.', { message });
    res.sendFile(path.join(publicDir, '__test__cultural-archaeologist-community-methodology-comparison-static.html'));
  }
});
app.get('/__test/cultural-archaeologist-influencers-methodology-comparison', async (_req, res) => {
  try {
    const html = await renderInfluencerMethodologyComparisonHtml('Gen Z');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.send(html);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown render error';
    console.error('[influencer-methodology-compare] Failed to render preloaded comparison page.', { message });
    res.sendFile(path.join(publicDir, '__test__cultural-archaeologist-influencers-methodology-comparison-static.html'));
  }
});
app.get('/__test/cultural-archaeologist-influencers-methodology-comparison.html', async (_req, res) => {
  try {
    const html = await renderInfluencerMethodologyComparisonHtml('Gen Z');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.send(html);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown render error';
    console.error('[influencer-methodology-compare] Failed to render preloaded comparison page.', { message });
    res.sendFile(path.join(publicDir, '__test__cultural-archaeologist-influencers-methodology-comparison-static.html'));
  }
});
app.get('/__test/cultural-archaeologist-components-methodology', (_req, res) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.sendFile(path.join(publicDir, '__test__cultural-archaeologist-components-methodology.html'));
});
app.get('/__test/cultural-archaeologist-components-methodology.html', (_req, res) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.sendFile(path.join(publicDir, '__test__cultural-archaeologist-components-methodology.html'));
});
app.get('/cultural-archaeologist-components-methodology', (_req, res) => {
  res.sendFile(path.join(publicDir, 'cultural-archaeologist-components-methodology.html'));
});
app.get('/cultural-archaeologist-components-methodology.html', (_req, res) => {
  res.sendFile(path.join(publicDir, 'cultural-archaeologist-components-methodology.html'));
});
app.get('/__test/cultural-archaeologist-contradictions-methodology-comparison', (_req, res) => {
  console.log('[contradictions-methodology-compare] Serving preloaded static comparison page for Gen Z.');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.sendFile(path.join(publicDir, '__test__cultural-archaeologist-contradictions-methodology-comparison-static.html'));
});
app.get('/__test/cultural-archaeologist-contradictions-methodology-comparison.html', (_req, res) => {
  console.log('[contradictions-methodology-compare] Serving preloaded static comparison page for Gen Z (.html route).');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.sendFile(path.join(publicDir, '__test__cultural-archaeologist-contradictions-methodology-comparison-static.html'));
});
app.use(express.static(publicDir));

const IMAGE_CACHE_TTL_MS = 15 * 60 * 1000;
const IMAGE_CACHE_MAX_ITEMS = 300;

type CachedImage = {
  body: Buffer;
  contentType: string;
  etag: string;
  expiresAt: number;
};

const imageCache = new Map<string, CachedImage>();

const MAX_FEEDBACK_NAME_LENGTH = 120;
const MAX_FEEDBACK_EMAIL_LENGTH = 254;
const MAX_FEEDBACK_MESSAGE_LENGTH = 4000;

// Removed all email/Google Sheets env and helpers

const isValidEmail = (value: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
};

// Removed all Google Sheets and email logic for feedback

const isDisallowedHost = (hostname: string): boolean => {
  const host = hostname.toLowerCase();
  if (!host) return true;
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) return true;
  return false;
};

const getPlaywrightChromium = async () => {
  const moduleName = 'playwright';
  const playwright = await import(moduleName);
  return playwright.chromium as {
    launch: (options?: Record<string, unknown>) => Promise<{
      newPage: (options?: Record<string, unknown>) => Promise<{
        goto: (url: string, options?: Record<string, unknown>) => Promise<unknown>;
        evaluate: <T>(fn: () => T) => Promise<T>;
        close: () => Promise<void>;
      }>;
      close: () => Promise<void>;
    }>;
  };
};

const cleanupImageCache = () => {
  const now = Date.now();
  for (const [key, cached] of imageCache.entries()) {
    if (cached.expiresAt <= now) {
      imageCache.delete(key);
    }
  }

  while (imageCache.size > IMAGE_CACHE_MAX_ITEMS) {
    const oldestKey = imageCache.keys().next().value;
    if (!oldestKey) break;
    imageCache.delete(oldestKey);
  }
};

const respondWithCachedImage = (res: express.Response, cached: CachedImage, ifNoneMatch?: string) => {
  if (ifNoneMatch && ifNoneMatch === cached.etag) {
    res.status(304).end();
    return;
  }

  res.setHeader('Content-Type', cached.contentType);
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=900');
  res.setHeader('ETag', cached.etag);
  res.send(cached.body);
};


// 1. Initialize Supabase
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Missing Supabase environment variables!");
}
const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');



app.get('/api/image-proxy', async (req, res) => {
  const rawUrl = Array.isArray(req.query.url) ? req.query.url[0] : req.query.url;

  if (!rawUrl || typeof rawUrl !== 'string') {
    return res.status(400).json({ error: 'Missing url query parameter.' });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return res.status(400).json({ error: 'Invalid url parameter.' });
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return res.status(400).json({ error: 'Only http/https image URLs are allowed.' });
  }

  if (isDisallowedHost(parsedUrl.hostname)) {
    return res.status(403).json({ error: 'Host is not allowed.' });
  }

  cleanupImageCache();

  const cacheKey = parsedUrl.toString();
  const cached = imageCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return respondWithCachedImage(res, cached, req.header('if-none-match'));
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(cacheKey, {
      signal: controller.signal,
      headers: {
        Accept: 'image/*,*/*;q=0.8',
        'User-Agent': 'BrandArchaeologistImageProxy/1.0',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Upstream returned ${response.status}.` });
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await response.arrayBuffer();
    const body = Buffer.from(arrayBuffer);

    const cacheEntry: CachedImage = {
      body,
      contentType,
      etag: `"${Buffer.from(`${cacheKey}:${body.length}:${contentType}`).toString('base64').slice(0, 27)}"`,
      expiresAt: Date.now() + IMAGE_CACHE_TTL_MS,
    };

    imageCache.set(cacheKey, cacheEntry);
    cleanupImageCache();

    return respondWithCachedImage(res, cacheEntry, req.header('if-none-match'));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown proxy error';
    return res.status(502).json({ error: `Failed to fetch image: ${message}` });
  } finally {
    clearTimeout(timeout);
  }
});

// ── Processed-image cache (LQIP + dominant color) ───────────────────────────
const PROCESSED_IMAGE_CACHE_TTL_MS = 30 * 60 * 1_000; // 30 min
const processedImageCache = new Map<string, { result: ProcessedImageResult; expiresAt: number }>();

app.get('/api/process-image', async (req, res) => {
  const rawUrl = Array.isArray(req.query.url) ? req.query.url[0] : req.query.url;

  if (!rawUrl || typeof rawUrl !== 'string') {
    return res.status(400).json({ error: 'Missing url query parameter.' });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return res.status(400).json({ error: 'Invalid url parameter.' });
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return res.status(400).json({ error: 'Only http/https image URLs are allowed.' });
  }

  if (isDisallowedHost(parsedUrl.hostname)) {
    return res.status(403).json({ error: 'Host is not allowed.' });
  }

  const cacheKey = parsedUrl.toString();
  const cached = processedImageCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return res.json(cached.result);
  }

  try {
    const result = await processImageForUI(cacheKey);
    processedImageCache.set(cacheKey, { result, expiresAt: Date.now() + PROCESSED_IMAGE_CACHE_TTL_MS });
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(502).json({ error: `Failed to process image: ${message}` });
  }
});

app.get('/api/extract-assets', async (req, res) => {
  const rawUrl = Array.isArray(req.query.url) ? req.query.url[0] : req.query.url;
  if (!rawUrl || typeof rawUrl !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Missing url query parameter. Try /api/extract-assets?url=https://example.com',
    });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl.trim());
  } catch {
    return res.status(400).json({
      success: false,
      error: 'Invalid URL. Use a full http/https URL such as https://example.com',
    });
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return res.status(400).json({
      success: false,
      error: 'Only http/https URLs are supported.',
    });
  }

  if (isDisallowedHost(parsedUrl.hostname)) {
    return res.status(403).json({
      success: false,
      error: 'That host is not allowed. Please use a public website URL.',
    });
  }

  console.log('[extract-assets] Starting Playwright extraction.', {
    url: parsedUrl.toString(),
    hostname: parsedUrl.hostname,
  });

  let browser: Awaited<ReturnType<Awaited<ReturnType<typeof getPlaywrightChromium>>['launch']>> | null = null;
  let page: Awaited<ReturnType<NonNullable<typeof browser>['newPage']>> | null = null;

  try {
    const chromium = await getPlaywrightChromium();
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();

    await page.goto(parsedUrl.toString(), {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    const extractionScript = `(() => {
      const candidates = [];
      const baseUrl = document.baseURI || window.location.href;

      const addCandidate = (value, source, width = 0, height = 0) => {
        const raw = (value || '').trim();
        if (!raw) return;

        try {
          if (raw.startsWith('data:image/')) {
            candidates.push({ url: raw, source, width, height });
            return;
          }

          const resolved = new URL(raw, baseUrl);
          if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return;
          candidates.push({ url: resolved.toString(), source, width, height });
        } catch {}
      };

      const ogImage = document.querySelector('meta[property="og:image"]');
      addCandidate(ogImage && ogImage.content, 'og:image');

      const iconLinks = document.querySelectorAll('link[rel*="icon" i], link[rel="apple-touch-icon" i]');
      iconLinks.forEach((linkEl) => {
        const rel = String(linkEl.getAttribute('rel') || '').toLowerCase();
        const source = rel.includes('apple-touch-icon') ? 'apple-touch-icon' : 'icon';
        const sizesAttr = String(linkEl.getAttribute('sizes') || '').toLowerCase();
        let width = 0;
        let height = 0;
        if (sizesAttr.includes('x')) {
          const parts = sizesAttr.split('x');
          width = Number(parts[0]) || 0;
          height = Number(parts[1]) || 0;
        }
        addCandidate(linkEl.href || linkEl.getAttribute('href'), source, width, height);
      });

      document.querySelectorAll('header img').forEach((img) => {
        addCandidate(img.currentSrc || img.src || img.getAttribute('src'), 'header-img', img.naturalWidth || img.width || 0, img.naturalHeight || img.height || 0);
      });
      document.querySelectorAll('nav img').forEach((img) => {
        addCandidate(img.currentSrc || img.src || img.getAttribute('src'), 'nav-img', img.naturalWidth || img.width || 0, img.naturalHeight || img.height || 0);
      });
      document.querySelectorAll('[class*="logo" i] img, [id*="logo" i] img, img[class*="logo" i], img[id*="logo" i]').forEach((img) => {
        addCandidate(img.currentSrc || img.src || img.getAttribute('src'), 'logo-img', img.naturalWidth || img.width || 0, img.naturalHeight || img.height || 0);
      });

      document.querySelectorAll('header svg').forEach((svg) => {
        const svgString = new XMLSerializer().serializeToString(svg);
        const encoded = encodeURIComponent(svgString)
          .replace(/'/g, '%27')
          .replace(/"/g, '%22');
        addCandidate('data:image/svg+xml,' + encoded, 'header-svg');
      });
      document.querySelectorAll('nav svg').forEach((svg) => {
        const svgString = new XMLSerializer().serializeToString(svg);
        const encoded = encodeURIComponent(svgString)
          .replace(/'/g, '%27')
          .replace(/"/g, '%22');
        addCandidate('data:image/svg+xml,' + encoded, 'nav-svg');
      });
      document.querySelectorAll('[class*="logo" i] svg, [id*="logo" i] svg, svg[class*="logo" i], svg[id*="logo" i]').forEach((svg) => {
        const svgString = new XMLSerializer().serializeToString(svg);
        const encoded = encodeURIComponent(svgString)
          .replace(/'/g, '%27')
          .replace(/"/g, '%22');
        addCandidate('data:image/svg+xml,' + encoded, 'logo-svg');
      });

      return candidates;
    })()`;
    const logosRaw = await page.evaluate(extractionScript as any);
    const candidates: RawLogoCandidate[] = Array.isArray(logosRaw)
      ? logosRaw
        .filter((value): value is RawLogoCandidate => typeof value === 'object' && value !== null && typeof (value as RawLogoCandidate).url === 'string')
        .map((value) => ({
          url: value.url,
          source: value.source,
          width: typeof value.width === 'number' ? value.width : undefined,
          height: typeof value.height === 'number' ? value.height : undefined,
        }))
      : [];
    const logos = pickTopLogoCandidates(candidates, 3);
    console.log('[extract-assets] Extraction completed.', {
      url: parsedUrl.toString(),
      candidateCount: candidates.length,
      selectedCount: logos.length,
    });

    return res.json({
      success: true,
      logos,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown extraction error';
    console.log('[extract-assets] Extraction failed.', {
      url: parsedUrl.toString(),
      error: message,
    });

    if (message.includes("Cannot find package 'playwright'")) {
      return res.status(500).json({
        success: false,
        error: 'Playwright is not installed in this environment. Install it with: npm install playwright',
      });
    }

    return res.status(500).json({
      success: false,
      error: `Failed to extract logo candidates: ${message}`,
    });
  } finally {
    if (page) {
      await page.close().catch(() => {});
    }
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
});

app.get('/api/extract-typography', async (req, res) => {
  const rawUrl = Array.isArray(req.query.url) ? req.query.url[0] : req.query.url;
  const rawMaxSamples = Array.isArray(req.query.maxSamplesPerTag) ? req.query.maxSamplesPerTag[0] : req.query.maxSamplesPerTag;

  if (!rawUrl || typeof rawUrl !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Missing url query parameter. Try /api/extract-typography?url=https://example.com',
    });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl.trim());
  } catch {
    return res.status(400).json({
      success: false,
      error: 'Invalid URL. Use a full http/https URL such as https://example.com',
    });
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return res.status(400).json({
      success: false,
      error: 'Only http/https URLs are supported.',
    });
  }

  if (isDisallowedHost(parsedUrl.hostname)) {
    return res.status(403).json({
      success: false,
      error: 'That host is not allowed. Please use a public website URL.',
    });
  }

  const maxSamplesPerTag = Math.max(1, Math.min(10, Number(rawMaxSamples || 3)));

  console.log('[extract-typography] Starting Playwright computed-style extraction.', {
    url: parsedUrl.toString(),
    hostname: parsedUrl.hostname,
    maxSamplesPerTag,
  });

  try {
    const typography = await extractTypography(parsedUrl.toString(), { maxSamplesPerTag });
    console.log('[extract-typography] Extraction completed.', {
      url: parsedUrl.toString(),
      h1: typography.h1.length,
      h2: typography.h2.length,
      h3: typography.h3.length,
      p: typography.p.length,
    });

    return res.json({
      success: true,
      url: parsedUrl.toString(),
      typography,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown extraction error';
    console.log('[extract-typography] Extraction failed.', {
      url: parsedUrl.toString(),
      error: message,
    });

    if (message.includes("Cannot find package 'playwright'")) {
      return res.status(500).json({
        success: false,
        error: 'Playwright is not installed in this environment. Install it with: npm install playwright',
      });
    }

    return res.status(500).json({
      success: false,
      error: `Failed to extract typography: ${message}`,
    });
  }
});

app.get('/api/extract-color-palette', async (req, res) => {
  const rawUrl = Array.isArray(req.query.url) ? req.query.url[0] : req.query.url;

  if (!rawUrl || typeof rawUrl !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Missing url query parameter. Try /api/extract-color-palette?url=https://example.com',
    });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl.trim());
  } catch {
    return res.status(400).json({
      success: false,
      error: 'Invalid URL. Use a full http/https URL such as https://example.com',
    });
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return res.status(400).json({
      success: false,
      error: 'Only http/https URLs are supported.',
    });
  }

  if (isDisallowedHost(parsedUrl.hostname)) {
    return res.status(403).json({
      success: false,
      error: 'That host is not allowed. Please use a public website URL.',
    });
  }

  console.log('[extract-color-palette] Starting Playwright + node-vibrant extraction.', {
    url: parsedUrl.toString(),
    hostname: parsedUrl.hostname,
  });

  try {
    const colors = await extractColorPalette(parsedUrl.toString());
    if (!colors) {
      return res.status(502).json({
        success: false,
        error: 'Color clustering failed for this URL.',
      });
    }

    console.log('[extract-color-palette] Extraction completed.', {
      url: parsedUrl.toString(),
      primaryAccent: colors.primaryAccent,
      secondaryAccent: colors.secondaryAccent,
      darkNeutral: colors.darkNeutral,
      lightNeutral: colors.lightNeutral,
    });

    return res.json({
      success: true,
      url: parsedUrl.toString(),
      colors,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown extraction error';
    console.log('[extract-color-palette] Extraction failed.', {
      url: parsedUrl.toString(),
      error: message,
    });

    return res.status(500).json({
      success: false,
      error: `Failed to extract color palette: ${message}`,
    });
  }
});

// ── Brand images (logo + hero) ───────────────────────────────────────────
const BRAND_IMAGES_CACHE_TTL_MS = 30 * 60 * 1_000; // 30 min
const brandImagesCache = new Map<string, { result: BrandImagesResult; expiresAt: number }>();
const BRAND_IMAGES_LEGACY_CACHE_TTL_MS = 30 * 60 * 1_000; // 30 min
const brandImagesLegacyCache = new Map<string, { result: BrandImagesResult; expiresAt: number }>();
const DESIGN_EXCAVATOR_VISION_CACHE_TTL_MS = 15 * 60 * 1_000; // 15 min
const designExcavatorVisionCache = new Map<string, { result: BrandVisionAnalysis; expiresAt: number }>();
const BRAND_WEB_CONTEXT_CACHE_TTL_MS = 15 * 60 * 1_000; // 15 min
const brandWebContextCache = new Map<string, { result: BrandWebContextResult; expiresAt: number }>();

app.get('/api/brand-images', async (req, res) => {
  const rawDomain = Array.isArray(req.query.domain) ? req.query.domain[0] : req.query.domain;

  if (!rawDomain || typeof rawDomain !== 'string') {
    return res.status(400).json({ error: 'Missing domain query parameter.' });
  }

  let parsedUrl: URL;
  try {
    const withProtocol = /^https?:\/\//i.test(rawDomain.trim())
      ? rawDomain.trim()
      : `https://${rawDomain.trim()}`;
    parsedUrl = new URL(withProtocol);
  } catch {
    return res.status(400).json({ error: 'Invalid domain parameter.' });
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return res.status(400).json({ error: 'Only http/https domains are allowed.' });
  }

  if (isDisallowedHost(parsedUrl.hostname)) {
    return res.status(403).json({ error: 'Host is not allowed.' });
  }

  const cacheKey = parsedUrl.hostname;
  const cached = brandImagesCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return res.json(cached.result);
  }

  try {
    const result = await extractBrandImages(parsedUrl.hostname);
    brandImagesCache.set(cacheKey, { result, expiresAt: Date.now() + BRAND_IMAGES_CACHE_TTL_MS });
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(502).json({ error: `Failed to extract brand images: ${message}` });
  }
});

app.get('/api/brand-images-legacy', async (req, res) => {
  const rawDomain = Array.isArray(req.query.domain) ? req.query.domain[0] : req.query.domain;

  if (!rawDomain || typeof rawDomain !== 'string') {
    return res.status(400).json({ error: 'Missing domain query parameter.' });
  }

  let parsedUrl: URL;
  try {
    const withProtocol = /^https?:\/\//i.test(rawDomain.trim())
      ? rawDomain.trim()
      : `https://${rawDomain.trim()}`;
    parsedUrl = new URL(withProtocol);
  } catch {
    return res.status(400).json({ error: 'Invalid domain parameter.' });
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return res.status(400).json({ error: 'Only http/https domains are allowed.' });
  }

  if (isDisallowedHost(parsedUrl.hostname)) {
    return res.status(403).json({ error: 'Host is not allowed.' });
  }

  const cacheKey = parsedUrl.hostname;
  const cached = brandImagesLegacyCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return res.json(cached.result);
  }

  console.log('[design-excavator-legacy] Request received.', {
    domain: parsedUrl.hostname,
    originalInput: rawDomain,
  });

  try {
    const result = await extractLegacyBrandAssets(parsedUrl.hostname);
    brandImagesLegacyCache.set(cacheKey, { result, expiresAt: Date.now() + BRAND_IMAGES_LEGACY_CACHE_TTL_MS });
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(502).json({ error: `Failed to extract legacy brand images: ${message}` });
  }
});

app.post('/api/design-excavator-vision', async (req, res) => {
  const websiteUrl = typeof req.body?.websiteUrl === 'string' ? req.body.websiteUrl : '';
  if (!websiteUrl.trim()) {
    return res.status(400).json({ error: 'Missing websiteUrl in request body.' });
  }

  let parsedUrl: URL;
  try {
    const withProtocol = /^https?:\/\//i.test(websiteUrl.trim())
      ? websiteUrl.trim()
      : `https://${websiteUrl.trim()}`;
    parsedUrl = new URL(withProtocol);
  } catch {
    return res.status(400).json({ error: 'Invalid websiteUrl.' });
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return res.status(400).json({ error: 'Only http/https website URLs are allowed.' });
  }

  if (isDisallowedHost(parsedUrl.hostname)) {
    return res.status(403).json({ error: 'Host is not allowed.' });
  }

  const cacheKey = parsedUrl.toString().toLowerCase();
  const cached = designExcavatorVisionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return res.json(cached.result);
  }

  console.log('[design-excavator-vision] Request received.', {
    websiteUrl: parsedUrl.toString(),
    hostname: parsedUrl.hostname,
  });

  try {
    const analysis = await analyzeBrandDesignFromScreenshot(parsedUrl.toString());
    if (!analysis) {
      return res.status(502).json({ error: 'Vision analysis is unavailable. Check Azure OpenAI configuration.' });
    }

    designExcavatorVisionCache.set(cacheKey, {
      result: analysis,
      expiresAt: Date.now() + DESIGN_EXCAVATOR_VISION_CACHE_TTL_MS,
    });

    console.log('[design-excavator-vision] Vision analysis completed.', {
      websiteUrl: parsedUrl.toString(),
      colorCount: analysis.primaryColors.length,
      fontCount: analysis.fontFamilies.length,
    });

    return res.json(analysis);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown vision analysis error';
    console.log('[design-excavator-vision] Request failed.', {
      websiteUrl: parsedUrl.toString(),
      error: message,
    });
    return res.status(502).json({ error: `Failed to analyze screenshot with vision model: ${message}` });
  }
});

// ── Brand web context (homepage + corporate pages) ───────────────────────────
app.get('/api/brand-web-context', async (req, res) => {
  const rawTarget = Array.isArray(req.query.target) ? req.query.target[0] : req.query.target;
  const rawBrand = Array.isArray(req.query.brand) ? req.query.brand[0] : req.query.brand;

  if (!rawTarget || typeof rawTarget !== 'string') {
    return res.status(400).json({ error: 'Missing target query parameter.' });
  }

  let parsedUrl: URL;
  try {
    const withProtocol = /^https?:\/\//i.test(rawTarget.trim())
      ? rawTarget.trim()
      : `https://${rawTarget.trim()}`;
    parsedUrl = new URL(withProtocol);
  } catch {
    return res.status(400).json({ error: 'Invalid target parameter.' });
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return res.status(400).json({ error: 'Only http/https targets are allowed.' });
  }

  if (isDisallowedHost(parsedUrl.hostname)) {
    return res.status(403).json({ error: 'Host is not allowed.' });
  }

  const cacheKey = `${(rawBrand || '').toString().trim().toLowerCase()}::${parsedUrl.toString().toLowerCase()}`;
  const cached = brandWebContextCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return res.json(cached.result);
  }

  try {
    const result = await extractBrandWebContext(parsedUrl.toString(), typeof rawBrand === 'string' ? rawBrand : '');
    brandWebContextCache.set(cacheKey, { result, expiresAt: Date.now() + BRAND_WEB_CONTEXT_CACHE_TTL_MS });
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(502).json({ error: `Failed to extract brand web context: ${message}` });
  }
});

app.get('/api/search', async (req, res) => {
  const query = req.query.q as string;
  const mode = String(req.query.mode || '').trim().toLowerCase();
  const providerRaw = String(req.query.provider || '').trim().toLowerCase();
  const provider = providerRaw === 'google' || providerRaw === 'bing' ? providerRaw : undefined;
  if (!query) return res.status(400).json({ error: 'Missing query' });
  try {
    const context = await fetchAudienceContext(query, { behaviorFocus: mode === 'behaviors', provider });
    res.json({ context });
  } catch (err: any) {
    const primaryMessage = err?.message || 'Search provider unavailable.';
    console.warn('[search] Primary web search failed, attempting GPT fallback.', {
      query,
      mode,
      provider: provider || 'auto',
      error: primaryMessage,
    });
    try {
      const gptContext = await fetchAudienceContextWithGptSearch(query, 'current');
      return res.json({
        context: gptContext,
        fallback: 'gpt',
      });
    } catch (fallbackErr: any) {
      const fallbackMessage = fallbackErr?.message || 'GPT fallback unavailable.';
      console.error('[search] GPT fallback failed.', {
        query,
        mode,
        provider: provider || 'auto',
        error: fallbackMessage,
      });
      return res.json({
        context: `No web results returned for: "${query}".`,
        fallback: 'none',
      });
    }
  }
});

app.get('/api/cultural-methodology-compare', async (req, res) => {
  const audience = (Array.isArray(req.query.audience) ? req.query.audience[0] : req.query.audience) as string;
  if (!audience || !audience.trim()) return res.status(400).json({ error: 'Missing audience query parameter' });

  const normalizedAudience = audience.trim();
  console.log('[methodology-compare] Starting comparison request', { audience: normalizedAudience });

  try {
    const [previousResult, currentResult] = await Promise.allSettled([
      fetchAudienceContextWithGptSearch(normalizedAudience, 'previous'),
      fetchAudienceContextWithGptSearch(normalizedAudience, 'current'),
    ]);

    const previousDigest = previousResult.status === 'fulfilled'
      ? previousResult.value
      : buildComparisonFallbackDigest('previous', previousResult.reason);
    const currentDigest = currentResult.status === 'fulfilled'
      ? currentResult.value
      : buildComparisonFallbackDigest('current', currentResult.reason);

    console.log('[methodology-compare] Comparison completed', {
      audience: normalizedAudience,
      previousStatus: previousResult.status,
      currentStatus: currentResult.status,
      previousLength: previousDigest.length,
      currentLength: currentDigest.length,
    });

    return res.json({
      audience: normalizedAudience,
      previous: {
        methodology: 'Previous (single-lane baseline)',
        digest: previousDigest,
      },
      current: {
        methodology: 'Current (breaking + structural macro lanes)',
        digest: currentDigest,
      },
    });
  } catch (err: any) {
    const message = err?.message || 'Comparison failed.';
    console.error('[methodology-compare] Comparison failed', { audience: normalizedAudience, error: message });
    return res.status(500).json({ error: message });
  }
});

app.get('/api/cultural-behaviors-methodology-compare', async (req, res) => {
  const audience = (Array.isArray(req.query.audience) ? req.query.audience[0] : req.query.audience) as string;
  if (!audience || !audience.trim()) return res.status(400).json({ error: 'Missing audience query parameter' });

  const normalizedAudience = audience.trim();
  console.log('[behavior-methodology-compare] Starting comparison request', { audience: normalizedAudience });

  try {
    const [previousResult, currentResult] = await Promise.allSettled([
      fetchAudienceContextPreviousMethodology(normalizedAudience),
      fetchAudienceContext(normalizedAudience, { behaviorFocus: true }),
    ]);

    const previousDigest = previousResult.status === 'fulfilled'
      ? previousResult.value
      : buildComparisonFallbackDigest('previous', previousResult.reason);
    const currentDigest = currentResult.status === 'fulfilled'
      ? currentResult.value
      : buildComparisonFallbackDigest('current', currentResult.reason);
    const safePreviousDigest = shouldUseBehaviorSnapshotFallback(previousDigest)
      ? buildBehaviorMethodologySnapshotDigest('previous', normalizedAudience)
      : previousDigest;
    const safeCurrentDigest = shouldUseBehaviorSnapshotFallback(currentDigest)
      ? buildBehaviorMethodologySnapshotDigest('current', normalizedAudience)
      : currentDigest;

    console.log('[behavior-methodology-compare] Comparison completed', {
      audience: normalizedAudience,
      previousStatus: previousResult.status,
      currentStatus: currentResult.status,
      previousLength: safePreviousDigest.length,
      currentLength: safeCurrentDigest.length,
    });

    return res.json({
      audience: normalizedAudience,
      previous: {
        methodology: 'Previous (single-lane baseline)',
        digest: safePreviousDigest,
      },
      current: {
        methodology: 'Behavior-focused (routine/habit/guide, no strict recency)',
        digest: safeCurrentDigest,
      },
    });
  } catch (err: any) {
    const message = err?.message || 'Comparison failed.';
    console.error('[behavior-methodology-compare] Comparison failed', { audience: normalizedAudience, error: message });
    return res.status(500).json({ error: message });
  }
});

app.get('/api/cultural-language-methodology-compare', async (req, res) => {
  const audience = (Array.isArray(req.query.audience) ? req.query.audience[0] : req.query.audience) as string;
  if (!audience || !audience.trim()) return res.status(400).json({ error: 'Missing audience query parameter' });

  const normalizedAudience = audience.trim();
  console.log('[language-methodology-compare] Starting comparison request.', { audience: normalizedAudience });

  try {
    const comparison = await fetchLanguageMethodologyComparison(normalizedAudience);

    console.log('[language-methodology-compare] Comparison completed.', {
      audience: normalizedAudience,
      previousLength: comparison.previousDigest.length,
      currentLength: comparison.currentDigest.length,
    });

    return res.json({
      audience: comparison.audience,
      previous: {
        methodology: 'Previous Language Methodology (baseline)',
        digest: comparison.previousDigest,
      },
      current: {
        methodology: 'Current Language Methodology (most recent only: Bing Week + Reddit new/hot + Urban validation)',
        digest: comparison.currentDigest,
      },
    });
  } catch (err: any) {
    const message = err?.message || 'Comparison failed.';
    console.error('[language-methodology-compare] Comparison failed.', { audience: normalizedAudience, error: message });
    return res.status(500).json({ error: message });
  }
});

app.get('/api/cultural-community-methodology-compare', async (req, res) => {
  const audience = (Array.isArray(req.query.audience) ? req.query.audience[0] : req.query.audience) as string;
  if (!audience || !audience.trim()) return res.status(400).json({ error: 'Missing audience query parameter' });

  const normalizedAudience = audience.trim();
  console.log('[community-methodology-compare] Starting comparison request.', { audience: normalizedAudience });

  try {
    const [previousResult, currentResult] = await Promise.allSettled([
      fetchCommunityContextPreviousMethodology(normalizedAudience),
      fetchCommunityContextBarbellMethodology(normalizedAudience),
    ]);

    const previousDigest = previousResult.status === 'fulfilled'
      ? previousResult.value
      : buildComparisonFallbackDigest('previous', previousResult.reason);
    const currentDigest = currentResult.status === 'fulfilled'
      ? currentResult.value
      : buildComparisonFallbackDigest('current', currentResult.reason);
    const safePreviousDigest = shouldUseCommunitySnapshotFallback(previousDigest)
      ? buildCommunityMethodologySnapshotDigest('previous', normalizedAudience)
      : previousDigest;
    const safeCurrentDigest = shouldUseCommunitySnapshotFallback(currentDigest)
      ? buildCommunityMethodologySnapshotDigest('current', normalizedAudience)
      : currentDigest;

    console.log('[community-methodology-compare] Comparison completed.', {
      audience: normalizedAudience,
      previousStatus: previousResult.status,
      currentStatus: currentResult.status,
      previousLength: safePreviousDigest.length,
      currentLength: safeCurrentDigest.length,
    });

    return res.json({
      audience: normalizedAudience,
      previous: {
        methodology: 'Previous Community Methodology (single-lane baseline)',
        digest: safePreviousDigest,
      },
      current: {
        methodology: 'Current Community Methodology (barbell: foundational hubs + breakout micro-communities)',
        digest: safeCurrentDigest,
      },
    });
  } catch (err: any) {
    const message = err?.message || 'Comparison failed.';
    console.error('[community-methodology-compare] Comparison failed.', { audience: normalizedAudience, error: message });
    return res.status(500).json({ error: message });
  }
});

app.get('/api/cultural-influencers-methodology-compare', async (req, res) => {
  const audience = (Array.isArray(req.query.audience) ? req.query.audience[0] : req.query.audience) as string;
  if (!audience || !audience.trim()) return res.status(400).json({ error: 'Missing audience query parameter' });

  const normalizedAudience = audience.trim();
  console.log('[influencer-methodology-compare] Starting comparison request.', { audience: normalizedAudience });

  try {
    const [previousResult, currentResult] = await Promise.allSettled([
      fetchAudienceContextPreviousMethodology(normalizedAudience),
      fetchAudienceContext(normalizedAudience),
    ]);

    const previousDigest = previousResult.status === 'fulfilled'
      ? previousResult.value
      : buildComparisonFallbackDigest('previous', previousResult.reason);
    const currentDigest = currentResult.status === 'fulfilled'
      ? currentResult.value
      : buildComparisonFallbackDigest('current', currentResult.reason);
    const safePreviousDigest = shouldUseInfluencerSnapshotFallback(previousDigest)
      ? buildInfluencerMethodologySnapshotDigest('previous', normalizedAudience)
      : previousDigest;
    const safeCurrentDigest = shouldUseInfluencerSnapshotFallback(currentDigest)
      ? buildInfluencerMethodologySnapshotDigest('current', normalizedAudience)
      : currentDigest;

    console.log('[influencer-methodology-compare] Comparison completed.', {
      audience: normalizedAudience,
      previousStatus: previousResult.status,
      currentStatus: currentResult.status,
      previousLength: safePreviousDigest.length,
      currentLength: safeCurrentDigest.length,
    });

    return res.json({
      audience: normalizedAudience,
      previous: {
        methodology: 'Previous Influencer Methodology (single-lane baseline)',
        digest: safePreviousDigest,
      },
      current: {
        methodology: 'Current Influencer Methodology (barbell: legacy authorities + breakout micro-creators)',
        digest: safeCurrentDigest,
      },
    });
  } catch (err: any) {
    const message = err?.message || 'Comparison failed.';
    console.error('[influencer-methodology-compare] Comparison failed.', { audience: normalizedAudience, error: message });
    return res.status(500).json({ error: message });
  }
});

app.get('/api/reddit', async (req, res) => {
  const subreddit = req.query.subreddit as string;
  if (!subreddit) return res.status(400).json({ error: 'Missing subreddit' });
  try {
    const quotes = await fetchSubredditQuotes(subreddit);
    res.json({ quotes });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const server = app.listen(PORT, () => {
  console.log(`🗄️ Admin server running at http://localhost:${PORT}`);
  console.log(`📊 View searches at http://localhost:${PORT}/admin`);
  console.log(`🖼️ Image proxy running at http://localhost:${PORT}/api/image-proxy`);
  console.log('[feedback] Google Sheets feedback sync is disabled in this build.');
});

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`[startup] Port ${PORT} is already in use. Stop the existing process or choose a different port.`);
    process.exit(1);
  }

  console.error('[startup] Failed to start server:', error.message);
  process.exit(1);
});
