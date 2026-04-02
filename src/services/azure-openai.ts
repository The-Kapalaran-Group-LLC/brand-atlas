import { AzureOpenAI } from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { CulturalMatrix, MatrixItem, UploadedFile, DeepDiveReport } from "./ai";

export interface BrandDeepDiveReport {
  analysisObjective: string;
  ecosystemMethod: string;
  brandProfiles: BrandVisualIdentityProfile[];
  crossBrandReadout: string[];
  strategicRecommendations: string[];
  sources: { title: string; url: string }[];
}

export interface BrandVisualIdentityProfile {
  brandName: string;
  website?: string | null;
  matchSource?: 'name' | 'domain' | 'index' | 'none';
  logoImageUrl?: string | null;
  sampleVisuals: { title: string; url: string }[];
  logo: {
    mainLogo: string;
    logoVariations: string[];
    wordmarkLogotype: string;
    symbolsIcons: string[];
  };
  colorPalette: {
    primaryColors: BrandColorSpec[];
    secondaryAccentColors: BrandColorSpec[];
    neutrals: BrandColorSpec[];
  };
  typography: {
    fontFamilies: string[];
    hierarchy: {
      h1: string;
      h2: string;
      body: string;
    };
    usageRules: string[];
  };
  supportingVisualElements: {
    imageryStyle: string[];
    icons: string[];
    patternsTextures: string[];
    shapes: string[];
    dataVisualization: string[];
  };
  consistencyAssessment: string;
  distinctivenessAssessment: string;
  sources: { title: string; url: string }[];
}

export interface BrandColorSpec {
  name: string;
  hex: string;
  rgb?: string | null;
  cmyk?: string | null;
  pantone?: string | null;
  usage?: string | null;
}

// ============================================================================
// AZURE OPENAI MIGRATION GUIDE
// ============================================================================
// To switch from Gemini to Azure OpenAI:
// 1. In `src/App.tsx`, change the import path from `./services/ai` to `./services/azure-openai`
// 2. Set the following environment variables in your Azure environment or .env file:
//    - AZURE_OPENAI_API_KEY
//    - AZURE_OPENAI_ENDPOINT (e.g., https://your-resource-name.openai.azure.com/)
//    - AZURE_OPENAI_API_VERSION (e.g., 2024-02-15-preview)
//    - AZURE_OPENAI_DEPLOYMENT_NAME (e.g., gpt-4o)
// ============================================================================

function getAzureAI() {
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || "2024-02-15-preview";
  
  if (!apiKey || !endpoint) {
    console.warn("Missing Azure OpenAI credentials. Please set AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT.");
  }

  return new AzureOpenAI({
    apiKey: apiKey || "dummy-key",
    endpoint: endpoint || "https://dummy-endpoint.openai.azure.com/",
    apiVersion: apiVersion,
    dangerouslyAllowBrowser: true // Required if calling directly from the browser
  });
}

// Helper to get the deployment name
const getDeploymentName = () => process.env.AZURE_OPENAI_DEPLOYMENT_NAME || "gpt-4o";

// Zod schemas for structured outputs
const DeepDiveReportSchema = z.object({
  originationDate: z.string(),
  relevance: z.string(),
  expandedContext: z.string(),
  strategicImplications: z.array(z.string()),
  realWorldExamples: z.array(z.string()),
  sources: z.array(z.object({
    title: z.string(),
    url: z.string()
  }))
});

const BrandColorSpecSchema = z.object({
  name: z.string(),
  hex: z.string(),
  rgb: z.string().nullable(),
  cmyk: z.string().nullable(),
  pantone: z.string().nullable(),
  usage: z.string().nullable(),
});

const BrandDeepDiveReportSchema = z.object({
  analysisObjective: z.string(),
  ecosystemMethod: z.string(),
  brandProfiles: z.array(
    z.object({
      brandName: z.string(),
      website: z.string().nullable(),
      logoImageUrl: z.string().nullable(),
      sampleVisuals: z.array(
        z.object({
          title: z.string(),
          url: z.string(),
        })
      ),
      logo: z.object({
        mainLogo: z.string(),
        logoVariations: z.array(z.string()),
        wordmarkLogotype: z.string(),
        symbolsIcons: z.array(z.string()),
      }),
      colorPalette: z.object({
        primaryColors: z.array(BrandColorSpecSchema),
        secondaryAccentColors: z.array(BrandColorSpecSchema),
        neutrals: z.array(BrandColorSpecSchema),
      }),
      typography: z.object({
        fontFamilies: z.array(z.string()),
        hierarchy: z.object({
          h1: z.string(),
          h2: z.string(),
          body: z.string(),
        }),
        usageRules: z.array(z.string()),
      }),
      supportingVisualElements: z.object({
        imageryStyle: z.array(z.string()),
        icons: z.array(z.string()),
        patternsTextures: z.array(z.string()),
        shapes: z.array(z.string()),
        dataVisualization: z.array(z.string()),
      }),
      consistencyAssessment: z.string(),
      distinctivenessAssessment: z.string(),
      sources: z.array(
        z.object({
          title: z.string(),
          url: z.string(),
        })
      ),
    })
  ),
  crossBrandReadout: z.array(z.string()),
  strategicRecommendations: z.array(z.string()),
  sources: z.array(
    z.object({
      title: z.string(),
      url: z.string(),
    })
  ),
});

