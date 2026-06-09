import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from './App';
import { beforeEach, describe, it, expect, vi } from 'vitest';

// Mock azure-openai service for async flows
vi.mock('./services/azure-openai', async () => {
  const actual = await vi.importActual<typeof import('./services/azure-openai')>('./services/azure-openai');
  return {
    ...actual,
    suggestBrands: vi.fn().mockResolvedValue(['Nike', 'Nestle']),
  };
});

describe('App Component', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/');
    vi.clearAllMocks();
  });

  async function waitForSplashToDisappear() {
    // Wait for splash screen to be fully unmounted (not in DOM)
    await waitFor(() => {
      return screen.queryByTestId('splash-screen') === null;
    }, { timeout: 3000 });
  }

  async function openResearchExperience() {
    fireEvent.click(screen.getByTestId('menu-page-card-cultural-archaeologist'));
    await screen.findByPlaceholderText(/Brands? or Category \(Optional\)/i);
  }

  it('renders the main heading', async () => {
    render(<App />);
    await waitForSplashToDisappear();
    await openResearchExperience();
    expect(screen.getByPlaceholderText(/Brands? or Category \(Optional\)/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Primary Audience \(Required\) \*/i)).toBeInTheDocument();
  });

  it('has input fields for brand and audience', async () => {
    render(<App />);
    await waitForSplashToDisappear();
    await openResearchExperience();
    expect(screen.getByPlaceholderText(/Brands? or Category \(Optional\)/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Primary Audience \(Required\) \*/i)).toBeInTheDocument();
  });

  it('shows contextual guidance for brand/category and topic inputs', async () => {
    render(<App />);
    await waitForSplashToDisappear();
    await openResearchExperience();

    expect(screen.getByTestId('cultural-audience-guidance')).toHaveTextContent('Add the audience you want to analyze.');
    expect(screen.getByTestId('cultural-brands-guidance')).toHaveTextContent('Add one or more brands or a category.');
    expect(screen.getByTestId('cultural-topic-guidance')).toHaveTextContent('Add a question or topic you want to explore.');
  });

  it('shows brand suggestions as user types', async () => {
    render(<App />);
    await waitForSplashToDisappear();
    await openResearchExperience();
    const brandInput = screen.getByPlaceholderText(/Brands? or Category \(Optional\)/i);
    fireEvent.change(brandInput, { target: { value: 'N' } });
    fireEvent.change(brandInput, { target: { value: 'Ni' } });
    await waitFor(() => expect(screen.getByText('Suggestions')).toBeInTheDocument());
    expect(screen.getByText('Nike')).toBeInTheDocument();
  });

  it('supports multiple brand chips while still allowing free-form category input', async () => {
    render(<App />);
    await waitForSplashToDisappear();
    await openResearchExperience();

    const brandInput = screen.getByTestId('cultural-brands-input');
    fireEvent.change(brandInput, { target: { value: 'Nike' } });
    fireEvent.keyDown(brandInput, { key: ',', code: 'Comma' });
    expect(await screen.findByTestId('cultural-brand-chip-0')).toHaveTextContent('Nike');

    fireEvent.change(brandInput, { target: { value: 'Adidas' } });
    fireEvent.keyDown(brandInput, { key: 'Enter', code: 'Enter' });
    expect(await screen.findByTestId('cultural-brand-chip-1')).toHaveTextContent('Adidas');

    fireEvent.keyDown(screen.getByTestId('cultural-brands-input'), { key: 'Backspace', code: 'Backspace' });
    await waitFor(() => {
      expect(screen.queryByTestId('cultural-brand-chip-1')).not.toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('cultural-brands-input'), { target: { value: 'Outdoor lifestyle' } });
    expect(screen.getByDisplayValue('Outdoor lifestyle')).toBeInTheDocument();
  });

  it('keeps topic input editable', async () => {
    render(<App />);
    await waitForSplashToDisappear();
    await openResearchExperience();
    const topicInput = screen.getByPlaceholderText(/Topic Focus \(Optional\)/i);
    fireEvent.change(topicInput, { target: { value: 'Sneakers' } });
    await waitFor(() => expect(screen.getByDisplayValue('Sneakers')).toBeInTheDocument());
  });

  it('shows validation error if audience is empty on generate', async () => {
    render(<App />);
    await waitForSplashToDisappear();
    await openResearchExperience();
    const generateBtn = screen.getByRole('button', { name: /generate/i });
    fireEvent.click(generateBtn);
    expect(await screen.findByText(/Audience is required/i)).toBeInTheDocument();
  });

  it('shows loading state when generating', async () => {
    // Mock generateCulturalMatrix to delay
    const azure = await import('./services/azure-openai');
    vi.spyOn(azure, 'generateCulturalMatrix').mockImplementation(() => new Promise(() => {}));
    render(<App />);
    await waitForSplashToDisappear();
    await openResearchExperience();
    fireEvent.change(screen.getByPlaceholderText(/Primary Audience/i), { target: { value: 'Gen Z' } });
    const generateBtn = screen.getByRole('button', { name: /generate/i });
    fireEvent.click(generateBtn);
    expect(screen.getByText(/Scanning latest audience signals|Synthesizing cultural tensions|Ranking highest-potency insights|Shaping strategist-ready output/i)).toBeInTheDocument();
  });

  it('shows error toast if brand suggestion fails', async () => {
    const { suggestBrands } = await import('./services/azure-openai');
    vi.mocked(suggestBrands).mockRejectedValueOnce(new Error('API error'));
    render(<App />);
    await waitForSplashToDisappear();
    await openResearchExperience();
    const brandInput = screen.getByPlaceholderText(/Brands? or Category/i);
    fireEvent.change(brandInput, { target: { value: 'Ni' } });
    await waitFor(() => expect(screen.getByText(/Failed to get brand suggestions/i)).toBeInTheDocument());
  });

  it('shows a mobile hamburger menu for top navigation links', async () => {
    render(<App />);
    await waitForSplashToDisappear();
    await openResearchExperience();

    const actionBar = screen.getByTestId('top-action-buttons');
    expect(actionBar).toHaveClass('hidden');
    expect(actionBar).toHaveClass('sm:flex-row');

    fireEvent.click(screen.getByTestId('mobile-nav-trigger'));
    const mobileMenu = await screen.findByTestId('mobile-nav-menu');
    expect(mobileMenu).toBeInTheDocument();
    expect(within(mobileMenu).getByRole('link', { name: /back to home/i })).toHaveAttribute('href', '/?home=1');
    expect(within(mobileMenu).getByRole('link', { name: /brand navigator/i })).toHaveAttribute('href', '/#brand-navigator');
    expect(within(mobileMenu).getByRole('link', { name: /design excavator/i })).toHaveAttribute('href', '/#design-excavator');

    expect(within(actionBar).getByRole('link', { name: /brand navigator/i })).toHaveAttribute('href', '/#brand-navigator');
    expect(within(actionBar).getByRole('link', { name: /design excavator/i })).toHaveAttribute('href', '/#design-excavator');
  });
});
