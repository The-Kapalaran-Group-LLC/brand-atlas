import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { BrandDeepDivePage } from './DesignExcavator';

const { generateBrandDeepDive, submitBrandDeepDivePrompt, suggestBrandWebsite } = vi.hoisted(() => ({
  generateBrandDeepDive: vi.fn(),
  submitBrandDeepDivePrompt: vi.fn(),
  suggestBrandWebsite: vi.fn(),
}));

const { getUserTelemetryMock, supabaseFromMock, supabaseInsertMock, supabaseOrderMock } = vi.hoisted(() => ({
  getUserTelemetryMock: vi.fn().mockResolvedValue({
    device: 'test-device',
    location: 'test-location',
    ip_address: '127.0.0.1',
  }),
  supabaseFromMock: vi.fn(),
  supabaseInsertMock: vi.fn((payload: unknown) => Promise.resolve({ data: [{ id: 'saved-id' }], error: null, payload })),
  supabaseOrderMock: vi.fn(async () => ({ data: [], error: null })),
}));

const { exportBrandAtlasDocumentToPptx, exportBrandAtlasDocumentToPdf } = vi.hoisted(() => ({
  exportBrandAtlasDocumentToPptx: vi.fn(async () => {}),
  exportBrandAtlasDocumentToPdf: vi.fn(async () => {}),
}));

vi.mock('../services/azure-openai', () => ({
  generateBrandDeepDive,
  submitBrandDeepDivePrompt,
  suggestBrandWebsite,
}));

vi.mock('../services/telemetry', () => ({
  getUserTelemetry: getUserTelemetryMock,
}));

vi.mock('../services/supabase-client', () => ({
  supabase: {
    from: supabaseFromMock.mockImplementation(() => {
      const builder: any = {};
      builder.select = vi.fn(() => builder);
      builder.order = supabaseOrderMock;
      builder.insert = vi.fn((payload: unknown) => {
        const insertResult = supabaseInsertMock(payload);
        return {
          data: [{ id: 'saved-id' }],
          error: null,
          select: vi.fn(async () => insertResult),
        };
      });
      builder.update = vi.fn(() => builder);
      builder.delete = vi.fn(() => builder);
      builder.eq = vi.fn(async () => ({ data: null, error: null }));
      return builder;
    }),
  },
}));

