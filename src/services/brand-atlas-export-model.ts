import { z } from 'zod';

const HexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

const ThemeSchema = z.object({
  colors: z.object({
    pageBackground: HexColorSchema,
    primary: HexColorSchema,
    secondary: HexColorSchema,
    body: HexColorSchema,
    muted: HexColorSchema,
    accent: HexColorSchema,
  }),
  typography: z.object({
    titleFont: z.string().min(1),
    bodyFont: z.string().min(1),
    titleSizePt: z.number().positive(),
    bodySizePt: z.number().positive(),
    captionSizePt: z.number().positive(),
  }),
  spacing: z.object({
    pageMarginPt: z.number().nonnegative(),
    blockGapPt: z.number().nonnegative(),
    lineGapPt: z.number().nonnegative(),
  }),
});

const TextBlockSchema = z.object({
  type: z.literal('text'),
  text: z.string().min(1),
});

const BulletsBlockSchema = z.object({
  type: z.literal('bullets'),
  title: z.string().optional(),
  items: z.array(z.string().min(1)).min(1),
});

const StatBlockSchema = z.object({
  type: z.literal('stat'),
  label: z.string().min(1),
  value: z.string().min(1),
  support: z.string().optional(),
});

const QuoteBlockSchema = z.object({
  type: z.literal('quote'),
  text: z.string().min(1),
  source: z.string().optional(),
});

const PageBlockSchema = z.discriminatedUnion('type', [
  TextBlockSchema,
  BulletsBlockSchema,
  StatBlockSchema,
  QuoteBlockSchema,
]);

const PageSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  subtitle: z.string().optional(),
  blocks: z.array(PageBlockSchema).min(1),
});

export const BrandAtlasDocumentSchema = z.object({
  version: z.literal('1.0'),
  meta: z.object({
    brand: z.string().min(1),
    audience: z.string().min(1),
    generatedAtIso: z.string().min(1),
    reportTitle: z.string().min(1),
  }),
  theme: ThemeSchema,
  pages: z.array(PageSchema).min(1),
});

export type BrandAtlasDocument = z.infer<typeof BrandAtlasDocumentSchema>;
export type BrandAtlasPage = BrandAtlasDocument['pages'][number];
export type BrandAtlasPageBlock = BrandAtlasPage['blocks'][number];

export const validateBrandAtlasDocument = (value: unknown): BrandAtlasDocument => {
  const parsed = BrandAtlasDocumentSchema.parse(value);
  console.log('[brand-atlas-export] canonical document validated', {
    version: parsed.version,
    pageCount: parsed.pages.length,
    audience: parsed.meta.audience,
  });
  return parsed;
};

export const createGenZMockBrandAtlasDocument = (): BrandAtlasDocument => {
  const doc: BrandAtlasDocument = {
    version: '1.0',
    meta: {
      brand: 'Brand Atlas Demo Brand',
      audience: 'Gen Z',
      generatedAtIso: new Date().toISOString(),
      reportTitle: 'Gen Z Brand Atlas Snapshot',
    },
    theme: {
      colors: {
        pageBackground: '#FFFDF8',
        primary: '#111827',
        secondary: '#334155',
        body: '#1F2937',
        muted: '#64748B',
        accent: '#F43F5E',
      },
      typography: {
        titleFont: 'Helvetica',
        bodyFont: 'Helvetica',
        titleSizePt: 34,
        bodySizePt: 12,
        captionSizePt: 10,
      },
      spacing: {
        pageMarginPt: 36,
        blockGapPt: 14,
        lineGapPt: 4,
      },
    },
    pages: [
      {
        id: 'cover',
        title: 'Gen Z Brand Atlas',
        subtitle: 'Cultural signal map for fast-moving youth behavior',
        blocks: [
          { type: 'text', text: 'Built from a canonical JSON document so PDF and PPTX preserve hierarchy, spacing, and typography.' },
          { type: 'stat', label: 'Confidence', value: 'High', support: 'Cross-source trend alignment in social, commerce, and creator channels.' },
        ],
      },
      {
        id: 'mindset',
        title: 'Audience Mindset',
        subtitle: 'What resonates now',
        blocks: [
          {
            type: 'bullets',
            title: 'Core Themes',
            items: [
              'Hyper-visual storytelling beats text-heavy narratives.',
              'Authenticity and creator transparency outperform polished brand ads.',
              'Micro-communities shape adoption faster than mass campaigns.',
            ],
          },
          { type: 'quote', text: 'If it looks generic, it feels inauthentic.', source: 'Gen Z respondent synthesis' },
        ],
      },
      {
        id: 'creative-system',
        title: 'Creative Direction',
        subtitle: 'Retain look-and-feel in all exports',
        blocks: [
          {
            type: 'bullets',
            title: 'Design Tokens',
            items: [
              'Accent color for calls-to-action and headline underlines.',
              'Consistent type scale mapped to PDF pt and PPTX pt.',
              'Modular card rhythm with fixed spacing tokens.',
            ],
          },
          { type: 'text', text: 'Renderer adapters should only translate primitives, never reinterpret content hierarchy.' },
        ],
      },
      {
        id: 'activation',
        title: 'Activation Playbook',
        subtitle: 'Execution plan',
        blocks: [
          {
            type: 'bullets',
            title: 'Next 30 Days',
            items: [
              'Pilot creator-led launch narrative with 3 short-form concepts.',
              'Ship weekly trend pulse slides auto-generated from canonical JSON.',
              'Run visual regression checks between web, PDF, and PPTX exports.',
            ],
          },
        ],
      },
    ],
  };

  return validateBrandAtlasDocument(doc);
};