const BrandDeepDiveFallbackSchema = z.object({
  analysisObjective: z.string().nullable(),
  ecosystemMethod: z.string().nullable(),
  brandProfiles: z.array(
    z.object({
      brandName: z.string().nullable(),
      website: z.string().nullable(),
      logoImageUrl: z.string().nullable(),
      sampleVisuals: z.array(z.object({ title: z.string(), url: z.string() })).nullable(),
      logo: z.object({
        mainLogo: z.string().nullable(),
        logoVariations: z.array(z.string()).nullable(),
        wordmarkLogotype: z.string().nullable(),
        symbolsIcons: z.array(z.string()).nullable(),
      }).nullable(),
      colorPalette: z.object({
        primaryColors: z.array(BrandColorSpecSchema).nullable(),
        secondaryAccentColors: z.array(BrandColorSpecSchema).nullable(),
        neutrals: z.array(BrandColorSpecSchema).nullable(),
      }).nullable(),
      typography: z.object({
        fontFamilies: z.array(z.string()).nullable(),
        hierarchy: z.object({
          h1: z.string().nullable(),
          h2: z.string().nullable(),
          body: z.string().nullable(),
        }).nullable(),
        usageRules: z.array(z.string()).nullable(),
      }).nullable(),
      supportingVisualElements: z.object({
        imageryStyle: z.array(z.string()).nullable(),
        icons: z.array(z.string()).nullable(),
        patternsTextures: z.array(z.string()).nullable(),
        shapes: z.array(z.string()).nullable(),
        dataVisualization: z.array(z.string()).nullable(),
      }).nullable(),
      consistencyAssessment: z.string().nullable(),
      distinctivenessAssessment: z.string().nullable(),
      sources: z.array(z.object({ title: z.string(), url: z.string() })).nullable(),
    })
  ).nullable(),
  crossBrandReadout: z.array(z.string()).nullable(),
  strategicRecommendations: z.array(z.string()).nullable(),
  sources: z.array(z.object({ title: z.string(), url: z.string() })).nullable(),
});

const RESEARCH_ACCURACY_PROTOCOL = `
Accuracy protocol (must follow):
- Prioritize high-credibility sources: first-party brand properties, reputable industry publishers, recognized research institutions.
- Use the most recent evidence available (favor 2024-2026) and avoid stale claims unless historically relevant.
- Do not fabricate sources, URLs, dates, statistics, or examples.
- If confidence is low, state uncertainty explicitly and keep language conservative.
- Ensure every strategic claim is grounded in observable signals from reliable sources.
`;

function normalizeHttpsUrl(rawUrl?: string | null): string | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    if (!parsed.hostname || !parsed.hostname.includes('.')) return null;
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function sanitizeSources(sources?: { title: string; url: string }[] | null): { title: string; url: string }[] {
  const seen = new Set<string>();
  return (sources || [])
    .map((source) => {
      const url = normalizeHttpsUrl(source.url);
      if (!url) return null;
      const title = (source.title || '').trim() || 'Untitled source';
      return { title, url };
    })
    .filter((source): source is { title: string; url: string } => Boolean(source))
    .filter((source) => {
      if (seen.has(source.url)) return false;
      seen.add(source.url);
      return true;
    });
}

function sanitizeDeepDiveReport(report: DeepDiveReport): DeepDiveReport {
  return {
    ...report,
    sources: sanitizeSources(report.sources),
    strategicImplications: (report.strategicImplications || []).map((item) => item.trim()).filter(Boolean),
    realWorldExamples: (report.realWorldExamples || []).map((item) => item.trim()).filter(Boolean),
  };
}

function isValidHexColor(value?: string | null): boolean {
  if (!value) return false;
  return /^#?[0-9a-fA-F]{6}$/.test(value.trim());
}

function normalizeHexColor(value?: string | null): string | null {
  if (!isValidHexColor(value)) return null;
  const trimmed = value!.trim().replace('#', '').toUpperCase();
  return `#${trimmed}`;
}

function isOfficialSourceForWebsite(sourceUrl?: string | null, websiteUrl?: string | null): boolean {
  const sourceHost = getHostname(sourceUrl);
  const websiteHost = getHostname(websiteUrl);
  if (!sourceHost || !websiteHost) return false;
  return sourceHost === websiteHost || sourceHost.endsWith(`.${websiteHost}`) || websiteHost.endsWith(`.${sourceHost}`);
}

