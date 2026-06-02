import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminPage from './AdminPage';

const { supabaseFrom } = vi.hoisted(() => ({
  supabaseFrom: vi.fn(),
}));

const { exportElementRefToPptx, exportElementRefToPdf, withVisualExportErrorHandling } = vi.hoisted(() => ({
  exportElementRefToPptx: vi.fn(async () => {}),
  exportElementRefToPdf: vi.fn(async () => {}),
  withVisualExportErrorHandling: vi.fn(async (_taskName: string, fn: () => Promise<void>) => fn()),
}));

const makeBuilder = (tableName: string) => {
  const state: { eqId: string | null } = { eqId: null };
  const builder: any = {
    select: vi.fn(() => builder),
    order: vi.fn(() => builder),
    eq: vi.fn((_column: string, value: string) => {
      state.eqId = String(value);
      return builder;
    }),
    limit: vi.fn(async () => {
      if (tableName === 'Brand_Navigator') {
        if (state.eqId) {
          if (state.eqId === 'bn-1') {
            return {
              data: [
                {
                  id: 'bn-1',
                  created_at: '2026-06-01T10:00:00.000Z',
                  custom_name: 'Nike vs Adidas Snapshot',
                  matrix: {
                    analysisObjective: 'Compare market positioning',
                    ecosystemMethod: 'test method',
                    results: [
                      {
                        brandName: 'Nike',
                        highLevelSummary: '[KNOWN] Sportswear leader.',
                        brandMission: '[INFERRED] Bring inspiration and innovation.',
                        brandPositioning: {
                          taglines: ['[KNOWN] Just Do It'],
                          keyMessagesAndClaims: ['Performance first'],
                          valueProposition: 'Athlete-first innovation',
                          voiceAndTone: 'Bold',
                        },
                        keyOfferingsProductsServices: ['Footwear'],
                        strategicMoatsStrengths: ['Scale'],
                        potentialThreatsWeaknesses: ['Price pressure'],
                        targetAudiences: [],
                        recentCampaigns: ['Winning Isn\'t for Everyone'],
                        keyMarketingChannels: ['Social'],
                        socialMediaChannels: [],
                        recentNews: [],
                        sources: [{ title: 'Nike newsroom', url: 'https://news.nike.com' }],
                      },
                    ],
                    sources: [{ title: 'Reuters', url: 'https://www.reuters.com' }],
                  },
                },
              ],
              error: null,
            };
          }
          return { data: [], error: null };
        }

        return {
          data: [
            {
              id: 'bn-1',
              created_at: '2026-06-01T10:00:00.000Z',
              custom_name: 'Nike vs Adidas Snapshot',
              matrix: {
                analysisObjective: 'Compare market positioning',
                ecosystemMethod: 'test method',
                results: [],
                sources: [],
              },
            },
          ],
          error: null,
        };
      }

      return { data: null, error: { message: 'table missing' } };
    }),
  };

  return builder;
};

vi.mock('../services/supabase-client', () => ({
  supabase: {
    from: supabaseFrom.mockImplementation((tableName: string) => makeBuilder(tableName)),
  },
}));

vi.mock('../services/visual-export', () => ({
  exportElementRefToPptx,
  exportElementRefToPdf,
  withVisualExportErrorHandling,
}));

