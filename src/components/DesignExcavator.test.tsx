import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { BrandDeepDivePage } from './DesignExcavator';

const { generateBrandDeepDive, submitBrandDeepDivePrompt, suggestBrandWebsite } = vi.hoisted(() => ({
  generateBrandDeepDive: vi.fn(),
  submitBrandDeepDivePrompt: vi.fn(),
  suggestBrandWebsite: vi.fn(),
}));

vi.mock('../services/azure-openai', () => ({
  generateBrandDeepDive,
  submitBrandDeepDivePrompt,
  suggestBrandWebsite,
}));

const sampleReport = {
  analysisObjective: 'Compare premium skincare brands',
  ecosystemMethod: 'Reviewed official sites and public brand assets.',
  brandProfiles: [
    {
      brandName: 'Aesop',
      website: 'https://www.aesop.com',
      matchSource: 'name',
      logoImageUrl: null,
      sampleVisuals: [],
      logo: {
        mainLogo: 'Minimal serif wordmark',
        logoVariations: ['Stacked wordmark'],
        wordmarkLogotype: 'Uppercase serif wordmark',
        symbolsIcons: [],
      },
      colorPalette: {
        primaryColors: [],
        secondaryAccentColors: [],
        neutrals: [],
      },
      typography: {
        fontFamilies: ['Serif'],
        hierarchy: {
          h1: 'Serif display',
          h2: 'Serif subhead',
          body: 'Sans serif body',
        },
        usageRules: ['Sparse, editorial hierarchy'],
      },
      supportingVisualElements: {
        imageryStyle: ['Muted product photography'],
        icons: [],
        patternsTextures: [],
        shapes: [],
        dataVisualization: [],
      },
      consistencyAssessment: 'Consistent across touchpoints.',
      distinctivenessAssessment: 'Distinct through restraint.',
      sources: [{ title: 'Aesop', url: 'https://www.aesop.com' }],
    },
  ],
  crossBrandReadout: ['Shared minimalist codes in the category.'],
  strategicRecommendations: ['Lean into differentiated editorial cues.'],
  sources: [{ title: 'Aesop', url: 'https://www.aesop.com' }],
};