vi.mock('../services/brand-atlas-themed-export', () => ({
  exportBrandAtlasDocumentToPptx,
  exportBrandAtlasDocumentToPdf,
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

const incompleteReport = {
  ...sampleReport,
  brandProfiles: [
    {
      ...sampleReport.brandProfiles[0],
      logo: {
        mainLogo: 'N/A',
        logoVariations: [],
        wordmarkLogotype: 'N/A',
        symbolsIcons: [],
      },
      colorPalette: {
        primaryColors: [],
        secondaryAccentColors: [],
        neutrals: [],
      },
      typography: {
        fontFamilies: [],
        hierarchy: { h1: '', h2: '', body: '' },
        usageRules: [],
      },
      supportingVisualElements: {
        imageryStyle: [],
        icons: [],
        patternsTextures: [],
        shapes: [],
        dataVisualization: [],
      },
      consistencyAssessment: 'N/A',
      distinctivenessAssessment: 'N/A',
    },
  ],
  crossBrandReadout: [],
  strategicRecommendations: [],
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
    getUserTelemetryMock.mockResolvedValue({
      device: 'test-device',
      location: 'test-location',
      ip_address: '127.0.0.1',
    });
  });

  it('includes telemetry fields when saving generated reports to brandexcavator', async () => {
    render(<BrandDeepDivePage onBack={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText('Brand 1 Name'), {
      target: { value: 'Aesop' },
    });
    fireEvent.click(screen.getByRole('button', { name: /generate visual analysis/i }));

    await waitFor(() => {
      expect(supabaseInsertMock).toHaveBeenCalled();
    });

    const firstInsertCall = supabaseInsertMock.mock.calls[0]?.[0] as Array<Record<string, unknown>>;
    expect(firstInsertCall?.[0]).toEqual(
      expect.objectContaining({
        device: 'test-device',
        location: 'test-location',
        ip_address: '127.0.0.1',
      })
    );
    expect(supabaseFromMock).toHaveBeenCalledWith('brandexcavator');
    expect(getUserTelemetryMock).toHaveBeenCalledTimes(1);
  });

  it('prefills brand names from Design Excavator prefill storage payload', async () => {
    localStorage.setItem('design_excavator_prefill_payload', JSON.stringify({
      brands: [
        { name: 'Delta', website: '' },
        { name: 'United Airlines', website: '' },
      ],
    }));

    render(<BrandDeepDivePage onBack={() => {}} />);

    expect(await screen.findByDisplayValue('Delta')).toBeInTheDocument();
    expect(screen.getByDisplayValue('United Airlines')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Visual Identity Objective (Optional)')).toHaveValue('');
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

  it('uses themed document export for PDF output so styling matches public exports', async () => {
    render(<BrandDeepDivePage onBack={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText('Brand 1 Name'), {
      target: { value: 'Aesop' },
    });
    fireEvent.click(screen.getByRole('button', { name: /generate visual analysis/i }));

    const exportPdfButton = await screen.findByRole('button', { name: /pdf/i });
    fireEvent.click(exportPdfButton);

    await waitFor(() => {
      expect(exportBrandAtlasDocumentToPdf).toHaveBeenCalledTimes(1);
    });

    const firstCall = exportBrandAtlasDocumentToPdf.mock.calls[0];
    expect(firstCall).toBeDefined();
    if (!firstCall) {
      throw new Error('Expected themed PDF export call payload.');
    }
    const [documentArg, fileNameArg] = firstCall as unknown as [any, string];

    expect(fileNameArg).toMatch(/^Design_Excavator_\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(documentArg.reportTitle).toBe('Design Excavator');
    expect(documentArg.sections.length).toBeGreaterThan(0);
  });

  it('shows detailed themed export errors for PDF failures', async () => {
    exportBrandAtlasDocumentToPdf.mockRejectedValueOnce(new Error('Themed export renderer failed.'));
    render(<BrandDeepDivePage onBack={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText('Brand 1 Name'), {
      target: { value: 'Aesop' },
    });
    fireEvent.click(screen.getByRole('button', { name: /generate visual analysis/i }));

    const exportPdfButton = await screen.findByRole('button', { name: /pdf/i });
    fireEvent.click(exportPdfButton);

    const errorMessages = await screen.findAllByText(/Themed export renderer failed\./i);
    expect(errorMessages.length).toBeGreaterThan(0);
  });

  it('shows per-section refresh for incomplete results and triggers a fresh design search', async () => {
    generateBrandDeepDive
      .mockResolvedValueOnce(incompleteReport)
      .mockResolvedValueOnce(sampleReport);

    render(<BrandDeepDivePage onBack={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText('Brand 1 Name'), {
      target: { value: 'Aesop' },
    });
    fireEvent.click(screen.getByRole('button', { name: /generate visual analysis/i }));

    const refreshButton = await screen.findByTestId('design-section-refresh-0-logo-system');
    await waitFor(() => {
      expect(refreshButton).not.toBeDisabled();
    }, { timeout: 5000 });
    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(generateBrandDeepDive).toHaveBeenCalledTimes(2);
    }, { timeout: 5000 });
  });

  it('renders mobile results navigation for all design result components', async () => {
    render(<BrandDeepDivePage onBack={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText('Brand 1 Name'), {
      target: { value: 'Aesop' },
    });
    fireEvent.click(screen.getByRole('button', { name: /generate visual analysis/i }));

    const mobileResultsNav = await screen.findByTestId('mobile-results-nav-design');
    expect(mobileResultsNav).toBeInTheDocument();
    expect(within(mobileResultsNav).getByRole('button', { name: 'Analysis Q&A' })).toBeInTheDocument();
    expect(within(mobileResultsNav).getByRole('button', { name: 'Aesop' })).toBeInTheDocument();
    expect(within(mobileResultsNav).getByRole('button', { name: 'Aesop: Logo System' })).toBeInTheDocument();
    expect(within(mobileResultsNav).getByRole('button', { name: 'Aesop: Color Palette' })).toBeInTheDocument();
    expect(within(mobileResultsNav).getByRole('button', { name: 'Opportunity Spaces' })).toBeInTheDocument();
    expect(within(mobileResultsNav).getByRole('button', { name: 'Strategic Recommendations' })).toBeInTheDocument();
    expect(within(mobileResultsNav).getByRole('button', { name: 'Sources' })).toBeInTheDocument();
  });

  it('renders a Show thinking dropdown for design results that is closed by default', async () => {
    render(<BrandDeepDivePage onBack={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText('Brand 1 Name'), {
      target: { value: 'Aesop' },
    });
    fireEvent.click(screen.getByRole('button', { name: /generate visual analysis/i }));

    const showThinkingDetails = await screen.findByTestId('design-show-thinking-container');
    expect(showThinkingDetails).not.toHaveAttribute('open');

    fireEvent.click(screen.getByTestId('design-show-thinking-summary'));

    expect(showThinkingDetails).toHaveAttribute('open');
    expect(
      screen.getByText('Ran multimodal retrieval + analysis: parsed visual/UI signals, retrieved comparable design patterns, scored alignment against current conventions, and produced evidence-backed improvement opportunities.')
    ).toBeInTheDocument();
  });

  it('uses a mobile hamburger for navigation links and keeps desktop top links at sm+', () => {
    render(<BrandDeepDivePage onBack={() => {}} />);

    const mobileTopBar = screen.getByTestId('mobile-top-bar');
    expect(mobileTopBar.className).toContain('fixed');
    expect(mobileTopBar.className).toContain('top-0');
    expect(mobileTopBar.className).toContain('translate-y-0');
    expect(within(mobileTopBar).getByText('Design Excavator')).toBeInTheDocument();
    const mobileTitle = within(mobileTopBar).getByTestId('mobile-page-title');
    const mobileIcon = within(mobileTopBar).getByTestId('mobile-page-icon');
    const mobileHeading = within(mobileTopBar).getByTestId('mobile-page-heading');
    expect(mobileHeading.className).toContain('ml-auto');
    expect(mobileHeading.className).toContain('justify-end');
    expect(mobileTitle.className).toContain('text-right');
    expect(Boolean(mobileTitle.compareDocumentPosition(mobileIcon) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    const mobileSubcopy = screen.getByTestId('mobile-page-subcopy');
    expect(mobileSubcopy).toHaveTextContent('Compare visual identity systems across brands.');
    expect(mobileSubcopy.parentElement?.className).toContain('mb-[2px]');
    const brandsHeading = screen.getByText('Brands To Analyze');
    expect(brandsHeading.className).toContain('m-0');

    const mobileNavTrigger = screen.getByTestId('mobile-nav-trigger');
    const actionContainer = screen.getByTestId('top-action-buttons');
    expect(actionContainer.className).toContain('hidden');
    expect(actionContainer.className).toContain('sm:flex-row');

    Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: 220 });
    fireEvent.scroll(window);
    expect(mobileTopBar.className).toContain('-translate-y-full');

    Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: 80 });
    fireEvent.scroll(window);
    expect(mobileTopBar.className).toContain('translate-y-0');

    fireEvent.click(mobileNavTrigger);
    const mobileMenu = screen.getByTestId('mobile-nav-menu');
    expect(mobileMenu.className).toContain('fixed');
    expect(mobileMenu.className).toContain('top-16');
    expect(mobileMenu.className).toContain('left-4');
    expect(mobileMenu.className).toContain('right-4');
    expect(within(mobileMenu).getByRole('link', { name: /back to home/i })).toHaveAttribute('href', '/?home=1');
    expect(within(mobileMenu).getByRole('link', { name: /cultural archaeologist/i })).toHaveAttribute('href', '/#cultural-archaeologist');
    expect(within(mobileMenu).getByRole('link', { name: /brand navigator/i })).toHaveAttribute('href', '/#brand-navigator');
    expect(within(mobileMenu).getByRole('link', { name: /design excavator/i })).toHaveAttribute('href', '/#design-excavator');
  });

  it('renders mobile New Search as an icon button to the right of generate visual analysis', () => {
    render(<BrandDeepDivePage onBack={() => {}} />);
    const generateButton = screen.getByRole('button', { name: /generate visual analysis/i });
    const newSearchButton = screen.getByTestId('new-search-below-generate');
    expect(newSearchButton).toHaveAccessibleName(/new search/i);
    expect(newSearchButton.className).toContain('sm:hidden');
    expect(Boolean(generateButton.compareDocumentPosition(newSearchButton) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  it('uses the same primary generate button size and font treatment as other research pages', () => {
    render(<BrandDeepDivePage onBack={() => {}} />);

    const generateButton = screen.getByRole('button', { name: /generate visual analysis/i });
    expect(generateButton.className).toContain('w-[304px]');
    expect(generateButton.className).toContain('sm:w-[360px]');
    expect(generateButton.className).toContain('px-4');
    expect(generateButton.className).toContain('py-4');
    expect(generateButton.className).toContain('text-sm');
  });

  it('clears search fields when removing the only brand row', () => {
    render(<BrandDeepDivePage onBack={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText('Brand 1 Name'), {
      target: { value: 'Spotify' },
    });
    fireEvent.change(screen.getAllByPlaceholderText('Website URL (optional)')[0], {
      target: { value: 'https://www.spotify.com/' },
    });
    fireEvent.change(screen.getByPlaceholderText('Visual Identity Objective (Optional)'), {
      target: { value: 'Compare premium audio brands' },
    });
    fireEvent.change(screen.getByPlaceholderText('Target Audience (Optional)'), {
      target: { value: 'Music streamers' },
    });

    const removeOnlyBrandButton = screen.getByRole('button', { name: /remove brand 1/i });
    fireEvent.click(removeOnlyBrandButton);

    expect(screen.getByPlaceholderText('Brand 1 Name')).toHaveValue('');
    const websiteInputs = screen.getAllByPlaceholderText('Website URL (optional)');
    expect(websiteInputs).toHaveLength(1);
    expect(websiteInputs[0]).toHaveValue('');
    expect(screen.getByPlaceholderText('Visual Identity Objective (Optional)')).toHaveValue('');
    expect(screen.getByPlaceholderText('Target Audience (Optional)')).toHaveValue('');
  });

  it('moves focus to the next brand name input when pressing Enter', () => {
    render(<BrandDeepDivePage onBack={() => {}} />);

    const brandOneInput = screen.getByPlaceholderText('Brand 1 Name');
    const brandTwoInput = screen.getByPlaceholderText('Brand 2 Name');

    brandOneInput.focus();
    fireEvent.keyDown(brandOneInput, { key: 'Enter', code: 'Enter' });

    expect(brandTwoInput).toHaveFocus();
  });

  it('adds a brand row and focuses it when pressing Enter on the last brand name input', async () => {
    render(<BrandDeepDivePage onBack={() => {}} />);

    const brandTwoInput = screen.getByPlaceholderText('Brand 2 Name');
    brandTwoInput.focus();
    fireEvent.keyDown(brandTwoInput, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      const brandThreeInput = screen.getByPlaceholderText('Brand 3 Name');
      expect(brandThreeInput).toHaveFocus();
    });
  });

  it('falls back to first-party square logo assets before favicon when the initial logo fails', async () => {
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

    expect(logo).toHaveAttribute(
      'src',
      expect.stringMatching(/brandmark\.png|brandmark\.svg|logo-icon\.png|logo-icon\.svg|icon\.png|icon\.svg|mark\.png|mark\.svg|symbol\.png|symbol\.svg|logo\.png|logo\.svg|apple-touch-icon\.png|favicon\.ico|favicon\.png|favicon\.svg|brandmark%2Epng|brandmark%2Esvg|logo-icon%2Epng|logo-icon%2Esvg|icon%2Epng|icon%2Esvg|mark%2Epng|mark%2Esvg|symbol%2Epng|symbol%2Esvg|logo%2Epng|logo%2Esvg|apple-touch-icon%2Epng|apple-touch-icon%2Fpng|favicon%2Eico|favicon%2Epng|favicon%2Esvg/i)
    );
    expect(logo.getAttribute('src')).not.toContain('google.com/s2/favicons');
  });

  it('prioritizes square logo assets and then favicon in the brand header fallback chain', async () => {
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
    fireEvent.error(logo);

    expect(logo).toHaveAttribute(
      'src',
      expect.stringMatching(/brandmark\.png|brandmark\.svg|logo-icon\.png|logo-icon\.svg|icon\.png|icon\.svg|mark\.png|mark\.svg|symbol\.png|symbol\.svg|favicon\.ico|favicon\.png|favicon\.svg|brandmark%2Epng|brandmark%2Esvg|logo-icon%2Epng|logo-icon%2Esvg|icon%2Epng|icon%2Esvg|mark%2Epng|mark%2Esvg|symbol%2Epng|symbol%2Esvg|favicon%2Eico|favicon%2Epng|favicon%2Esvg/i)
    );
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

    const compareButton = await screen.findByRole('button', { name: /compare across brands/i }, { timeout: 7000 });
    fireEvent.click(compareButton);

    expect(await screen.findByText('Typography Comparison')).toBeInTheDocument();
  });

  it('prioritizes report sampleVisuals in Logos & Visuals so valid brand imagery loads', async () => {
    generateBrandDeepDive.mockResolvedValueOnce({
      ...sampleReport,
      brandProfiles: [
        {
          ...sampleReport.brandProfiles[0],
          sampleVisuals: [
            { title: 'Homepage Hero', url: 'https://www.aesop.com/images/hero.jpg' },
            { title: 'Campaign Visual', url: 'https://www.aesop.com/images/campaign.jpg' },
          ],
        },
      ],
    });

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

    const heroVisual = await screen.findByAltText('Homepage Hero');
    expect(heroVisual).toHaveAttribute('src', expect.stringContaining('https://www.aesop.com/images/hero.jpg'));
  });

  it('adds resilient screenshot and favicon fallback chains for logos and visuals', async () => {
    render(<BrandDeepDivePage onBack={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText('Brand 1 Name'), {
      target: { value: 'Aesop' },
    });
    fireEvent.click(screen.getByRole('button', { name: /generate visual analysis/i }));

    const logo = await screen.findByAltText('Aesop logo');
    const visual = await screen.findByAltText('Homepage Preview');

    expect(logo.getAttribute('data-fallback-chain') || '').toContain('www.google.com/s2/favicons');

    const visualSrc = visual.getAttribute('src') || '';
    const visualFallbackChain = visual.getAttribute('data-fallback-chain') || '';
    const visualChainBundle = `${visualSrc}|${visualFallbackChain}`;
    expect(visualChainBundle).toContain('s.wordpress.com/mshots');
    expect(visualChainBundle).toContain('image.thum.io');
  });

  it('renders a brand logo from report.logoImageUrl even when website is missing', async () => {
    generateBrandDeepDive.mockResolvedValueOnce({
      ...sampleReport,
      brandProfiles: [
        {
          ...sampleReport.brandProfiles[0],
          website: '',
          logoImageUrl: 'https://cdn.aesop.com/assets/aesop-logo.svg',
        },
      ],
    });

    render(<BrandDeepDivePage onBack={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText('Brand 1 Name'), {
      target: { value: 'Aesop' },
    });
    fireEvent.click(screen.getByRole('button', { name: /generate visual analysis/i }));

    const logo = await screen.findByAltText('Aesop logo');
    const src = logo.getAttribute('src') || '';
    expect(decodeURIComponent(src)).toContain('https://cdn.aesop.com/assets/aesop-logo.svg');
  });

  it('renders both WordPress and Thum.io screenshot providers when direct visuals are unavailable', async () => {
    render(<BrandDeepDivePage onBack={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText('Brand 1 Name'), {
      target: { value: 'Aesop' },
    });
    fireEvent.click(screen.getByRole('button', { name: /generate visual analysis/i }));

    expect(await screen.findByAltText('Homepage Preview')).toBeInTheDocument();
    expect(await screen.findByAltText('Homepage Preview (Thum.io)')).toBeInTheDocument();
  });

  it('keeps visual cards on fallback sources after image errors instead of snapping back to broken URLs', async () => {
    render(<BrandDeepDivePage onBack={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText('Brand 1 Name'), {
      target: { value: 'Aesop' },
    });
    fireEvent.click(screen.getByRole('button', { name: /generate visual analysis/i }));

    const visual = await screen.findByAltText('Homepage Preview');
    const initialSrc = visual.getAttribute('src') || '';

    fireEvent.error(visual);

    await waitFor(() => {
      expect(visual.getAttribute('src') || '').not.toEqual(initialSrc);
    });
  });

  it('uses URL-encoded inline SVG placeholders after visual fallback exhaustion', async () => {
    render(<BrandDeepDivePage onBack={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText('Brand 1 Name'), {
      target: { value: 'Aesop' },
    });
    fireEvent.click(screen.getByRole('button', { name: /generate visual analysis/i }));

    const visual = await screen.findByAltText('Homepage Preview');
    visual.setAttribute('data-fallback-chain', '');
    fireEvent.error(visual);
    fireEvent.error(visual);

    await waitFor(() => {
      const src = visual.getAttribute('src') || '';
      expect(src).toContain('data:image/svg+xml');
      expect(src).toContain('%3Csvg');
    });
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

  it('hides Compare Across Brands actions and pointer cursor when only one brand is shown in results', async () => {
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
    const typographyCard = typographyHeading.closest('.bg-zinc-50') as HTMLElement | null;
    if (!typographyCard) throw new Error('Expected typography result card.');
    expect(typographyCard.className).toContain('cursor-default');
    expect(typographyCard.className).not.toContain('cursor-pointer');
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
    expect(screen.getByText('No live website typography samples available.')).toBeInTheDocument();
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

    expect(screen.queryByText(/\[INFERRED\]/i)).not.toBeInTheDocument();
  });

  it('renders inferred chips for distinctiveness and logo system fields instead of raw [INFERRED] copy', async () => {
    generateBrandDeepDive.mockResolvedValueOnce({
      ...sampleReport,
      brandProfiles: [
        {
          ...sampleReport.brandProfiles[0],
          distinctivenessAssessment: '[INFERRED] Distinctive through the triangular marker and airline-specific contrast system.',
          logo: {
            ...sampleReport.brandProfiles[0].logo,
            mainLogo: '[INFERRED] Primary Delta wordmark + red triangular symbol.',
            wordmarkLogotype: '[INFERRED] Sans-serif Delta wordmark in a clean service style.',
          },
          typography: {
            ...sampleReport.brandProfiles[0].typography,
            fontFamilies: ['[INFERRED] Neue Haas Grotesk Display Pro'],
            hierarchy: {
              h1: '[INFERRED] Heavy display style for hero headlines.',
              h2: '[INFERRED] Medium-to-semibold subheads.',
              body: '[INFERRED] Clean sans serif for body copy.',
            },
          },
        },
      ],
    });

    render(<BrandDeepDivePage onBack={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText('Brand 1 Name'), {
      target: { value: 'Delta' },
    });
    fireEvent.click(screen.getByRole('button', { name: /generate visual analysis/i }));

    await screen.findByText(/Ask About This Analysis/i);

    expect(screen.getAllByText('INFERRED').length).toBeGreaterThan(0);
    expect(screen.queryByText(/\[INFERRED\]/i)).not.toBeInTheDocument();
  });

  it('opens a color override modal when a color swatch is clicked', async () => {
    generateBrandDeepDive.mockResolvedValueOnce({
      ...sampleReport,
      brandProfiles: [
        {
          ...sampleReport.brandProfiles[0],
          sampleVisuals: [{ title: 'Homepage', url: 'https://www.aesop.com/home.jpg' }],
          colorPalette: {
            primaryColors: [
              {
                name: 'Ink',
                hex: '#111111',
                rgb: '17,17,17',
                cmyk: '',
                pantone: '',
                usage: '',
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

    fireEvent.click(screen.getByTestId('color-swatch-trigger-0-primaryColors-0'));

    expect(await screen.findByTestId('color-override-modal')).toBeInTheDocument();
    expect(screen.getByText(/verify aesop color/i)).toBeInTheDocument();
  });

  it('updates a color hex after auto-launching the native eyedropper when the modal opens', async () => {
    generateBrandDeepDive.mockResolvedValueOnce({
      ...sampleReport,
      brandProfiles: [
        {
          ...sampleReport.brandProfiles[0],
          sampleVisuals: [{ title: 'Homepage', url: 'https://www.aesop.com/home.jpg' }],
          colorPalette: {
            primaryColors: [
              {
                name: 'Ink',
                hex: '#111111',
                rgb: '17,17,17',
                cmyk: '',
                pantone: '',
                usage: '',
              },
            ],
            secondaryAccentColors: [],
            neutrals: [],
          },
        },
      ],
    });

    class MockEyeDropper {
      open = vi.fn().mockResolvedValue({ sRGBHex: '#22cc88' });
    }

    (window as unknown as { EyeDropper: typeof MockEyeDropper }).EyeDropper = MockEyeDropper;

    render(<BrandDeepDivePage onBack={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText('Brand 1 Name'), {
      target: { value: 'Aesop' },
    });
    fireEvent.click(screen.getByRole('button', { name: /generate visual analysis/i }));

    await screen.findByText(/Ask About This Analysis/i);

    fireEvent.click(screen.getByTestId('color-swatch-trigger-0-primaryColors-0'));

    await waitFor(() => {
      expect(screen.getByText('HEX #22CC88')).toBeInTheDocument();
    });
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