describe('AdminPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defaults report type to Cultural Archaeologist', async () => {
    render(<AdminPage />);

    const modeSelect = await screen.findByTestId('admin-mode-select');
    expect(modeSelect).toHaveValue('cultural');
  });

  it('keeps the pasted JSON option collapsed by default and expands on toggle', async () => {
    render(<AdminPage />);

    const toggle = await screen.findByTestId('admin-json-toggle-button');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('admin-json-row-input')).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByTestId('admin-json-row-input')).toBeInTheDocument();
  });

  it('loads project dropdown options and renders report preview by id', async () => {
    render(<AdminPage />);

    const modeSelect = await screen.findByTestId('admin-mode-select');
    fireEvent.change(modeSelect, { target: { value: 'brand' } });

    await waitFor(() => {
      expect(screen.getByTestId('admin-project-select')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('admin-project-select'), { target: { value: 'bn-1' } });
    expect(await screen.findByTestId('admin-report-preview')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('admin-row-id-input'), { target: { value: 'bn-1' } });
    fireEvent.click(screen.getByTestId('admin-load-by-id-button'));

    expect(await screen.findByText('Nike')).toBeInTheDocument();
    expect(await screen.findByText('High-level summary')).toBeInTheDocument();
    expect((await screen.findAllByTestId('admin-evidence-chip-known')).length).toBeGreaterThan(0);
    expect((await screen.findAllByTestId('admin-evidence-chip-inferred')).length).toBeGreaterThan(0);
    expect(await screen.findByText('Nike newsroom')).toBeInTheDocument();
  });

  it('renders pasted JSON rows directly into report preview', async () => {
    render(<AdminPage />);

    fireEvent.change(screen.getByTestId('admin-mode-select'), { target: { value: 'design' } });
    fireEvent.click(screen.getByTestId('admin-json-toggle-button'));
    fireEvent.change(screen.getByTestId('admin-json-row-input'), {
      target: {
        value: JSON.stringify({
          id: 'dx-1',
          report: {
            analysisObjective: 'Visual compare',
            ecosystemMethod: 'test',
            brandProfiles: [
              {
                brandName: 'Apple',
                website: 'https://apple.com',
                sampleVisuals: [],
                logo: {
                  mainLogo: 'Wordmark + symbol',
                  logoVariations: [],
                  wordmarkLogotype: 'Apple wordmark',
                  symbolsIcons: ['Apple icon'],
                },
                colorPalette: {
                  primaryColors: [{ name: 'Black', hex: '#000000' }],
                  secondaryAccentColors: [],
                  neutrals: [{ name: 'White', hex: '#FFFFFF' }],
                },
                typography: {
                  fontFamilies: ['SF Pro'],
                  hierarchy: { h1: 'Bold', h2: 'Semibold', body: 'Regular' },
                  usageRules: [],
                },
                supportingVisualElements: {
                  imageryStyle: ['[SPECULATIVE] Product-first'],
                  icons: [],
                  patternsTextures: [],
                  shapes: [],
                  dataVisualization: [],
                },
                consistencyAssessment: 'Consistent',
                distinctivenessAssessment: 'High',
                sources: [],
              },
            ],
            crossBrandReadout: ['Minimalism wins'],
            strategicRecommendations: ['[SPECULATIVE] Keep product-led visual system'],
            sources: [],
          },
        }),
      },
    });

    fireEvent.click(screen.getByTestId('admin-render-json-button'));

    expect(await screen.findByTestId('admin-report-preview')).toBeInTheDocument();
    expect(await screen.findByText('Apple')).toBeInTheDocument();
    expect(await screen.findByText('Logos & Visuals')).toBeInTheDocument();
    expect((await screen.findAllByTestId('admin-evidence-chip-speculative')).length).toBeGreaterThan(0);
  });

  it('shows PDF and PPTX export buttons when a valid preview is loaded', async () => {
    render(<AdminPage />);

    fireEvent.change(screen.getByTestId('admin-mode-select'), { target: { value: 'design' } });
    fireEvent.click(screen.getByTestId('admin-json-toggle-button'));
    fireEvent.change(screen.getByTestId('admin-json-row-input'), {
      target: {
        value: JSON.stringify({
          id: 'dx-export-1',
          report: {
            analysisObjective: 'Visual compare',
            ecosystemMethod: 'test',
            brandProfiles: [
              {
                brandName: 'Apple',
                website: 'https://apple.com',
                sampleVisuals: [],
                logo: {
                  mainLogo: 'Wordmark + symbol',
                  logoVariations: [],
                  wordmarkLogotype: 'Apple wordmark',
                  symbolsIcons: ['Apple icon'],
                },
                colorPalette: {
                  primaryColors: [{ name: 'Black', hex: '#000000' }],
                  secondaryAccentColors: [],
                  neutrals: [{ name: 'White', hex: '#FFFFFF' }],
                },
                typography: {
                  fontFamilies: ['SF Pro'],
                  hierarchy: { h1: 'Bold', h2: 'Semibold', body: 'Regular' },
                  usageRules: [],
                },
                supportingVisualElements: {
                  imageryStyle: ['Product-first'],
                  icons: [],
                  patternsTextures: [],
                  shapes: [],
                  dataVisualization: [],
                },
                consistencyAssessment: 'Consistent',
                distinctivenessAssessment: 'High',
                sources: [],
              },
            ],
            crossBrandReadout: ['Minimalism wins'],
            strategicRecommendations: ['Keep product-led visual system'],
            sources: [],
          },
        }),
      },
    });

    fireEvent.click(screen.getByTestId('admin-render-json-button'));

    expect(await screen.findByTestId('admin-report-preview')).toBeInTheDocument();
    expect(await screen.findByTestId('admin-export-pptx-button')).toBeInTheDocument();
    expect(await screen.findByTestId('admin-export-pdf-button')).toBeInTheDocument();
  });

  it('renders cultural observation deep dives when they exist in the row payload', async () => {
    render(<AdminPage />);

    fireEvent.change(screen.getByTestId('admin-mode-select'), { target: { value: 'cultural' } });
    fireEvent.click(screen.getByTestId('admin-json-toggle-button'));
    fireEvent.change(screen.getByTestId('admin-json-row-input'), {
      target: {
        value: JSON.stringify({
          id: 'ca-1',
          matrix: {
            demographics: {
              age: '[KNOWN] 18-34',
              race: 'Multi-ethnic urban',
              gender: 'Women and non-binary skew',
            },
            sociological_analysis: '[KNOWN] Fast-moving trend adaptation with identity signaling.',
            moments: [
              {
                text: '[KNOWN] They adopt visual signals from niche communities quickly.',
                isHighlyUnique: true,
                sourceType: 'Reddit',
                confidenceLevel: 'high',
                trendLifecycle: 'emerging',
                deepDive: {
                  originationDate: '2026-05-11',
                  relevance: '[INFERRED] Useful for launch timing and creator seeding strategy.',
                  expandedContext: '[KNOWN] This pattern is anchored in social proof loops and platform-native style remixing.',
                  strategicImplications: ['[SPECULATIVE] Seed early with micro-creator capsules before mass rollout.'],
                  realWorldExamples: ['[KNOWN] Sneaker customization threads become purchase intent accelerators.'],
                  sources: [{ title: 'Reddit trend thread', url: 'https://www.reddit.com/r/streetwear/' }],
                },
              },
            ],
            beliefs: [],
            tone: [],
            language: [],
            behaviors: [],
            contradictions: [],
            community: [],
            influencers: [],
            sources: [{ title: 'Trend report', url: 'https://example.com/trend' }],
          },
        }),
      },
    });

    fireEvent.click(screen.getByTestId('admin-render-json-button'));

    const deepDiveDetails = await screen.findByTestId('admin-cultural-deep-dive-collapsible-cultural-moments-0');
    expect(deepDiveDetails).not.toHaveAttribute('open');
    expect(await screen.findByText('Insight Deep Dive')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('admin-cultural-deep-dive-toggle-cultural-moments-0'));

    expect(deepDiveDetails).toHaveAttribute('open');
    expect(await screen.findByText('Expanded Context')).toBeInTheDocument();
    expect(await screen.findByText('Strategic Implications')).toBeInTheDocument();
    expect(await screen.findByText('Reddit trend thread')).toBeInTheDocument();
    expect((await screen.findAllByTestId('admin-evidence-chip-speculative')).length).toBeGreaterThan(0);
  });

  it('renders nested legacy cultural payloads from results.matrix', async () => {
    render(<AdminPage />);

    fireEvent.change(screen.getByTestId('admin-mode-select'), { target: { value: 'cultural' } });
    fireEvent.click(screen.getByTestId('admin-json-toggle-button'));
    fireEvent.change(screen.getByTestId('admin-json-row-input'), {
      target: {
        value: JSON.stringify({
          id: 'ca-legacy-1',
          results: {
            matrix: {
              demographics: {
                age: '25-40',
                race: 'Mixed',
                gender: 'Women',
              },
              sociological_analysis: 'Legacy nested payload shape.',
              moments: [
                {
                  text: 'Legacy row insight.',
                  deep_dive: {
                    origination_date: '2025-12-01',
                    relevance: 'Still relevant.',
                    expanded_context: 'Saved under snake_case deep dive keys.',
                    strategic_implications: ['Use legacy-safe parser logic.'],
                    real_world_examples: ['Old row still renders.'],
                    sources: [{ title: 'Archive Source', url: 'https://example.com/archive' }],
                  },
                },
              ],
              beliefs: [],
              tone: [],
              language: [],
              behaviors: [],
              contradictions: [],
              community: [],
              influencers: [],
              sources: [],
            },
          },
        }),
      },
    });

    fireEvent.click(screen.getByTestId('admin-render-json-button'));

    expect(await screen.findByTestId('admin-preview-cultural')).toBeInTheDocument();
    const deepDiveDetails = await screen.findByTestId('admin-cultural-deep-dive-collapsible-cultural-moments-0');
    expect(deepDiveDetails).not.toHaveAttribute('open');

    fireEvent.click(screen.getByTestId('admin-cultural-deep-dive-toggle-cultural-moments-0'));

    expect(await screen.findByText('Expanded Context')).toBeInTheDocument();
    expect(await screen.findByText('Archive Source')).toBeInTheDocument();
  });
});
