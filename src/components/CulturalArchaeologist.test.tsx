import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CulturalArchaeologist from './CulturalArchaeologist';

const {
  generateCulturalMatrix,
  suggestBrands,
  askMatrixQuestion,
  generateDeepDive,
  generateDeepDivesBatch,
  generateAudienceSegmentation,
  supabaseFrom,
  supabaseInsert,
  supabaseUpdate,
  supabaseMaybeSingle,
  supabaseEq,
  supabaseLimit,
} = vi.hoisted(() => ({
  generateCulturalMatrix: vi.fn(),
  suggestBrands: vi.fn(),
  askMatrixQuestion: vi.fn(),
  generateDeepDive: vi.fn(),
  generateDeepDivesBatch: vi.fn(),
  generateAudienceSegmentation: vi.fn(),
  supabaseFrom: vi.fn(),
  supabaseInsert: vi.fn(),
  supabaseUpdate: vi.fn(),
  supabaseMaybeSingle: vi.fn(async () => ({ data: { id: 'saved-row-id' }, error: null })),
  supabaseEq: vi.fn(async () => ({ data: null, error: null })),
  supabaseLimit: vi.fn(async () => ({ data: [], error: null })),
}));

vi.mock('../services/azure-openai', () => ({
  generateCulturalMatrix,
  suggestBrands,
  askMatrixQuestion,
  generateDeepDive,
  generateDeepDivesBatch,
  generateAudienceSegmentation,
}));

vi.mock('../services/telemetry', () => ({
  getUserTelemetry: vi.fn().mockResolvedValue({
    device: 'test-device',
    location: 'test-location',
    ip_address: '127.0.0.1',
  }),
}));

vi.mock('../services/supabase-client', () => ({
  supabase: {
    from: supabaseFrom.mockImplementation(() => {
      const builder: any = {};
      builder.select = vi.fn(() => builder);
      builder.order = vi.fn(() => builder);
      builder.limit = supabaseLimit;
      builder.insert = supabaseInsert.mockImplementation(() => builder);
      builder.update = supabaseUpdate.mockImplementation(() => builder);
      builder.maybeSingle = supabaseMaybeSingle;
      builder.delete = vi.fn(() => builder);
      builder.eq = supabaseEq;
      return builder;
    }),
  },
}));

vi.mock('./SplashGrid', () => ({ SplashGrid: () => null }));
vi.mock('./DesignExcavator', () => ({ BrandDeepDivePage: () => null }));
vi.mock('./TrendLifecycleBadge', () => ({ TrendLifecycleBadge: () => null }));
vi.mock('./ProgressiveLoader', () => ({ ProgressiveLoader: () => <span>Loading</span> }));
vi.mock('./Accordion', () => ({ Accordion: () => null }));
vi.mock('./FeedbackChatWidget', () => ({ FeedbackChatWidget: () => null }));
vi.mock('./RecentResultsLibrary', () => ({ RecentResultsLibrary: () => null }));

const mockMatrix = {
  demographics: {
    age: null,
    race: null,
    gender: null,
  },
  sociological_analysis: 'Two paragraph analysis.\n\nSecond paragraph.',
  moments: [
    {
      text: '[KNOWN] First signal',
      isHighlyUnique: false,
      sourceType: 'Mainstream',
      confidenceLevel: 'high' as const,
      trendLifecycle: 'peaking' as const,
    },
  ],
  beliefs: [],
  tone: [],
  language: [],
  behaviors: [],
  contradictions: [],
  community: [],
  influencers: [],
  sources: [{ title: 'Reuters', url: 'https://www.reuters.com/example' }],
};

const incompleteMatrix = {
  demographics: {
    age: null,
    race: null,
    gender: null,
  },
  sociological_analysis: '',
  moments: [],
  beliefs: [],
  tone: [],
  language: [],
  behaviors: [],
  contradictions: [],
  community: [],
  influencers: [],
  sources: [],
};

const SEGMENTATION_WORKSPACE_STORAGE_PREFIX = 'cultural_segmentation_workspace:';

const createSegmentationWorkspaceSnapshot = (overrides: Record<string, unknown> = {}) => ({
  matrix: mockMatrix,
  matrixMeta: {
    audience: 'Gen Z sneaker culture',
    brand: '',
    generations: [],
    topicFocus: '',
    sourcesType: [],
    hasUploadedDocuments: false,
  },
  selectedConfidenceFilters: [],
  selectedEvidenceFilters: [],
  selectedTrendStageFilters: [],
  selectedSourceFilters: [],
  showHighlyUniqueOnly: false,
  createdAt: '2026-05-29T00:00:00.000Z',
  ...overrides,
});

