import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CulturalArchaeologist from './CulturalArchaeologist';

const {
  generateCulturalMatrix,
  suggestBrands,
  askMatrixQuestion,
  generateDeepDive,
  generateDeepDivesBatch,
  supabaseFrom,
  supabaseInsert,
  supabaseLimit,
} = vi.hoisted(() => ({
  generateCulturalMatrix: vi.fn(),
  suggestBrands: vi.fn(),
  askMatrixQuestion: vi.fn(),
  generateDeepDive: vi.fn(),
  generateDeepDivesBatch: vi.fn(),
  supabaseFrom: vi.fn(),
  supabaseInsert: vi.fn(async () => ({ data: null, error: null })),
  supabaseLimit: vi.fn(async () => ({ data: [], error: null })),
}));

vi.mock('../services/azure-openai', () => ({
  generateCulturalMatrix,
  suggestBrands,
  askMatrixQuestion,
  generateDeepDive,
  generateDeepDivesBatch,
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
      builder.insert = supabaseInsert;
      builder.delete = vi.fn(() => builder);
      builder.eq = vi.fn(async () => ({ data: null, error: null }));
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

describe('CulturalArchaeologist', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/#cultural-archaeologist');
    vi.clearAllMocks();
    suggestBrands.mockResolvedValue(['Nike', 'Adidas']);
    generateCulturalMatrix.mockResolvedValue(mockMatrix);
    askMatrixQuestion.mockResolvedValue({ answer: 'ok', relevantInsights: [] });
    generateDeepDive.mockResolvedValue({});
    generateDeepDivesBatch.mockResolvedValue([]);
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
    expect(within(mobileMenu).getByRole('button', { name: /back to home/i })).toBeInTheDocument();
    expect(within(mobileMenu).getByRole('button', { name: /brand navigator/i })).toBeInTheDocument();
    expect(within(mobileMenu).getByRole('button', { name: /design excavator/i })).toBeInTheDocument();
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

  it('does not render evidence type chips in deep-dive strategic implications', async () => {
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
    expect(within(strategicSection as HTMLElement).queryByText(/^known$/i)).not.toBeInTheDocument();
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
