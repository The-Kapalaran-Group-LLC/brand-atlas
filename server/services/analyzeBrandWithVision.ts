import OpenAI from 'openai';
import { z } from 'zod';

type BrandVisionAnalysis = {
  imageryStyle: string[];
  layoutComposition: string;
  lightingAndTone: string;
  distinctivenessAssessment: string;
};

type OpenAIClientLike = {
  chat: {
    completions: {
      create: (payload: unknown) => Promise<any>;
    };
  };
};

const DEFAULT_MODEL = 'gpt-4o';
const MAX_BASE64_IMAGE_CHARS = 8_000_000;

const BrandVisionAnalysisSchema = z.object({
  imageryStyle: z.array(z.string()),
  layoutComposition: z.string(),
  lightingAndTone: z.string(),
  distinctivenessAssessment: z.string(),
}).strict();

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY environment variable.');
  }
  return new OpenAI({ apiKey });
}

function toDataUrl(base64Image: string): string {
  const trimmed = (base64Image || '').trim();
  if (!trimmed) {
    throw new Error('base64Image is required.');
  }
  if (trimmed.startsWith('data:image/')) {
    const commaIndex = trimmed.indexOf(',');
    const payload = commaIndex >= 0 ? trimmed.slice(commaIndex + 1) : '';
    if (!payload) {
      throw new Error('base64Image data URL is missing base64 payload.');
    }
    if (payload.length > MAX_BASE64_IMAGE_CHARS) {
      throw new Error(`base64Image exceeds max supported size (${MAX_BASE64_IMAGE_CHARS} chars).`);
    }
    return trimmed;
  }
  if (trimmed.length > MAX_BASE64_IMAGE_CHARS) {
    throw new Error(`base64Image exceeds max supported size (${MAX_BASE64_IMAGE_CHARS} chars).`);
  }
  return `data:image/jpeg;base64,${trimmed}`;
}

function extractJsonObject(rawContent: string): Record<string, unknown> {
  const trimmed = rawContent.trim();
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      throw new Error('Model returned non-JSON output.');
    }
    const jsonCandidate = trimmed.slice(firstBrace, lastBrace + 1);
    return JSON.parse(jsonCandidate) as Record<string, unknown>;
  }
}

function normalizeAnalysis(payload: Record<string, unknown>): BrandVisionAnalysis {
  const parsed = BrandVisionAnalysisSchema.parse(payload);
  return {
    imageryStyle: parsed.imageryStyle.map((value) => value.trim()).filter(Boolean),
    layoutComposition: parsed.layoutComposition.trim(),
    lightingAndTone: parsed.lightingAndTone.trim(),
    distinctivenessAssessment: parsed.distinctivenessAssessment.trim(),
  };
}

/**
 * Analyze a screenshot with GPT-4o vision and return structured brand strategy output.
 */
export async function analyzeBrandWithVision(
  base64Image: string,
  options: { client?: OpenAIClientLike; model?: string } = {},
): Promise<BrandVisionAnalysis> {
  // Keep API-keyed model calls strictly on the server.
  const imageUrl = toDataUrl(base64Image);
  const model = options.model || DEFAULT_MODEL;
  const client = options.client || getOpenAIClient();

  console.log('[analyze-brand-with-vision] Starting brand vision analysis.', {
    model,
    hasInjectedClient: Boolean(options.client),
    imageUrlPrefix: imageUrl.slice(0, 32),
  });

  try {
    const response = await client.chat.completions.create({
      model,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'You are an expert Brand Strategist.',
            'Analyze the provided website screenshot.',
            'Return valid JSON only with keys:',
            '"imageryStyle" (array of strings),',
            '"layoutComposition" (string),',
            '"lightingAndTone" (string),',
            '"distinctivenessAssessment" (string).',
            'Do not include markdown, explanations, or extra keys.',
          ].join(' '),
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: "Analyze this brand's visual identity based on the screenshot." },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ],
    });

    const content = response?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('Model returned empty response content.');
    }

    const parsed = extractJsonObject(content);
    const normalized = normalizeAnalysis(parsed);

    console.log('[analyze-brand-with-vision] Completed brand vision analysis.', {
      imageryStyleCount: normalized.imageryStyle.length,
      hasLayoutComposition: Boolean(normalized.layoutComposition),
      hasLightingAndTone: Boolean(normalized.lightingAndTone),
      hasDistinctiveness: Boolean(normalized.distinctivenessAssessment),
    });

    return normalized;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown OpenAI vision analysis error';
    console.log('[analyze-brand-with-vision] Vision analysis failed.', { message });
    throw new Error(`Failed to analyze brand screenshot with vision model: ${message}`);
  }
}

export type { BrandVisionAnalysis };