function sanitizeBrandDeepDiveReport(report: BrandDeepDiveReport): BrandDeepDiveReport {
  return {
    ...report,
    sources: sanitizeSources(report.sources),
    brandProfiles: (report.brandProfiles || []).map((profile) => {
      const normalizedWebsite = normalizeHttpsUrl(profile.website) || profile.website || null;
      const profileSources = sanitizeSources(profile.sources);
      const hasOfficialBrandSource = profileSources.some((source) =>
        isOfficialSourceForWebsite(source.url, normalizedWebsite)
      );

      const sanitizeColors = (colors: BrandColorSpec[] = []): BrandColorSpec[] =>
        colors
          .map((color) => {
            const hex = normalizeHexColor(color.hex);
            if (!hex) return null;
            return {
              ...color,
              name: (color.name || 'Color').trim(),
              hex,
            };
          })
          .filter((color): color is BrandColorSpec => Boolean(color));

      const verifiedPrimaryColors = hasOfficialBrandSource ? sanitizeColors(profile.colorPalette?.primaryColors || []) : [];
      const verifiedAccentColors = hasOfficialBrandSource ? sanitizeColors(profile.colorPalette?.secondaryAccentColors || []) : [];
      const verifiedNeutrals = hasOfficialBrandSource ? sanitizeColors(profile.colorPalette?.neutrals || []) : [];

      return {
        ...profile,
        website: normalizedWebsite,
        logoImageUrl: normalizeHttpsUrl(profile.logoImageUrl) || null,
        sampleVisuals: (profile.sampleVisuals || [])
          .map((visual) => {
            const url = normalizeHttpsUrl(visual.url);
            if (!url) return null;
            return { title: (visual.title || 'Visual').trim(), url };
          })
          .filter((visual): visual is { title: string; url: string } => Boolean(visual)),
        colorPalette: {
          primaryColors: verifiedPrimaryColors,
          secondaryAccentColors: verifiedAccentColors,
          neutrals: verifiedNeutrals,
        },
        consistencyAssessment: hasOfficialBrandSource
          ? profile.consistencyAssessment
          : `${profile.consistencyAssessment} Color hex values were omitted because no official same-domain source was found for verification.`,
        sources: profileSources,
      };
    }),
  };
}

function sanitizeCulturalMatrix(matrix: CulturalMatrix): CulturalMatrix {
  const normalizeItemConfidence = (item: MatrixItem): MatrixItem => ({
    ...item,
    confidenceLevel:
      item.confidenceLevel === 'low' || item.confidenceLevel === 'high' || item.confidenceLevel === 'medium'
        ? item.confidenceLevel
        : 'medium',
  });

  return {
    ...matrix,
    moments: (matrix.moments || []).map(normalizeItemConfidence),
    beliefs: (matrix.beliefs || []).map(normalizeItemConfidence),
    tone: (matrix.tone || []).map(normalizeItemConfidence),
    language: (matrix.language || []).map(normalizeItemConfidence),
    behaviors: (matrix.behaviors || []).map(normalizeItemConfidence),
    contradictions: (matrix.contradictions || []).map(normalizeItemConfidence),
    community: (matrix.community || []).map(normalizeItemConfidence),
    influencers: (matrix.influencers || []).map(normalizeItemConfidence),
    sources: sanitizeSources(matrix.sources),
  };
}