describe('CulturalArchaeologist', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/#cultural-archaeologist');
    window.localStorage.clear();
    vi.clearAllMocks();
    suggestBrands.mockResolvedValue(['Nike', 'Adidas']);
    generateCulturalMatrix.mockResolvedValue(mockMatrix);
    askMatrixQuestion.mockResolvedValue({ answer: 'ok', relevantInsights: [] });
    generateDeepDive.mockResolvedValue({});
    generateDeepDivesBatch.mockResolvedValue([]);
    generateAudienceSegmentation.mockResolvedValue({
      regressionSummary: 'Regression signals show distinct motivation clusters.',
      confidenceNotes: 'Directional segmentation based on cultural signal strength.',
      segments: [
        {
          name: 'Status Signal Chasers',
          archetype: 'Aspirational trend adopters',
          profile: 'Visibility-forward shoppers who seek social proof and novelty.',
          demographicsSnippet: 'Skews 18-29 with multicultural urban concentration and slight women over-index.',
          prevalencePct: 28,
          keySignals: ['Tracks drop culture', 'Shares purchases socially'],
          messagingApproach: 'Lead with scarcity and social currency.',
        },
        {
          name: 'Performance Pragmatists',
          archetype: 'Utility-maximizing planners',
          profile: 'Value measurable comfort, durability, and price-performance.',
          demographicsSnippet: 'Broad 25-44 mix with balanced gender split and suburban household representation.',
          prevalencePct: 24,
          keySignals: ['Compares specs and reviews', 'Waits for strategic buys'],
          messagingApproach: 'Anchor on proof, longevity, and value.',
        },
        {
          name: 'Identity Curators',
          archetype: 'Self-expression seekers',
          profile: 'Use brand choices to communicate niche identity and belonging.',
          demographicsSnippet: 'Younger 18-34 audience with strong creator-economy and women/non-binary participation.',
          prevalencePct: 20,
          keySignals: ['Follows micro-communities', 'Picks symbolic brand codes'],
          messagingApproach: 'Highlight identity language and community affinity.',
        },
        {
          name: 'Ethical Evaluators',
          archetype: 'Values-led decision makers',
          profile: 'Prioritize sustainability and brand transparency.',
          demographicsSnippet: 'Ages 24-40 with educated metro clusters and mixed-gender values-led households.',
          prevalencePct: 16,
          keySignals: ['Researches sourcing practices', 'Penalizes performative claims'],
          messagingApproach: 'Show traceable commitments and accountability.',
        },
      ],
    });
  });

  it('gates admin route behind password popout and unlocks admin console with correct password', async () => {
    window.history.pushState({}, '', '/?home=1#admin');
    render(<CulturalArchaeologist />);

    expect(await screen.findByTestId('admin-password-popout')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('admin-password-popout-input'), {
      target: { value: 'wrong-password' },
    });
    fireEvent.click(screen.getByTestId('admin-password-popout-submit-button'));
    expect(await screen.findByTestId('admin-password-popout-error')).toHaveTextContent('Incorrect password');

    fireEvent.change(screen.getByTestId('admin-password-popout-input'), {
      target: { value: 'brandatlas2026' },
    });
    fireEvent.click(screen.getByTestId('admin-password-popout-submit-button'));

    expect(await screen.findByTestId('admin-console')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByTestId('admin-password-popout')).not.toBeInTheDocument();
    });
  });

  it('shows rerun button only when at least one result filter is selected', async () => {
    render(<CulturalArchaeologist />);

    const audienceInput = await screen.findByPlaceholderText('Primary Audience (Required) *');
    fireEvent.change(audienceInput, { target: { value: 'Gen Z sneaker culture' } });
    fireEvent.click(screen.getByRole('button', { name: /generate insights/i }));

    expect(await screen.findByText(/Results? Filters/i, {}, { timeout: 3000 })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /generate insights/i })).not.toBeDisabled();
    });
    expect(screen.queryByTestId('rerun-analysis-button')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /high/i }));

    expect(await screen.findByTestId('rerun-analysis-button')).toBeInTheDocument();
    expect(supabaseFrom).toHaveBeenCalledWith('Cultural_Archaeologist');
  });

  it('opens segmentation in a new browser tab and persists workspace context', async () => {
    render(<CulturalArchaeologist />);

    const audienceInput = await screen.findByPlaceholderText('Primary Audience (Required) *');
    fireEvent.change(audienceInput, { target: { value: 'Gen Z sneaker culture' } });
    fireEvent.click(screen.getByRole('button', { name: /generate insights/i }));

    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const segmentationButton = await screen.findByTestId('audience-segmentation-button');
    fireEvent.click(segmentationButton);

    expect(await screen.findByTestId('segmentation-password-popout')).toBeInTheDocument();
    expect(openSpy).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId('segmentation-password-popout-input'), {
      target: { value: 'wrong-password' },
    });
    fireEvent.click(screen.getByTestId('segmentation-password-popout-submit-button'));

    expect(await screen.findByText('Incorrect password. Please try again.')).toBeInTheDocument();
    expect(openSpy).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId('segmentation-password-popout-input'), {
      target: { value: 'segment2026' },
    });
    fireEvent.click(screen.getByTestId('segmentation-password-popout-submit-button'));

    expect(openSpy).toHaveBeenCalledTimes(1);
    const [rawUrl, rawTarget] = openSpy.mock.calls[0];
    expect(rawTarget).toBe('_blank');
    const openedUrl = new URL(String(rawUrl), window.location.origin);
    expect(openedUrl.hash).toBe('#cultural-archaeologist');
    const workspaceId = openedUrl.searchParams.get('segmentation_workspace');
    expect(workspaceId).toBeTruthy();
    const persistedWorkspaceRaw = window.localStorage.getItem(
      `${SEGMENTATION_WORKSPACE_STORAGE_PREFIX}${workspaceId}`
    );
    expect(persistedWorkspaceRaw).toBeTruthy();
    const persistedWorkspace = JSON.parse(persistedWorkspaceRaw || '{}');
    expect(persistedWorkspace.matrixMeta?.audience).toBe('Gen Z sneaker culture');
    expect(persistedWorkspace.isSegmentationAuthorized).toBe(true);
    expect(persistedWorkspace.selectedConfidenceFilters).toEqual([]);
    expect(screen.queryByTestId('segmentation-tab-panel')).not.toBeInTheDocument();
    expect(generateAudienceSegmentation).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByTestId('segmentation-password-popout')).not.toBeInTheDocument();
    });
    openSpy.mockRestore();
  });

  it('renders KNOWN/INFERRED/SPECULATIVE markers as evidence chips in workspace segmentation tab', async () => {
    generateAudienceSegmentation.mockResolvedValueOnce({
      regressionSummary: '[KNOWN] Regression signals show distinct motivation clusters.',
      confidenceNotes: '[SPECULATIVE] Directional segmentation based on cultural signal strength.',
      segments: [
        {
          name: 'Status Signal Chasers',
          archetype: '[INFERRED] Aspirational trend adopters',
          profile: '[KNOWN] Visibility-forward shoppers who seek social proof and novelty.',
          demographicsSnippet: '[KNOWN] 18-29, women-leaning, multicultural urban cores.',
          prevalencePct: 28,
          keySignals: ['[KNOWN] Tracks drop culture', '[INFERRED] Shares purchases socially'],
          messagingApproach: '[SPECULATIVE] Lead with scarcity and social currency.',
        },
        {
          name: 'Performance Pragmatists',
          archetype: 'Utility-maximizing planners',
          profile: 'Value measurable comfort, durability, and price-performance.',
          demographicsSnippet: '25-44 balanced gender mix in suburban and hybrid-worker households.',
          prevalencePct: 24,
          keySignals: ['Compares specs and reviews', 'Waits for strategic buys'],
          messagingApproach: 'Anchor on proof, longevity, and value.',
        },
        {
          name: 'Identity Curators',
          archetype: 'Self-expression seekers',
          profile: 'Use brand choices to communicate niche identity and belonging.',
          demographicsSnippet: '18-34, creator-led communities, women/non-binary over-index.',
          prevalencePct: 20,
          keySignals: ['Follows micro-communities', 'Picks symbolic brand codes'],
          messagingApproach: 'Highlight identity language and community affinity.',
        },
        {
          name: 'Ethical Evaluators',
          archetype: 'Values-led decision makers',
          profile: 'Prioritize sustainability and brand transparency.',
          demographicsSnippet: '24-40, college-educated metros, mixed-gender values-led purchasers.',
          prevalencePct: 16,
          keySignals: ['Researches sourcing practices', 'Penalizes performative claims'],
          messagingApproach: 'Show traceable commitments and accountability.',
        },
      ],
    });

    const workspaceId = 'workspace-evidence-chips';
    window.localStorage.setItem(
      `${SEGMENTATION_WORKSPACE_STORAGE_PREFIX}${workspaceId}`,
      JSON.stringify(createSegmentationWorkspaceSnapshot({ isSegmentationAuthorized: true }))
    );
    window.history.pushState({}, '', `/?segmentation_workspace=${workspaceId}#cultural-archaeologist`);

    render(<CulturalArchaeologist />);
    expect(await screen.findByTestId('segmentation-tab-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('segmentation-password-panel')).not.toBeInTheDocument();
    expect(await screen.findByText('Regression signals show distinct motivation clusters.')).toBeInTheDocument();
    expect((await screen.findAllByText('Demographics')).length).toBeGreaterThan(0);
    expect(await screen.findByText('18-29, women-leaning, multicultural urban cores.')).toBeInTheDocument();
    expect((await screen.findAllByTestId('segmentation-evidence-chip-known')).length).toBeGreaterThan(0);
    expect((await screen.findAllByTestId('segmentation-evidence-chip-inferred')).length).toBeGreaterThan(0);
    expect((await screen.findAllByTestId('segmentation-evidence-chip-speculative')).length).toBeGreaterThan(0);
  });

  it('reruns segmentation with current selected filters in workspace segmentation tab', async () => {
    const workspaceId = 'workspace-filter-rerun';
    window.localStorage.setItem(
      `${SEGMENTATION_WORKSPACE_STORAGE_PREFIX}${workspaceId}`,
      JSON.stringify(
        createSegmentationWorkspaceSnapshot({
          isSegmentationAuthorized: true,
          matrix: {
            ...mockMatrix,
            moments: [
              {
                text: '[KNOWN] High confidence signal',
                isHighlyUnique: false,
                sourceType: 'Mainstream',
                confidenceLevel: 'high' as const,
                trendLifecycle: 'peaking' as const,
              },
              {
                text: '[KNOWN] Low confidence signal',
                isHighlyUnique: false,
                sourceType: 'Mainstream',
                confidenceLevel: 'low' as const,
                trendLifecycle: 'emerging' as const,
              },
            ],
          },
        })
      )
    );
    window.history.pushState({}, '', `/?segmentation_workspace=${workspaceId}#cultural-archaeologist`);

    render(<CulturalArchaeologist />);
    expect(await screen.findByTestId('segmentation-tab-panel')).toBeInTheDocument();
    await screen.findByTestId('segmentation-result-state');

    fireEvent.click(screen.getByRole('button', { name: /^high$/i }));
    fireEvent.click(await screen.findByTestId('rerun-segmentation-button'));

    await waitFor(() => {
      expect(generateAudienceSegmentation).toHaveBeenCalledTimes(2);
    });
    const latestMatrixArg = generateAudienceSegmentation.mock.calls[1]?.[0];
    expect(latestMatrixArg?.moments).toHaveLength(1);
    expect(latestMatrixArg?.moments?.[0]?.text).toContain('High confidence signal');
  });

  it('uses Ask the Archaeologist prompt to refine segmentation when segmentation tab is active', async () => {
    const workspaceId = 'workspace-ask-refine-segmentation';
    window.localStorage.setItem(
      `${SEGMENTATION_WORKSPACE_STORAGE_PREFIX}${workspaceId}`,
      JSON.stringify(createSegmentationWorkspaceSnapshot({ isSegmentationAuthorized: true }))
    );
    window.history.pushState({}, '', `/?segmentation_workspace=${workspaceId}#cultural-archaeologist`);

    render(<CulturalArchaeologist />);
    expect(await screen.findByTestId('segmentation-tab-panel')).toBeInTheDocument();
    await screen.findByTestId('segmentation-result-state');

    const askInput = await screen.findByPlaceholderText(/Ask a question about this audience/i);
    fireEvent.change(askInput, { target: { value: 'Refine segments to separate budget-driven shoppers from convenience-driven shoppers.' } });
    fireEvent.click(screen.getByRole('button', { name: /^ask$/i }));

    await waitFor(() => {
      expect(generateAudienceSegmentation).toHaveBeenCalledTimes(2);
    });
    expect(askMatrixQuestion).not.toHaveBeenCalled();

    const latestSegmentationContextArg = generateAudienceSegmentation.mock.calls[1]?.[1];
    expect(latestSegmentationContextArg?.topicFocus).toContain('Segmentation refinement request');
    expect(latestSegmentationContextArg?.topicFocus).toContain('budget-driven shoppers');
  });

  it('shows an Original Segments anchor after Ask refinement and restores the original segmentation when clicked', async () => {
    const workspaceId = 'workspace-segmentation-revert-original';
    generateAudienceSegmentation
      .mockResolvedValueOnce({
        regressionSummary: 'Original segmentation summary.',
        confidenceNotes: 'Original segmentation confidence notes.',
        segments: [
          {
            name: 'Original Segment Alpha',
            archetype: 'Original archetype',
            profile: 'Original profile narrative.',
            demographicsSnippet: 'Original demographic snapshot.',
            prevalencePct: 52,
            keySignals: ['Original signal 1', 'Original signal 2'],
            messagingApproach: 'Original messaging approach.',
          },
        ],
      })
      .mockResolvedValueOnce({
        regressionSummary: 'Refined segmentation summary.',
        confidenceNotes: 'Refined segmentation confidence notes.',
        segments: [
          {
            name: 'Refined Segment Omega',
            archetype: 'Refined archetype',
            profile: 'Refined profile narrative.',
            demographicsSnippet: 'Refined demographic snapshot.',
            prevalencePct: 48,
            keySignals: ['Refined signal 1', 'Refined signal 2'],
            messagingApproach: 'Refined messaging approach.',
          },
        ],
      });

    window.localStorage.setItem(
      `${SEGMENTATION_WORKSPACE_STORAGE_PREFIX}${workspaceId}`,
      JSON.stringify(createSegmentationWorkspaceSnapshot({ isSegmentationAuthorized: true }))
    );
    window.history.pushState({}, '', `/?segmentation_workspace=${workspaceId}#cultural-archaeologist`);

    render(<CulturalArchaeologist />);
    expect(await screen.findByTestId('segmentation-tab-panel')).toBeInTheDocument();
    await screen.findByTestId('segmentation-result-state');
    expect(screen.getByText('Original Segment Alpha')).toBeInTheDocument();
    expect(screen.queryByTestId('segmentation-revert-original-button')).not.toBeInTheDocument();

    const askInput = await screen.findByPlaceholderText(/Ask a question about this audience/i);
    fireEvent.change(askInput, { target: { value: 'Refine for two sharper behavioral cohorts.' } });
    fireEvent.click(screen.getByRole('button', { name: /^ask$/i }));

    await waitFor(() => {
      expect(generateAudienceSegmentation).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText('Refined Segment Omega')).toBeInTheDocument();
    const originalSegmentsButton = await screen.findByTestId('segmentation-revert-original-button');
    expect(originalSegmentsButton).toHaveTextContent(/Original Segments/i);

    fireEvent.click(originalSegmentsButton);

    await waitFor(() => {
      expect(screen.getByText('Original Segment Alpha')).toBeInTheDocument();
    });
    expect(screen.queryByText('Refined Segment Omega')).not.toBeInTheDocument();
    expect(screen.queryByTestId('segmentation-revert-original-button')).not.toBeInTheDocument();
  });

  it('auto-scrolls to the segmentation workspace when a workspace tab opens', async () => {
    const workspaceId = 'workspace-autoscroll';
    window.localStorage.setItem(
      `${SEGMENTATION_WORKSPACE_STORAGE_PREFIX}${workspaceId}`,
      JSON.stringify(createSegmentationWorkspaceSnapshot({ isSegmentationAuthorized: true }))
    );
    window.history.pushState({}, '', `/?segmentation_workspace=${workspaceId}#cultural-archaeologist`);

    const originalScrollIntoView = window.HTMLElement.prototype.scrollIntoView;
    const scrollIntoViewSpy = vi.fn();
    Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: scrollIntoViewSpy,
    });

    try {
      render(<CulturalArchaeologist />);
      expect(await screen.findByTestId('segmentation-tab-panel')).toBeInTheDocument();
      await waitFor(() => {
        expect(scrollIntoViewSpy).toHaveBeenCalled();
      });
    } finally {
      Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        writable: true,
        value: originalScrollIntoView,
      });
    }
  });

  it('filters results to only highly unique observations when the highly unique filter is selected', async () => {
    generateCulturalMatrix.mockResolvedValueOnce({
      ...mockMatrix,
      moments: [
        {
          text: '[KNOWN] Highly unique signal',
          isHighlyUnique: true,
          sourceType: 'Mainstream',
          confidenceLevel: 'high' as const,
          trendLifecycle: 'peaking' as const,
        },
        {
          text: '[KNOWN] General signal',
          isHighlyUnique: false,
          sourceType: 'Mainstream',
          confidenceLevel: 'high' as const,
          trendLifecycle: 'peaking' as const,
        },
      ],
    });

    render(<CulturalArchaeologist />);

    const audienceInput = await screen.findByPlaceholderText('Primary Audience (Required) *');
    fireEvent.change(audienceInput, { target: { value: 'Gen Z sneaker culture' } });
    fireEvent.click(screen.getByRole('button', { name: /generate insights/i }));

    expect(await screen.findByText('Highly unique signal')).toBeInTheDocument();
    expect(await screen.findByText('General signal')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /highly unique observation/i }));

    expect(await screen.findByText('Highly unique signal')).toBeInTheDocument();
    expect(screen.queryByText('General signal')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /highly unique observation/i }));

    expect(await screen.findByText('General signal')).toBeInTheDocument();
  });

  it('shows per-section refresh for incomplete results and reruns a fresh search when clicked', async () => {
    generateCulturalMatrix
      .mockResolvedValueOnce(incompleteMatrix)
      .mockResolvedValueOnce(mockMatrix);

    render(<CulturalArchaeologist />);

    const audienceInput = await screen.findByPlaceholderText('Primary Audience (Required) *');
    fireEvent.change(audienceInput, { target: { value: 'Gen Z sneaker culture' } });
    fireEvent.click(screen.getByRole('button', { name: /generate insights/i }));

    const refreshButton = await screen.findByTestId('matrix-card-refresh-moments');
    await waitFor(() => {
      expect(refreshButton).not.toBeDisabled();
    });
    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(generateCulturalMatrix).toHaveBeenCalledTimes(2);
    });
  });

  it('persists deep dives back into Supabase results JSONB after background generation completes', async () => {
    generateDeepDivesBatch.mockResolvedValueOnce([
      {
        originationDate: '2026-06-02',
        relevance: 'High',
        expandedContext: 'Deep dive context from batch generation.',
        strategicImplications: ['Implication one'],
        realWorldExamples: ['Example one'],
        sources: [{ title: 'Example Source', url: 'https://example.com' }],
      },
    ]);

    render(<CulturalArchaeologist />);

    const audienceInput = await screen.findByPlaceholderText('Primary Audience (Required) *');
    fireEvent.change(audienceInput, { target: { value: 'Gen Z sneaker culture' } });
    fireEvent.click(screen.getByRole('button', { name: /generate insights/i }));

    await waitFor(() => {
      expect(supabaseUpdate).toHaveBeenCalled();
    });

    const latestUpdatePayload = supabaseUpdate.mock.calls.at(-1)?.[0] as { results?: any } | undefined;
    expect(latestUpdatePayload?.results?.moments?.[0]?.deepDive?.expandedContext).toBe(
      'Deep dive context from batch generation.'
    );
    expect(supabaseEq).toHaveBeenCalledWith('id', 'saved-row-id');
  });

  it('renders mobile results navigation for all cultural result sections', async () => {
    render(<CulturalArchaeologist />);

    const audienceInput = await screen.findByPlaceholderText('Primary Audience (Required) *');
    fireEvent.change(audienceInput, { target: { value: 'Gen Z sneaker culture' } });
    fireEvent.click(screen.getByRole('button', { name: /generate insights/i }));

    const mobileResultsNav = await screen.findByTestId('mobile-results-nav-culture');
    expect(mobileResultsNav).toBeInTheDocument();
    expect(within(mobileResultsNav).getByRole('button', { name: 'Audience Q&A' })).toBeInTheDocument();
    expect(within(mobileResultsNav).getByRole('button', { name: 'Demographics' })).toBeInTheDocument();
    expect(within(mobileResultsNav).getByRole('button', { name: 'Filters' })).toBeInTheDocument();
    expect(within(mobileResultsNav).getByRole('button', { name: 'Moments' })).toBeInTheDocument();
    expect(within(mobileResultsNav).getByRole('button', { name: 'Beliefs' })).toBeInTheDocument();
    expect(within(mobileResultsNav).getByRole('button', { name: 'Tone' })).toBeInTheDocument();
    expect(within(mobileResultsNav).getByRole('button', { name: 'Language' })).toBeInTheDocument();
    expect(within(mobileResultsNav).getByRole('button', { name: 'Behaviors' })).toBeInTheDocument();
    expect(within(mobileResultsNav).getByRole('button', { name: 'Contradictions' })).toBeInTheDocument();
    expect(within(mobileResultsNav).getByRole('button', { name: 'Community' })).toBeInTheDocument();
    expect(within(mobileResultsNav).getByRole('button', { name: 'Influencers' })).toBeInTheDocument();
    expect(within(mobileResultsNav).getByRole('button', { name: 'Sources' })).toBeInTheDocument();
  });

  it('renders a Show thinking dropdown for cultural results that is closed by default', async () => {
    render(<CulturalArchaeologist />);

    const audienceInput = await screen.findByPlaceholderText('Primary Audience (Required) *');
    fireEvent.change(audienceInput, { target: { value: 'Gen Z sneaker culture' } });
    fireEvent.click(screen.getByRole('button', { name: /generate insights/i }));

    const showThinkingDetails = await screen.findByTestId('cultural-show-thinking-container');
    expect(showThinkingDetails).not.toHaveAttribute('open');

    fireEvent.click(screen.getByTestId('cultural-show-thinking-summary'));

    expect(showThinkingDetails).toHaveAttribute('open');
    expect(
      screen.getByText('Applied retrieval-grounded synthesis: collected language, behavior, and community artifacts, clustered recurring motifs and tensions, and generated a structured cultural map with source-grounded claims.')
    ).toBeInTheDocument();
  });

  it('uses a mobile hamburger for navigation links and keeps desktop top links at sm+', async () => {
    render(<CulturalArchaeologist />);

    const mobileTopBar = await screen.findByTestId('mobile-top-bar');
    expect(mobileTopBar.className).toContain('fixed');
    expect(mobileTopBar.className).toContain('top-0');
    expect(mobileTopBar.className).toContain('translate-y-0');
    expect(within(mobileTopBar).getByText('Cultural Archaeologist')).toBeInTheDocument();
    const mobileTitle = within(mobileTopBar).getByTestId('mobile-page-title');
    const mobileIcon = within(mobileTopBar).getByTestId('mobile-page-icon');
    const mobileHeading = within(mobileTopBar).getByTestId('mobile-page-heading');
    expect(mobileHeading.className).toContain('ml-auto');
    expect(mobileHeading.className).toContain('justify-end');
    expect(mobileTitle.className).toContain('text-right');
    expect(Boolean(mobileTitle.compareDocumentPosition(mobileIcon) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(screen.getByTestId('mobile-page-subcopy')).toHaveTextContent('Deep dive into any culture or audience.');

    const mobileNavTrigger = await screen.findByTestId('mobile-nav-trigger');
    const actionContainer = await screen.findByTestId('top-action-buttons');
    expect(actionContainer.className).toContain('hidden');
    expect(actionContainer.className).toContain('sm:flex-row');
    expect(actionContainer.className).toContain('left-auto');

    Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: 180 });
    fireEvent.scroll(window);
    expect(mobileTopBar.className).toContain('-translate-y-full');

    Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: 40 });
    fireEvent.scroll(window);
    expect(mobileTopBar.className).toContain('translate-y-0');

    fireEvent.click(mobileNavTrigger);

    const mobileMenu = await screen.findByTestId('mobile-nav-menu');
    expect(mobileMenu.className).toContain('fixed');
    expect(mobileMenu.className).toContain('top-16');
    expect(mobileMenu.className).toContain('left-4');
    expect(mobileMenu.className).toContain('right-4');
    expect(within(mobileMenu).getByRole('link', { name: /back to home/i })).toHaveAttribute('href', '/?home=1');
    expect(within(mobileMenu).getByRole('link', { name: /brand navigator/i })).toHaveAttribute('href', '/#brand-navigator');
    expect(within(mobileMenu).getByRole('link', { name: /design excavator/i })).toHaveAttribute('href', '/#design-excavator');

    expect(within(actionContainer).getByRole('link', { name: /brand navigator/i })).toHaveAttribute('href', '/#brand-navigator');
    expect(within(actionContainer).getByRole('link', { name: /design excavator/i })).toHaveAttribute('href', '/#design-excavator');
  });

  it('renders mobile New Search as an icon button to the right of generate insights', async () => {
    render(<CulturalArchaeologist />);
    const generateButton = await screen.findByRole('button', { name: /generate insights/i });
    const newSearchButton = screen.getByTestId('new-search-below-generate');
    expect(newSearchButton).toHaveAccessibleName(/new search/i);
    expect(newSearchButton.className).toContain('sm:hidden');
    expect(Boolean(generateButton.compareDocumentPosition(newSearchButton) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  it('reruns analysis with active filter constraints while keeping current filter behavior', async () => {
    generateCulturalMatrix
      .mockResolvedValueOnce(mockMatrix)
      .mockResolvedValueOnce({
        ...mockMatrix,
        moments: [
          {
            text: '[KNOWN] New signal from rerun',
            isHighlyUnique: false,
            sourceType: 'Mainstream',
            confidenceLevel: 'high' as const,
            trendLifecycle: 'peaking' as const,
          },
        ],
      });

    render(<CulturalArchaeologist />);

    const audienceInput = await screen.findByPlaceholderText('Primary Audience (Required) *');
    fireEvent.change(audienceInput, { target: { value: 'Gen Z sneaker culture' } });
    fireEvent.click(screen.getByRole('button', { name: /generate insights/i }));

    expect(await screen.findByText(/Results? Filters/i, {}, { timeout: 3000 })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /generate insights/i })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole('button', { name: /high/i }));
    fireEvent.click(screen.getByRole('button', { name: /known/i }));

    const rerunButton = await screen.findByTestId('rerun-analysis-button');
    expect(rerunButton).not.toBeDisabled();
    fireEvent.click(rerunButton);

    await waitFor(() => {
      expect(generateCulturalMatrix).toHaveBeenCalledTimes(2);
    });

    expect(await screen.findByText('First signal')).toBeInTheDocument();
    expect(await screen.findByText('New signal from rerun')).toBeInTheDocument();

    expect(generateCulturalMatrix).toHaveBeenNthCalledWith(
      2,
      'Gen Z sneaker culture',
      '',
      [],
      '',
      [],
      [],
      {
        confidenceLevels: ['high'],
        evidenceTypes: ['known'],
        trendStages: [],
        sourceTypes: [],
      }
    );
  });

  it('renders demographic cards from known and inferred values', async () => {
    generateCulturalMatrix.mockResolvedValueOnce({
      ...mockMatrix,
      demographics: {
        age: '[KNOWN] 18-34',
        race: '[INFERRED] Multi-ethnic urban cohorts',
        gender: '[INFERRED] Women and non-binary skew',
      },
    });

    render(<CulturalArchaeologist />);

    const audienceInput = await screen.findByPlaceholderText('Primary Audience (Required) *');
    fireEvent.change(audienceInput, { target: { value: 'Gen Z sneaker culture' } });
    fireEvent.click(screen.getByRole('button', { name: /generate insights/i }));

    await screen.findByText('Average Age', {}, { timeout: 3000 });
    expect(await screen.findByText('18-34', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText('Multi-ethnic urban cohorts')).toBeInTheDocument();
    expect(screen.getByText('Women and non-binary skew')).toBeInTheDocument();
  });

  it('shows demographic fallback copy when fields are null', async () => {
    generateCulturalMatrix.mockResolvedValueOnce({
      ...mockMatrix,
      demographics: {
        age: null,
        race: null,
        gender: null,
      },
    });

    render(<CulturalArchaeologist />);

    const audienceInput = await screen.findByPlaceholderText('Primary Audience (Required) *');
    fireEvent.change(audienceInput, { target: { value: 'Gen Z sneaker culture' } });
    fireEvent.click(screen.getByRole('button', { name: /generate insights/i }));

    expect(await screen.findByText('Average Age', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText('Race / Ethnicity')).toBeInTheDocument();
    expect(screen.getByText('Gender')).toBeInTheDocument();
    expect(screen.getAllByText('Data unavailable')).toHaveLength(3);
  });

  it('preserves existing demographics when rerun returns blanks', async () => {
    generateCulturalMatrix
      .mockResolvedValueOnce({
        ...mockMatrix,
        demographics: {
          age: '[KNOWN] 18-34',
          race: '[INFERRED] Multi-ethnic urban cohorts',
          gender: '[INFERRED] Women and non-binary skew',
        },
      })
      .mockResolvedValueOnce({
        ...mockMatrix,
        demographics: {
          age: '[KNOWN] 25-44',
          race: '[INFERRED] Suburban white-majority cohorts',
          gender: '[INFERRED] Men skew',
        },
        moments: [
          {
            text: '[KNOWN] New signal from rerun',
            isHighlyUnique: false,
            sourceType: 'Mainstream',
            confidenceLevel: 'high' as const,
            trendLifecycle: 'peaking' as const,
          },
        ],
      });

    render(<CulturalArchaeologist />);

    const audienceInput = await screen.findByPlaceholderText('Primary Audience (Required) *');
    fireEvent.change(audienceInput, { target: { value: 'Gen Z sneaker culture' } });
    fireEvent.click(screen.getByRole('button', { name: /generate insights/i }));

    expect(await screen.findByText(/Results? Filters/i, {}, { timeout: 3000 })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /generate insights/i })).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole('button', { name: /high/i }));
    fireEvent.click(screen.getByRole('button', { name: /known/i }));

    const rerunButton = await screen.findByTestId('rerun-analysis-button');
    expect(rerunButton).not.toBeDisabled();
    fireEvent.click(rerunButton);

    await waitFor(() => {
      expect(generateCulturalMatrix).toHaveBeenCalledTimes(2);
    });

    expect(screen.getByText('18-34')).toBeInTheDocument();
    expect(screen.getByText('Multi-ethnic urban cohorts')).toBeInTheDocument();
    expect(screen.getByText('Women and non-binary skew')).toBeInTheDocument();
  });

  it('uses dynamic masonry-style layout for matrix cards so expanded cards can reflow without row gaps', async () => {
    render(<CulturalArchaeologist />);

    const audienceInput = await screen.findByPlaceholderText('Primary Audience (Required) *');
    fireEvent.change(audienceInput, { target: { value: 'Gen Z sneaker culture' } });
    fireEvent.click(screen.getByRole('button', { name: /generate insights/i }));

    const layout = await screen.findByTestId('matrix-cards-layout');
    expect(layout.className).toContain('columns-1');
    expect(layout.className).toContain('md:columns-2');
    expect(layout.className).toContain('lg:columns-3');
    expect(layout.className).not.toContain('grid-cols-1');
  });

  it('uses a wrapping brand chip input shell like Brand Navigator', () => {
    render(<CulturalArchaeologist />);

    const shell = screen.getByTestId('cultural-brands-input-shell');
    expect(shell.className).toContain('flex-wrap');
    expect(shell.className).toContain('min-h-14');
  });

  it('uses the same show-all button text/icon size and color as Brand Navigator', async () => {
    generateCulturalMatrix.mockResolvedValueOnce({
      ...mockMatrix,
      moments: [
        { text: '[KNOWN] First signal', isHighlyUnique: false, sourceType: 'Mainstream', confidenceLevel: 'high' as const, trendLifecycle: 'peaking' as const },
        { text: '[KNOWN] Second signal', isHighlyUnique: false, sourceType: 'Mainstream', confidenceLevel: 'high' as const, trendLifecycle: 'peaking' as const },
        { text: '[KNOWN] Third signal', isHighlyUnique: false, sourceType: 'Mainstream', confidenceLevel: 'high' as const, trendLifecycle: 'peaking' as const },
        { text: '[KNOWN] Fourth signal', isHighlyUnique: false, sourceType: 'Mainstream', confidenceLevel: 'high' as const, trendLifecycle: 'peaking' as const },
        { text: '[KNOWN] Fifth signal', isHighlyUnique: false, sourceType: 'Mainstream', confidenceLevel: 'high' as const, trendLifecycle: 'peaking' as const },
      ],
    });

    render(<CulturalArchaeologist />);

    const audienceInput = await screen.findByPlaceholderText('Primary Audience (Required) *');
    fireEvent.change(audienceInput, { target: { value: 'Gen Z sneaker culture' } });
    fireEvent.click(screen.getByRole('button', { name: /generate insights/i }));

    await screen.findByText('First signal', {}, { timeout: 3000 });
    const showAllBtn = await screen.findByRole('button', { name: /show all 5 items/i }, { timeout: 3000 });
    expect(showAllBtn.className).toContain('text-sm');
    expect(showAllBtn.className).toContain('text-indigo-600');
    const showAllChevron = showAllBtn.querySelector('svg');
    expect(showAllChevron?.className.baseVal ?? '').toContain('w-4 h-4');
  });

  it('keeps demographics visible when result filters narrow or remove visible insights', async () => {
    generateCulturalMatrix.mockResolvedValueOnce({
      ...mockMatrix,
      demographics: {
        age: '[KNOWN] 18-34',
        race: '[INFERRED] Multi-ethnic urban cohorts',
        gender: '[INFERRED] Women and non-binary skew',
      },
      moments: [
        {
          text: '[KNOWN] First signal',
          isHighlyUnique: false,
          sourceType: 'Mainstream',
          confidenceLevel: 'high' as const,
          trendLifecycle: 'peaking' as const,
        },
      ],
    });

    render(<CulturalArchaeologist />);

    const audienceInput = await screen.findByPlaceholderText('Primary Audience (Required) *');
    fireEvent.change(audienceInput, { target: { value: 'Gen Z sneaker culture' } });
    fireEvent.click(screen.getByRole('button', { name: /generate insights/i }));

    await screen.findByText('Average Age', {}, { timeout: 3000 });
    expect(await screen.findByText('18-34', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText('Multi-ethnic urban cohorts')).toBeInTheDocument();
    expect(screen.getByText('Women and non-binary skew')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /declining/i }));
    expect(await screen.findByText(/No insights match the selected filters/i)).toBeInTheDocument();

    expect(screen.getByText('18-34')).toBeInTheDocument();
    expect(screen.getByText('Multi-ethnic urban cohorts')).toBeInTheDocument();
    expect(screen.getByText('Women and non-binary skew')).toBeInTheDocument();
  });

  it('renders evidence type chips in deep-dive strategic implications', async () => {
    generateCulturalMatrix.mockResolvedValueOnce({
      ...mockMatrix,
      moments: [
        {
          text: 'First signal',
          isHighlyUnique: false,
          sourceType: 'Mainstream',
          confidenceLevel: 'high' as const,
          trendLifecycle: 'peaking' as const,
        },
      ],
    });
    generateDeepDive.mockResolvedValueOnce({
      originationDate: '2026-05-11',
      relevance: 'High relevance to current market shifts.',
      expandedContext: '[KNOWN] Expanded context detail',
      strategicImplications: [
        '[KNOWN] Product and brand messaging should separate augmentation from substitution clearly.',
        '[INFERRED] Creative tooling preferences suggest appetite for guided automation experiences.',
        '[SPECULATIVE] Regulatory shifts could force a faster move toward transparent model disclosures.',
      ],
      realWorldExamples: ['[INFERRED] Example detail'],
      sources: [{ title: 'Reuters', url: 'https://www.reuters.com/example' }],
    });

    render(<CulturalArchaeologist />);

    const audienceInput = await screen.findByPlaceholderText('Primary Audience (Required) *');
    fireEvent.change(audienceInput, { target: { value: 'Gen Z sneaker culture' } });
    fireEvent.click(screen.getByRole('button', { name: /generate insights/i }));

    const deepDiveButton = await screen.findByTitle('Generate Deep Dive');
    fireEvent.click(deepDiveButton);

    const strategicHeading = await screen.findByText('Strategic Implications');
    const strategicSection = strategicHeading.closest('section');
    expect(strategicSection).not.toBeNull();
    expect(screen.getByText('Product and brand messaging should separate augmentation from substitution clearly.')).toBeInTheDocument();
    expect(screen.queryByText(/\[KNOWN\]|\[INFERRED\]|\[SPECULATIVE\]/i)).not.toBeInTheDocument();
    expect(within(strategicSection as HTMLElement).getAllByText(/^known$/i).length).toBeGreaterThan(0);
    expect(within(strategicSection as HTMLElement).getAllByText(/^inferred$/i).length).toBeGreaterThan(0);
    expect(within(strategicSection as HTMLElement).getAllByText(/^speculative$/i).length).toBeGreaterThan(0);
  });

  it('attaches ask-answer evidence chips to the specific sentence they belong to', async () => {
    askMatrixQuestion.mockResolvedValueOnce({
      answer: '[KNOWN] Gen Z is using AI pragmatically in school and work contexts. [INFERRED] Direct cross-generation preference claims are not supported by this data.',
      relevantInsights: [],
    });

    render(<CulturalArchaeologist />);

    const audienceInput = await screen.findByPlaceholderText('Primary Audience (Required) *');
    fireEvent.change(audienceInput, { target: { value: 'Gen Z sneaker culture' } });
    fireEvent.click(screen.getByRole('button', { name: /generate insights/i }));

    const askInput = await screen.findByPlaceholderText(/Ask a question about this audience/i);
    fireEvent.change(askInput, { target: { value: 'Does Gen Z like AI more than other generations?' } });
    fireEvent.click(screen.getByRole('button', { name: /^ask$/i }));

    const askCard = await screen.findByTestId('ask-answer-card');
    const sentenceOne = within(askCard).getByTestId('ask-answer-sentence-0-0');
    const sentenceTwo = within(askCard).getByTestId('ask-answer-sentence-0-1');

    expect(sentenceOne).toHaveTextContent('Gen Z is using AI pragmatically in school and work contexts.');
    expect(within(sentenceOne).getByText(/^known$/i)).toBeInTheDocument();
    expect(within(sentenceOne).queryByText(/^inferred$/i)).not.toBeInTheDocument();

    expect(sentenceTwo).toHaveTextContent('Direct cross-generation preference claims are not supported by this data.');
    expect(within(sentenceTwo).getByText(/^inferred$/i)).toBeInTheDocument();
    expect(within(sentenceTwo).queryByText(/^known$/i)).not.toBeInTheDocument();
  });

  it('does not show methodology comparison launchers in the research view navigation', async () => {
    render(<CulturalArchaeologist />);

    expect(screen.queryByTestId('open-methodology-comparison-inline-button')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /methodology compare/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId('open-tone-methodology-comparison-inline-button')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /tone method compare/i })).not.toBeInTheDocument();
  });
});