describe('BrandDeepDivePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    generateBrandDeepDive.mockResolvedValue(sampleReport);
    submitBrandDeepDivePrompt.mockResolvedValue({
      mode: 'rescan',
      answer: 'The report was rescanned and updated using your prompt. Review the refreshed results below.',
      report: sampleReport,
    });
    suggestBrandWebsite.mockResolvedValue(null);
  });

  it('removes the Scan & Fix button and routes corrective prompts through Ask', async () => {
    render(<BrandDeepDivePage onBack={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText('Brand 1 Name'), {
      target: { value: 'Aesop' },
    });
    fireEvent.change(
      screen.getByPlaceholderText('Visual Identity Objective (Optional)'),
      {
        target: { value: 'Compare premium skincare brands' },
      }
    );

    fireEvent.click(screen.getByRole('button', { name: /generate visual analysis/i }));

    await screen.findByText(/Ask About This Analysis/i);

    expect(screen.queryByRole('button', { name: /rescan/i })).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('e.g. Which brand has the most distinct color system?'), {
      target: { value: 'The logo details look inaccurate. Please rescan and fix them.' },
    });

    fireEvent.click(screen.getByRole('button', { name: /^ask$/i }));

    await waitFor(() => {
      expect(submitBrandDeepDivePrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          brands: [{ name: 'Aesop', website: '' }],
          analysisObjective: 'Compare premium skincare brands',
          currentReport: sampleReport,
          prompt: 'The logo details look inaccurate. Please rescan and fix them.',
        })
      );
    });

    expect(
      await screen.findByText('The report was rescanned and updated using your prompt. Review the refreshed results below.')
    ).toBeInTheDocument();
  });

  it('renders top navigation actions as links so they can be opened in new tabs', () => {
    render(<BrandDeepDivePage onBack={() => {}} />);

    expect(screen.getByRole('link', { name: /back to home/i })).toHaveAttribute('href', '/?home=1');
    const culturalLink = screen.getByRole('link', { name: /cultural archaeologist/i });
    const brandLink = screen.getByRole('link', { name: /brand navigator/i });
    const newSearchLink = screen.getByRole('link', { name: /new search/i });
    const actionContainer = screen.getByTestId('top-action-buttons');

    expect(culturalLink).toHaveAttribute('href', '/#cultural-archaeologist');
    expect(brandLink).toHaveAttribute('href', '/#brand-navigator');
    expect(newSearchLink).toHaveAttribute('href', '/#design-excavator');
    expect(actionContainer.className).toContain('left-4');
    expect(actionContainer.className).toContain('sm:flex-row');
    expect(culturalLink.className).toContain('w-full');
    expect(culturalLink.className).toContain('sm:w-auto');
    expect(brandLink.className).toContain('w-full');
    expect(brandLink.className).toContain('sm:w-auto');
    expect(newSearchLink.className).toContain('w-full');
    expect(newSearchLink.className).toContain('sm:w-auto');
  });

  it('uses the same primary generate button size and font treatment as other research pages', () => {
    render(<BrandDeepDivePage onBack={() => {}} />);

    const generateButton = screen.getByRole('button', { name: /generate visual analysis/i });
    expect(generateButton.className).toContain('w-[288px]');
    expect(generateButton.className).toContain('px-4');
    expect(generateButton.className).toContain('py-4');
    expect(generateButton.className).toContain('text-sm');
  });

  it('falls back to larger logo assets instead of favicons', async () => {
    render(<BrandDeepDivePage onBack={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText('Brand 1 Name'), {
      target: { value: 'Aesop' },
    });
    fireEvent.change(
      screen.getByPlaceholderText('Visual Identity Objective (Optional)'),
      {
        target: { value: 'Compare premium skincare brands' },
      }
    );

    fireEvent.click(screen.getByRole('button', { name: /generate visual analysis/i }));

    const [logo] = await screen.findAllByAltText('Aesop logo');
    expect(logo).toHaveAttribute('src', expect.stringContaining('www.aesop.com'));
    expect(logo.getAttribute('src')).not.toContain('logo.clearbit.com');

    fireEvent.error(logo);

    expect(logo).toHaveAttribute('src', expect.stringMatching(/logo\.png|logo\.svg|apple-touch-icon\.png|logo%2Epng|logo%2Esvg|apple-touch-icon%2Epng|apple-touch-icon%2Fpng/i));
    expect(logo.getAttribute('src')).not.toContain('google.com/s2/favicons');
  });

  it('shows Compare Across Brands popup when clicking a result box', async () => {
    generateBrandDeepDive.mockResolvedValueOnce({
      ...sampleReport,
      brandProfiles: [
        ...sampleReport.brandProfiles,
        {
          ...sampleReport.brandProfiles[0],
          brandName: 'Byredo',
          website: 'https://www.byredo.com',
          sources: [{ title: 'Byredo', url: 'https://www.byredo.com' }],
        },
      ],
      sources: [
        ...sampleReport.sources,
        { title: 'Byredo', url: 'https://www.byredo.com' },
      ],
    });

    render(<BrandDeepDivePage onBack={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText('Brand 1 Name'), {
      target: { value: 'Aesop' },
    });
    fireEvent.click(screen.getByRole('button', { name: /add brand/i }));
    fireEvent.change(screen.getByPlaceholderText('Brand 2 Name'), {
      target: { value: 'Byredo' },
    });
    fireEvent.change(
      screen.getByPlaceholderText('Visual Identity Objective (Optional)'),
      {
        target: { value: 'Compare premium skincare brands' },
      }
    );

    fireEvent.click(screen.getByRole('button', { name: /generate visual analysis/i }));

    await screen.findByText(/Ask About This Analysis/i);

    const typographyHeading = screen.getAllByText('Typography')[0];
    const typographyCard = typographyHeading.closest('.cursor-pointer') as HTMLElement | null;
    if (!typographyCard) {
      throw new Error('Expected clickable typography card.');
    }
    fireEvent.click(typographyCard);

    const compareButton = await screen.findByRole('button', { name: /compare across brands/i });
    fireEvent.click(compareButton);

    expect(await screen.findByText('Typography Comparison')).toBeInTheDocument();
  });

  it('uses a dynamic masonry-style layout for compare cards', async () => {
    generateBrandDeepDive.mockResolvedValueOnce({
      ...sampleReport,
      brandProfiles: [
        ...sampleReport.brandProfiles,
        {
          ...sampleReport.brandProfiles[0],
          brandName: 'Byredo',
          website: 'https://www.byredo.com',
          sources: [{ title: 'Byredo', url: 'https://www.byredo.com' }],
        },
      ],
    });

    render(<BrandDeepDivePage onBack={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText('Brand 1 Name'), {
      target: { value: 'Aesop' },
    });
    fireEvent.click(screen.getByRole('button', { name: /add brand/i }));
    fireEvent.change(screen.getByPlaceholderText('Brand 2 Name'), {
      target: { value: 'Byredo' },
    });
    fireEvent.click(screen.getByRole('button', { name: /generate visual analysis/i }));

    const compareTab = await screen.findByRole('button', { name: /^compare$/i });
    fireEvent.click(compareTab);

    const compareLayout = await screen.findByTestId('design-excavator-compare-cards-layout');
    expect(compareLayout.className).toContain('columns-1');
    expect(compareLayout.className).toContain('lg:columns-2');
    expect(compareLayout.className).not.toContain('grid-cols-1');
  });

  it('hides the Compare tab when only one brand is entered', async () => {
    render(<BrandDeepDivePage onBack={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText('Brand 1 Name'), {
      target: { value: 'Aesop' },
    });
    fireEvent.click(screen.getByRole('button', { name: /generate visual analysis/i }));

    await screen.findByText(/Ask About This Analysis/i);
    expect(screen.queryByRole('button', { name: /^compare$/i })).not.toBeInTheDocument();
  });

  it('hides Compare Across Brands actions when only one brand is shown in results', async () => {
    generateBrandDeepDive.mockResolvedValueOnce({
      ...sampleReport,
      brandProfiles: [sampleReport.brandProfiles[0]],
    });

    render(<BrandDeepDivePage onBack={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText('Brand 1 Name'), {
      target: { value: 'Aesop' },
    });
    fireEvent.click(screen.getByRole('button', { name: /add brand/i }));
    fireEvent.change(screen.getByPlaceholderText('Brand 2 Name'), {
      target: { value: 'Byredo' },
    });
    fireEvent.click(screen.getByRole('button', { name: /generate visual analysis/i }));

    await screen.findByText(/Ask About This Analysis/i);
    expect(screen.queryByRole('button', { name: /^compare$/i })).not.toBeInTheDocument();

    const typographyHeading = screen.getAllByText('Typography')[0];
    const typographyCard = typographyHeading.closest('.cursor-pointer') as HTMLElement | null;
    if (!typographyCard) {
      throw new Error('Expected clickable typography card.');
    }
    fireEvent.click(typographyCard);

    expect(screen.queryByRole('button', { name: /compare across brands/i })).not.toBeInTheDocument();
  });

  it('renders explicit fallback copy when color and typography token arrays are empty', async () => {
    generateBrandDeepDive.mockResolvedValueOnce({
      ...sampleReport,
      brandProfiles: [
        {
          ...sampleReport.brandProfiles[0],
          typography: {
            ...sampleReport.brandProfiles[0].typography,
            fontFamilies: [],
            hierarchy: { h1: '', h2: '', body: '' },
            usageRules: [],
          },
        },
      ],
    });

    render(<BrandDeepDivePage onBack={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText('Brand 1 Name'), {
      target: { value: 'Aesop' },
    });
    fireEvent.click(screen.getByRole('button', { name: /generate visual analysis/i }));

    await screen.findByText(/Ask About This Analysis/i);

    expect(screen.getByText('No primary colors documented.')).toBeInTheDocument();
    expect(screen.getByText('No accent colors documented.')).toBeInTheDocument();
    expect(screen.getByText('No neutral colors documented.')).toBeInTheDocument();
    expect(screen.getByText('No typography families documented.')).toBeInTheDocument();
  });

  it('shows the Compare tab when multiple brands are entered', async () => {
    generateBrandDeepDive.mockResolvedValueOnce({
      ...sampleReport,
      brandProfiles: [
        ...sampleReport.brandProfiles,
        {
          ...sampleReport.brandProfiles[0],
          brandName: 'Byredo',
          website: 'https://www.byredo.com',
          sources: [{ title: 'Byredo', url: 'https://www.byredo.com' }],
        },
      ],
      sources: [
        ...sampleReport.sources,
        { title: 'Byredo', url: 'https://www.byredo.com' },
      ],
    });

    render(<BrandDeepDivePage onBack={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText('Brand 1 Name'), {
      target: { value: 'Aesop' },
    });
    fireEvent.click(screen.getByRole('button', { name: /add brand/i }));
    fireEvent.change(screen.getByPlaceholderText('Brand 2 Name'), {
      target: { value: 'Byredo' },
    });
    fireEvent.click(screen.getByRole('button', { name: /generate visual analysis/i }));

    await screen.findByText(/Ask About This Analysis/i);
    expect(screen.getByRole('button', { name: /^compare$/i })).toBeInTheDocument();
  });

  it('renders inferred color metadata as tag chips instead of raw [INFERRED] text', async () => {
    generateBrandDeepDive.mockResolvedValueOnce({
      ...sampleReport,
      brandProfiles: [
        {
          ...sampleReport.brandProfiles[0],
          colorPalette: {
            primaryColors: [
              {
                name: 'Turkish red',
                hex: '#C8102E',
                rgb: '[INFERRED] 200,16,46',
                cmyk: '[INFERRED] 0,92,77,22',
                pantone: '[INFERRED] Close to Pantone 186 C or a similar deep airline red; unverified.',
                usage: '[INFERRED] Primary brand accent and logo color; likely dominant in headers, CTA emphasis, and promotional framing.',
              },
            ],
            secondaryAccentColors: [],
            neutrals: [],
          },
        },
      ],
    });

    render(<BrandDeepDivePage onBack={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText('Brand 1 Name'), {
      target: { value: 'Aesop' },
    });
    fireEvent.click(screen.getByRole('button', { name: /generate visual analysis/i }));

    await screen.findByText(/Ask About This Analysis/i);

    expect(screen.getAllByText('Inferred').length).toBeGreaterThan(0);
    expect(screen.queryByText(/\[INFERRED\]/i)).not.toBeInTheDocument();
  });

  it('does not render Devil’s Advocate recommendations in Design Excavator output', async () => {
    generateBrandDeepDive.mockResolvedValueOnce({
      ...sampleReport,
      strategicRecommendations: [
        "Devil's advocate: This identity could be perceived as too restrained for younger audiences.",
        'Lean into differentiated editorial cues.',
      ],
    });

    render(<BrandDeepDivePage onBack={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText('Brand 1 Name'), {
      target: { value: 'Aesop' },
    });
    fireEvent.click(screen.getByRole('button', { name: /generate visual analysis/i }));

    await screen.findByText(/Ask About This Analysis/i);

    expect(screen.queryByText(/devil.?s advocate/i)).not.toBeInTheDocument();
    expect(screen.getByText('Lean into differentiated editorial cues.')).toBeInTheDocument();
  });

  it('renders a bottom Sources & Research section from report sources', async () => {
    render(<BrandDeepDivePage onBack={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText('Brand 1 Name'), {
      target: { value: 'Aesop' },
    });
    fireEvent.click(screen.getByRole('button', { name: /generate visual analysis/i }));

    await screen.findByText(/Ask About This Analysis/i);

    expect(screen.getByRole('heading', { name: /sources & research/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /\[1\].*Aesop/i })).toHaveAttribute(
      'href',
      expect.stringMatching(/^https:\/\/www\.aesop\.com\/?$/)
    );
  });
});