function normalizeKey(value?: string | null): string {
  return (value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getHostname(value?: string | null): string {
  if (!value) return '';
  try {
    const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    return new URL(withProtocol).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function normalizeBrandDeepDiveReport(
  parsed: z.infer<typeof BrandDeepDiveFallbackSchema>,
  fallbackBrands: { name: string; website?: string }[],
  fallbackObjective: string
): BrandDeepDiveReport {
  const sourceProfiles = parsed.brandProfiles || [];
  const remainingProfiles = [...sourceProfiles];

  const alignedProfiles = fallbackBrands.map((brand, idx) => {
    const targetNameKey = normalizeKey(brand.name);
    const targetHost = getHostname(brand.website);
    let matchedBy: 'name' | 'domain' | 'index' | 'none' = 'none';

    let matchedIndex = remainingProfiles.findIndex((profile) => {
      const profileNameKey = normalizeKey(profile.brandName);
      return profileNameKey === targetNameKey || profileNameKey.includes(targetNameKey) || targetNameKey.includes(profileNameKey);
    });
    if (matchedIndex >= 0) {
      matchedBy = 'name';
    }

    if (matchedIndex < 0 && targetHost) {
      matchedIndex = remainingProfiles.findIndex((profile) => getHostname(profile.website) === targetHost);
      if (matchedIndex >= 0) {
        matchedBy = 'domain';
      }
    }

    if (matchedIndex < 0 && idx < remainingProfiles.length) {
      matchedIndex = idx;
      matchedBy = 'index';
    }

    if (matchedIndex < 0 || matchedIndex >= remainingProfiles.length) {
      return null;
    }

    const [matched] = remainingProfiles.splice(matchedIndex, 1);
    return { brand, matched, matchedBy };
  });

  return {
    analysisObjective: parsed.analysisObjective || fallbackObjective,
    ecosystemMethod:
      parsed.ecosystemMethod ||
      "Brand website ecosystem analysis was conducted using available first-party digital touchpoints.",
    brandProfiles: fallbackBrands.map((brand, idx) => {
      const resolved = alignedProfiles[idx]?.matched;
      const matchedBy = alignedProfiles[idx]?.matchedBy || 'none';
      const profile = resolved || null;
      return {
      brandName: brand.name || profile?.brandName || `Brand ${idx + 1}`,
      website: brand.website || profile?.website || null,
      matchSource: matchedBy,
      logoImageUrl: profile?.logoImageUrl || null,
      sampleVisuals: profile?.sampleVisuals || [],
      logo: {
        mainLogo: profile?.logo?.mainLogo || "Not provided",
        logoVariations: profile?.logo?.logoVariations || [],
        wordmarkLogotype: profile?.logo?.wordmarkLogotype || "Not provided",
        symbolsIcons: profile?.logo?.symbolsIcons || [],
      },
      colorPalette: {
        primaryColors: profile?.colorPalette?.primaryColors || [],
        secondaryAccentColors: profile?.colorPalette?.secondaryAccentColors || [],
        neutrals: profile?.colorPalette?.neutrals || [],
      },
      typography: {
        fontFamilies: profile?.typography?.fontFamilies || [],
        hierarchy: {
          h1: profile?.typography?.hierarchy?.h1 || "Not provided",
          h2: profile?.typography?.hierarchy?.h2 || "Not provided",
          body: profile?.typography?.hierarchy?.body || "Not provided",
        },
        usageRules: profile?.typography?.usageRules || [],
      },
      supportingVisualElements: {
        imageryStyle: profile?.supportingVisualElements?.imageryStyle || [],
        icons: profile?.supportingVisualElements?.icons || [],
        patternsTextures: profile?.supportingVisualElements?.patternsTextures || [],
        shapes: profile?.supportingVisualElements?.shapes || [],
        dataVisualization: profile?.supportingVisualElements?.dataVisualization || [],
      },
      consistencyAssessment: profile?.consistencyAssessment || "Not provided",
      distinctivenessAssessment: profile?.distinctivenessAssessment || "Not provided",
      sources: profile?.sources || [],
    };}),
    crossBrandReadout: parsed.crossBrandReadout || [],
    strategicRecommendations: parsed.strategicRecommendations || [],
    sources: parsed.sources || [],
  };
}

export async function generateBrandDeepDive(input: {
  brands: { name: string; website?: string }[];
  analysisObjective: string;
  targetAudience?: string;
  timeHorizon?: string;
}): Promise<BrandDeepDiveReport> {
  const cappedBrands = input.brands.slice(0, 6);
  const brandList = cappedBrands
    .map((brand, idx) => `${idx + 1}. ${brand.name}${brand.website ? ` (${brand.website})` : ''}`)
    .join("\n");

  const prompt = `You are a senior brand design strategist and visual identity analyst.

Analyze up to 6 brands by assessing their visual identity systems using this framework:
1) Logo (primary mark, variations, wordmark/logotype, symbols/icons)
2) Color Palette (primary, secondary/accent, neutrals, technical values: HEX/RGB/CMYK/Pantone where inferable)
3) Typography (font families, hierarchy for H1/H2/body, usage rules)
4) Supporting Visual Elements (imagery style, icons, patterns/textures, shapes, data visualization style)

Brands to assess:
${brandList}

Analysis Objective: ${input.analysisObjective}
Target Audience: ${input.targetAudience || "Not specified"}
Time Horizon: ${input.timeHorizon || "6-12 months"}

Research guidance:
- Prioritize each brand's full website ecosystem (homepage, product pages, campaign pages, blog/editorial, about, investor/newsroom, design system/style guide if public).
- Use public first-party sources where possible.
- If a value cannot be confirmed with high confidence (for example CMYK/Pantone), mark uncertainty in text and avoid fabricating precision.

Output requirements:
- Return a profile for each brand listed.
- Keep insights concrete, specific, and directly tied to observed visual identity choices.
- Include a cross-brand readout that highlights patterns, white space, and differentiation opportunities.
- Provide strategic recommendations for visual identity direction across the set.
- Include image URLs when available:
  - logoImageUrl: direct URL for the current or most representative logo lockup.
  - sampleVisuals: 2-4 direct image URLs (homepage hero, campaign visual, product visual, etc.) with short titles.
- Prefer stable, first-party image URLs. If no reliable direct image URL is available, return null for logoImageUrl and an empty sampleVisuals list.
- For colorPalette values, include exact HEX values only when they are verified on an official same-domain brand source (brand website/design system/style guide).
- If official same-domain color verification is not available for a brand, leave primaryColors/secondaryAccentColors/neutrals empty instead of guessing exact values.

${RESEARCH_ACCURACY_PROTOCOL}`;

  try {
    const response = await getAzureAI().chat.completions.create({
      model: getDeploymentName(),
      messages: [
        { role: "system", content: RESEARCH_ACCURACY_PROTOCOL },
        { role: "user", content: prompt }
      ],
      response_format: zodResponseFormat(BrandDeepDiveReportSchema, "brand_deep_dive_report"),
    });

    const text = response.choices[0].message.content || "{}";
    const parsedStrict = BrandDeepDiveReportSchema.parse(JSON.parse(text));
    const normalizedStrict = BrandDeepDiveFallbackSchema.parse(parsedStrict);
    return sanitizeBrandDeepDiveReport(normalizeBrandDeepDiveReport(normalizedStrict, cappedBrands, input.analysisObjective));
  } catch (strictError) {
    console.warn("Strict structured response failed for brand deep dive, retrying with fallback schema:", strictError);

    const fallbackResponse = await getAzureAI().chat.completions.create({
      model: getDeploymentName(),
      messages: [
        { role: "system", content: RESEARCH_ACCURACY_PROTOCOL },
        { role: "user", content: prompt }
      ],
      response_format: zodResponseFormat(BrandDeepDiveFallbackSchema, "brand_deep_dive_report_fallback"),
    });

    const fallbackText = fallbackResponse.choices[0].message.content || "{}";
    const parsedFallback = BrandDeepDiveFallbackSchema.parse(JSON.parse(fallbackText));
    return sanitizeBrandDeepDiveReport(normalizeBrandDeepDiveReport(parsedFallback, cappedBrands, input.analysisObjective));
  }
}

export async function regenerateBrandDeepDiveWithFeedback(input: {
  brands: { name: string; website?: string }[];
  analysisObjective: string;
  targetAudience?: string;
  timeHorizon?: string;
  currentReport: BrandDeepDiveReport;
  feedback: string;
}): Promise<BrandDeepDiveReport> {
  const cappedBrands = input.brands.slice(0, 6);
  const brandList = cappedBrands
    .map((brand, idx) => `${idx + 1}. ${brand.name}${brand.website ? ` (${brand.website})` : ''}`)
    .join("\n");

  const prompt = `You are a senior brand design strategist and visual identity analyst.

Re-audit and correct the brand deep dive below. Treat the feedback as a request to rescan the listed brand websites and fix inaccuracies.

Brands to assess:
${brandList}

Analysis Objective: ${input.analysisObjective}
Target Audience: ${input.targetAudience || "Not specified"}
Time Horizon: ${input.timeHorizon || "6-12 months"}

User feedback about what looks inaccurate:
${input.feedback}

Current report to correct:
${JSON.stringify(input.currentReport, null, 2)}

Correction requirements:
- Return a fully updated complete report, not a partial patch.
- Re-check the brand website ecosystem and prioritize first-party same-domain sources.
- Correct any likely inaccuracies in logos, colors, typography, imagery descriptions, and strategic conclusions.
- If a value cannot be verified confidently from official or credible sources, remove the precision instead of guessing.
- Keep sources current, high-credibility, and non-duplicative.
- Preserve useful accurate material from the current report when it remains supportable.

Output requirements:
- Return a profile for each brand listed.
- Keep insights concrete, specific, and directly tied to observed visual identity choices.
- Include a cross-brand readout that highlights patterns, white space, and differentiation opportunities.
- Provide strategic recommendations for visual identity direction across the set.
- Include image URLs when available:
  - logoImageUrl: direct URL for the current or most representative logo lockup.
  - sampleVisuals: 2-4 direct image URLs (homepage hero, campaign visual, product visual, etc.) with short titles.
- Prefer stable, first-party image URLs. If no reliable direct image URL is available, return null for logoImageUrl and an empty sampleVisuals list.
- For colorPalette values, include exact HEX values only when they are verified on an official same-domain brand source (brand website/design system/style guide).
- If official same-domain color verification is not available for a brand, leave primaryColors/secondaryAccentColors/neutrals empty instead of guessing exact values.

${RESEARCH_ACCURACY_PROTOCOL}`;

  try {
    const response = await getAzureAI().chat.completions.create({
      model: getDeploymentName(),
      messages: [
        { role: "system", content: RESEARCH_ACCURACY_PROTOCOL },
        { role: "user", content: prompt }
      ],
      response_format: zodResponseFormat(BrandDeepDiveReportSchema, "brand_deep_dive_report_regenerated"),
    });

    const text = response.choices[0].message.content || "{}";
    const parsedStrict = BrandDeepDiveReportSchema.parse(JSON.parse(text));
    const normalizedStrict = BrandDeepDiveFallbackSchema.parse(parsedStrict);
    return sanitizeBrandDeepDiveReport(normalizeBrandDeepDiveReport(normalizedStrict, cappedBrands, input.analysisObjective));
  } catch (strictError) {
    console.warn("Strict structured response failed for regenerated brand deep dive, retrying with fallback schema:", strictError);

    const fallbackResponse = await getAzureAI().chat.completions.create({
      model: getDeploymentName(),
      messages: [
        { role: "system", content: RESEARCH_ACCURACY_PROTOCOL },
        { role: "user", content: prompt }
      ],
      response_format: zodResponseFormat(BrandDeepDiveFallbackSchema, "brand_deep_dive_report_regenerated_fallback"),
    });

    const fallbackText = fallbackResponse.choices[0].message.content || "{}";
    const parsedFallback = BrandDeepDiveFallbackSchema.parse(JSON.parse(fallbackText));
    return sanitizeBrandDeepDiveReport(normalizeBrandDeepDiveReport(parsedFallback, cappedBrands, input.analysisObjective));
  }
}

export async function generateDeepDive(
  insight: MatrixItem,
  context: { audience: string; brand: string; generations: string[]; topicFocus?: string }
): Promise<DeepDiveReport> {
  const prompt = `You are an expert Cultural Archeologist and Brand Strategist.
  I am providing you with a specific cultural insight about the following audience:
  Audience: ${context.audience}
  Brand Context: ${context.brand}
  Generations: ${context.generations.join(', ')}
  ${context.topicFocus ? `Topic Focus: ${context.topicFocus}` : ''}
  
  Insight: "${insight.text}"
  
  Please provide a deep dive into this specific insight to help me build strategies.

  ${RESEARCH_ACCURACY_PROTOCOL}`;

  const response = await getAzureAI().chat.completions.create({
    model: getDeploymentName(),
    messages: [
      { role: "system", content: RESEARCH_ACCURACY_PROTOCOL },
      { role: "user", content: prompt }
    ],
    response_format: zodResponseFormat(DeepDiveReportSchema, "deep_dive_report"),
  });

  const text = response.choices[0].message.content || "{}";
  return sanitizeDeepDiveReport(JSON.parse(text) as DeepDiveReport);
}

export async function generateDeepDivesBatch(
  insights: MatrixItem[],
  context: { audience: string; brand: string; generations: string[]; topicFocus?: string }
): Promise<DeepDiveReport[]> {
  const prompt = `You are an expert Cultural Archeologist and Brand Strategist.
  I am providing you with a list of specific cultural insights about the following audience:
  Audience: ${context.audience}
  Brand Context: ${context.brand}
  Generations: ${context.generations.join(', ')}
  ${context.topicFocus ? `Topic Focus: ${context.topicFocus}` : ''}
  
  Insights:
  ${insights.map((insight, index) => `${index + 1}. "${insight.text}"`).join('\n')}
  
  Please provide a deep dive into EACH of these specific insights to help me build strategies.

  ${RESEARCH_ACCURACY_PROTOCOL}`;

  const response = await getAzureAI().chat.completions.create({
    model: getDeploymentName(),
    messages: [
      { role: "system", content: RESEARCH_ACCURACY_PROTOCOL },
      { role: "user", content: prompt }
    ],
    response_format: zodResponseFormat(z.object({ reports: z.array(DeepDiveReportSchema) }), "deep_dive_reports"),
  });

  const text = response.choices[0].message.content || "{}";
  const parsed = JSON.parse(text);
  return (parsed.reports || []).map((report: DeepDiveReport) => sanitizeDeepDiveReport(report));
}

const MatrixAnswerSchema = z.object({
  answer: z.string(),
  relevantInsights: z.array(z.string())
});

const BrandDeepDiveAnswerSchema = z.object({
  answer: z.string(),
});

export type BrandDeepDivePromptResult =
  | { mode: "answer"; answer: string }
  | { mode: "rescan"; answer: string; report: BrandDeepDiveReport };

function looksLikeBrandDeepDiveCorrectionPrompt(prompt: string): boolean {
  const normalized = prompt.trim().toLowerCase();
  if (!normalized) return false;

  const directRescanPatterns = [
    /\brescan\b/,
    /\bscan again\b/,
    /\bre-?audit\b/,
    /\brecheck\b/,
    /\bcheck again\b/,
    /\brefresh\b.*\b(report|results|audit)\b/,
    /\bupdate\b.*\b(report|results|audit)\b/,
    /\bfix\b.*\b(report|results|audit|analysis|colors?|typography|logo|imagery)\b/,
    /\bcorrect\b.*\b(report|results|audit|analysis|colors?|typography|logo|imagery)\b/,
    /\bverify\b.*\b(report|results|audit|analysis|colors?|typography|logo|imagery)\b/,
  ];

  const issuePatterns = [
    /\b(report|results|audit|analysis|colors?|typography|logo|imagery)\b.*\b(wrong|incorrect|inaccurate|outdated|missing|off)\b/,
    /\b(wrong|incorrect|inaccurate|outdated|missing|off)\b.*\b(report|results|audit|analysis|colors?|typography|logo|imagery)\b/,
  ];

  return [...directRescanPatterns, ...issuePatterns].some((pattern) => pattern.test(normalized));
}

export async function askMatrixQuestion(matrix: CulturalMatrix, question: string): Promise<{ answer: string, relevantInsights: string[] }> {
  const response = await getAzureAI().chat.completions.create({
    model: getDeploymentName(),
    messages: [
      { role: "system", content: "You are an expert analyst. Answer using ONLY the provided matrix data. Do not invent facts. If the data is insufficient, explicitly say so. Provide a clear answer, and list the exact 'text' of relevant insights from the data." },
      { role: "user", content: `Data:\n\n${JSON.stringify(matrix)}\n\nQuestion: "${question}"` }
    ],
    response_format: zodResponseFormat(MatrixAnswerSchema, "matrix_answer"),
  });
  
  const text = response.choices[0].message.content || "{}";
  return JSON.parse(text);
}

export async function askBrandDeepDiveQuestion(
  report: BrandDeepDiveReport,
  question: string
): Promise<{ answer: string }> {
  const response = await getAzureAI().chat.completions.create({
    model: getDeploymentName(),
    messages: [
      {
        role: "system",
        content:
          `${RESEARCH_ACCURACY_PROTOCOL}\nYou are an expert brand strategist and design analyst. Answer using ONLY the provided brand deep dive report data. Do not invent facts. If the report does not contain enough information, explicitly say so. Provide a concise, direct answer.`,
      },
      {
        role: "user",
        content: `Data:\n\n${JSON.stringify(report)}\n\nQuestion: "${question}"`,
      },
    ],
    response_format: zodResponseFormat(BrandDeepDiveAnswerSchema, "brand_deep_dive_answer"),
  });

  const text = response.choices[0].message.content || "{}";
  return JSON.parse(text);
}

export async function submitBrandDeepDivePrompt(input: {
  brands: { name: string; website?: string }[];
  analysisObjective: string;
  targetAudience?: string;
  timeHorizon?: string;
  currentReport: BrandDeepDiveReport;
  prompt: string;
}): Promise<BrandDeepDivePromptResult> {
  const normalizedPrompt = input.prompt.trim();
  if (!normalizedPrompt) {
    throw new Error("Prompt is required.");
  }

  if (looksLikeBrandDeepDiveCorrectionPrompt(normalizedPrompt)) {
    const nextReport = await regenerateBrandDeepDiveWithFeedback({
      brands: input.brands,
      analysisObjective: input.analysisObjective,
      targetAudience: input.targetAudience,
      timeHorizon: input.timeHorizon,
      currentReport: input.currentReport,
      feedback: normalizedPrompt,
    });

    return {
      mode: "rescan",
      answer: "The report was rescanned and updated using your prompt. Review the refreshed results below.",
      report: nextReport,
    };
  }

  const answer = await askBrandDeepDiveQuestion(input.currentReport, normalizedPrompt);
  return {
    mode: "answer",
    answer: answer.answer,
  };
}

const SuggestBrandsSchema = z.object({
  brands: z.array(z.string())
});

const SuggestBrandWebsiteSchema = z.object({
  website: z.string().nullable(),
});

export async function suggestBrandWebsite(brandName: string): Promise<string | null> {
  const normalized = brandName.trim();
  if (!normalized) return null;

  try {
    const response = await getAzureAI().chat.completions.create({
      model: getDeploymentName(),
      messages: [
        {
          role: "system",
          content:
            "Return only the most likely official homepage URL for the given brand as structured output. Prefer the canonical top-level domain. If uncertain, return null.",
        },
        {
          role: "user",
          content: `Brand name: ${normalized}`,
        },
      ],
      response_format: zodResponseFormat(SuggestBrandWebsiteSchema, "suggest_brand_website"),
    });

    const text = response.choices[0].message.content || "{}";
    const parsed = JSON.parse(text) as { website?: string | null };
    if (!parsed.website) return null;

    const value = parsed.website.trim();
    if (!value) return null;

    const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;

    try {
      const parsed = new URL(withProtocol);
      // Require a plausible hostname to avoid filling malformed values that block form submission.
      if (!parsed.hostname || !parsed.hostname.includes('.')) {
        return null;
      }
      return parsed.toString();
    } catch {
      return null;
    }
  } catch (error) {
    console.error("Failed to suggest brand website:", error);
    return null;
  }
}

export async function suggestBrands(partialName: string): Promise<string[]> {
  if (!partialName || partialName.length < 2) return [];
  try {
    const response = await getAzureAI().chat.completions.create({
      model: getDeploymentName(),
      messages: [
        { role: "user", content: `Suggest 5 well-known brands, categories, or companies that match or start with the partial name: "${partialName}".` }
      ],
      response_format: zodResponseFormat(SuggestBrandsSchema, "suggest_brands"),
    });
    const text = response.choices[0].message.content || "{}";
    const parsed = JSON.parse(text);
    return parsed.brands || [];
  } catch (e) {
    console.error("Error suggesting brands:", e);
    return [];
  }
}

const AutoPopulateSchema = z.object({
  brand: z.string().nullable(),
  audience: z.string().nullable(),
  topicFocus: z.string().nullable()
});

export async function autoPopulateFields(
  brand: string,
  audience: string,
  topicFocus: string
): Promise<{ brand?: string, audience?: string, topicFocus?: string }> {
  const response = await getAzureAI().chat.completions.create({
    model: getDeploymentName(),
    messages: [
      { role: "user", content: `Given the following partial information about a marketing or cultural strategy:
Brand or Category: ${brand || "(empty)"}
Primary Audience: ${audience || "(empty)"}
Topic Focus: ${topicFocus || "(empty)"}

Please infer the missing fields based on the provided fields. 
Only include the keys for the fields that were originally "(empty)".
Keep the inferred values concise (1-5 words).` }
    ],
    response_format: zodResponseFormat(AutoPopulateSchema, "auto_populate"),
  });

  const text = response.choices[0].message.content || "{}";
  return JSON.parse(text);
}

const MatrixItemSchema = z.object({
  text: z.string(),
  isHighlyUnique: z.boolean().describe("Set to true ONLY if this insight is extremely unique to this specific audience/group when compared against a baseline audience of the same average age, race/ethnicity, and gender breakdown, but OUTSIDE of the specific brand, industry, or topic being analyzed."),
  sourceType: z.string().describe("The type of source this insight was derived from (e.g., 'Mainstream', 'Niche/Fringe', 'Topic-Specific', 'Alternative Media', 'Academic', 'Social Media', etc.)"),
  confidenceLevel: z.enum(['low', 'medium', 'high']).describe("Confidence in this specific insight based on evidence quality and recency. Use 'high' when strongly corroborated by reliable recent sources, 'medium' when plausible with partial support, and 'low' when signal is weak or emerging."),
  isFromDocument: z.boolean().nullable().describe("Set to true if this insight was derived from the attached documents.")
});

const SourceSchema = z.object({
  title: z.string(),
  url: z.string()
});

const CulturalMatrixSchema = z.object({
  demographics: z.object({
    age: z.string(),
    race: z.string(),
    gender: z.string()
  }),
  moments: z.array(MatrixItemSchema),
  beliefs: z.array(MatrixItemSchema),
  tone: z.array(MatrixItemSchema),
  language: z.array(MatrixItemSchema),
  behaviors: z.array(MatrixItemSchema),
  contradictions: z.array(MatrixItemSchema),
  community: z.array(MatrixItemSchema),
  influencers: z.array(MatrixItemSchema),
  sources: z.array(SourceSchema)
});

export async function generateCulturalMatrix(audience: string, brand?: string, generations?: string[], topicFocus?: string, files?: UploadedFile[], sourcesType?: string[]): Promise<CulturalMatrix> {
  const contextStr = brand ? ` in the context of the brand/category: "${brand}"` : "";
  const topicStr = topicFocus ? `\n\nCRITICAL: You MUST focus all your insights specifically on the topic of "${topicFocus}". Only show results relevant to this topic.` : "";
  const generationStr = generations && generations.length > 0
    ? `\n\nCRITICAL: You MUST restrict your research and insights ONLY to the following generations: ${generations.join(', ')}.`
    : "";
  const filesStr = files && files.length > 0
    ? `\n\nI have attached some documents. Please use the information from these documents to help generate the results, in addition to your general knowledge and internet search. If an insight is derived from the attached documents, please set isFromDocument to true.`
    : "";
  const sourcesTypeStr = sourcesType && sourcesType.length > 0
    ? `\n\nCRITICAL: You MUST restrict your sources and insights to be derived primarily from ${sourcesType.join(', ')} sources. Adjust your tone, findings, and the specific cultural signals you highlight to reflect the unique perspective, narratives, and biases of these media types.`
    : "";

  const systemInstruction = `You are an expert cultural strategist and marketer. Your goal is to provide deep, accurate, and actionable cultural insights for the requested audience based on recent data. Highlight results that are extremely unique to this audience by setting isHighlyUnique to true (comparing them against demographic peers who are NOT involved in this specific brand, industry, or topic).

${RESEARCH_ACCURACY_PROTOCOL}`;

  const prompt = `Generate a comprehensive cultural archeologist report for the following audience: "${audience}"${contextStr}.${topicStr}${generationStr}${filesStr}${sourcesTypeStr}
    
    Ensure the research and context are recent (from the last couple of years, 2024-2026).
    CRITICAL: For each category, provide at least 6-10 highly detailed and specific insights to ensure a rich and comprehensive report.
    CRITICAL: Within each category, you MUST order the observations by "potency" (i.e., the frequency and strength of the cultural signal), with the most potent observations first.
    CRITICAL: You are acting as a senior marketing strategist. The ideas and insights you bring MUST be new, exciting, contrarian, and something the client has likely never heard before. Avoid mainstream consensus and obvious observations. Focus on "weak signals", emerging fringe behaviors, counter-intuitive trends, and deep psychological drivers that are not widely discussed.
    CRITICAL: Each insight must include confidenceLevel = low | medium | high based on evidence quality and recency.
    
    Categorize the insights into:
    - MOMENTS: Context of the time. What external forces are shaping behaviour right now? (Current events, Social climate, Trends)
    - BELIEFS: What they believe. What external forces are shaping behaviour right now? (Beliefs, Values, Myths, Perceptions)
    - TONE: What they feel and how they feel that is unique (Attitude, Emotions, Personality, Outlook)
    - LANGUAGE: How they communicate (Vernacular, Symbols, Codes, Visuals)
    - BEHAVIORS: How they act/interact. What signals, symbols, or rituals carry meaning? (Actions, Customs, Rituals, Ceremonies)
    - CONTRADICTIONS: What tensions or shifts are emerging in values or behaviors?
    - COMMUNITY: Who do people look to for identity or belonging?
    - INFLUENCERS: People who are shaping their beliefs & behavior.
    
    Also provide a rough demographic breakdown (age, race, gender) for this audience in the context of the brand/category.`;

  // Note: Azure OpenAI does not have a built-in "googleSearch" tool like Gemini.
  // To achieve similar web-grounding, you would need to implement an external search tool
  // (like Bing Search API) and use OpenAI's function calling to fetch results.
  // For this template, we rely on the model's internal knowledge.

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemInstruction },
    { role: "user", content: prompt }
  ];

  // Add file contents if any (Azure OpenAI supports base64 images, but for documents, 
  // you typically extract text and append it to the prompt)
  if (files && files.length > 0) {
    const fileContents = files.map(f => `File: ${f.name}\nContent: ${f.data}`).join("\n\n");
    messages.push({ role: "user", content: `Attached Documents:\n${fileContents}` });
  }

  const response = await getAzureAI().chat.completions.create({
    model: getDeploymentName(),
    messages: messages,
    response_format: zodResponseFormat(CulturalMatrixSchema, "cultural_matrix"),
  });

  const draftText = response.choices[0].message.content;
  if (!draftText) {
    throw new Error("No response from Azure OpenAI");
  }

  // Chain of Thought Verification / Self-Critique Step
  const reviewPrompt = `You are an expert cultural researcher and fact-checker. Review the following draft cultural archeologist report for the audience: "${audience}"${contextStr}.${topicStr}${generationStr}${sourcesTypeStr}

Draft Report:
${draftText}

Your task is to:
1. Fact-check the sources. Remove any dead links or hallucinated URLs.
2. Ensure the insights are highly accurate, potent, and specific to the audience.
3. Verify that the insights and sources strongly align with the requested source type (${sourcesType && sourcesType.length > 0 ? sourcesType.join(', ') : 'any'}).
4. Refine the language to be professional and insightful.
5. Return the final, verified report in the exact same JSON format.

Do not include any commentary outside the JSON structure.`;

  const finalResponse = await getAzureAI().chat.completions.create({
    model: getDeploymentName(),
    messages: [
      { role: "system", content: systemInstruction },
      { role: "user", content: reviewPrompt }
    ],
    response_format: zodResponseFormat(CulturalMatrixSchema, "cultural_matrix"),
  });

  const finalText = finalResponse.choices[0].message.content;
  if (!finalText) {
    throw new Error("No response from Azure OpenAI during review step");
  }

  return sanitizeCulturalMatrix(JSON.parse(finalText) as CulturalMatrix);
}

// Re-export types for convenience
export type { CulturalMatrix, MatrixItem, UploadedFile, DeepDiveReport } from "./ai";
