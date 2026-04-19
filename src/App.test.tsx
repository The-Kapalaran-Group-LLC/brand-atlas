import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { describe, it, expect, vi } from 'vitest';

// Mock azure-openai service for async flows
vi.mock('./services/azure-openai', () => ({
  ...vi.importActual('./services/azure-openai'),
  suggestBrands: vi.fn().mockResolvedValue(['Nike', 'Nestle']),
  autoPopulateFields: vi.fn().mockResolvedValue({ audience: 'Gen Z' }),
}));

describe('App Component', () => {
  async function waitForSplashToDisappear() {
    // Wait for splash screen to be fully unmounted (not in DOM)
    await waitFor(() => {
      return screen.queryByTestId('splash-screen') === null;
    }, { timeout: 3000 });
  }

  it('renders the main heading', async () => {
    render(<App />);
    await waitForSplashToDisappear();
    // Click the experience button to show main form
    fireEvent.click(screen.getByText(/Cultural Archaeologist/i));
    expect(screen.getByPlaceholderText(/Brand or Category \(Optional\)/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Primary Audience \(Required\) \*/i)).toBeInTheDocument();
  });

  it('has input fields for brand and audience', async () => {
    render(<App />);
    await waitForSplashToDisappear();
    fireEvent.click(screen.getByText(/Cultural Archaeologist/i));
    expect(screen.getByPlaceholderText(/Brand or Category \(Optional\)/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Primary Audience \(Required\) \*/i)).toBeInTheDocument();
  });

  it('shows brand suggestions as user types', async () => {
    render(<App />);
    await waitForSplashToDisappear();
    fireEvent.click(screen.getByText(/Cultural Archaeologist/i));
    const brandInput = screen.getByPlaceholderText(/Brand or Category \(Optional\)/i);
    fireEvent.change(brandInput, { target: { value: 'N' } });
    fireEvent.change(brandInput, { target: { value: 'Ni' } });
    await waitFor(() => expect(screen.getByText('Suggestions')).toBeInTheDocument());
    expect(screen.getByText('Nike')).toBeInTheDocument();
  });

  it('auto-populates audience from topic', async () => {
    render(<App />);
    await waitForSplashToDisappear();
    fireEvent.click(screen.getByText(/Cultural Archaeologist/i));
    const topicInput = screen.getByPlaceholderText(/Topic Focus \(Optional\)/i);
    fireEvent.change(topicInput, { target: { value: 'Sneakers' } });
    await waitFor(() => expect(screen.getByDisplayValue('Gen Z')).toBeInTheDocument());
  });

  it('shows validation error if audience is empty on generate', async () => {
    render(<App />);
    await waitForSplashToDisappear();
    fireEvent.click(screen.getByText(/Cultural Archaeologist/i));
    const generateBtn = screen.getByRole('button', { name: /generate/i });
    fireEvent.click(generateBtn);
    expect(await screen.findByText(/Audience is required/i)).toBeInTheDocument();
  });

  it('shows loading state when generating', async () => {
    // Mock generateCulturalMatrix to delay
    const { generateCulturalMatrix } = await import('./services/azure-openai');
    vi.spyOn(generateCulturalMatrix, 'default').mockImplementation(() => new Promise(() => {}));
    render(<App />);
    await waitForSplashToDisappear();
    fireEvent.change(screen.getByPlaceholderText(/Primary Audience/i), { target: { value: 'Gen Z' } });
    const generateBtn = screen.getByRole('button', { name: /generate/i });
    fireEvent.click(generateBtn);
    expect(screen.getByText(/Finding suggestions|Loading|Generating|Progress/i)).toBeInTheDocument();
  });

  it('shows error toast if brand suggestion fails', async () => {
    const { suggestBrands } = await import('./services/azure-openai');
    suggestBrands.mockRejectedValueOnce(new Error('API error'));
    render(<App />);
    await waitForSplashToDisappear();
    const brandInput = screen.getByPlaceholderText(/Brand or Category/i);
    fireEvent.change(brandInput, { target: { value: 'Ni' } });
    await waitFor(() => expect(screen.getByText(/Failed to get brand suggestions/i)).toBeInTheDocument());
  });

  it('stacks the top action buttons on mobile to add spacing', async () => {
    render(<App />);
    await waitForSplashToDisappear();
    fireEvent.click(screen.getByText(/Cultural Archaeologist/i));

    const actionBar = screen.getByRole('button', { name: /visual design excavator/i }).parentElement;

    expect(actionBar).toHaveClass('flex-col');
    expect(actionBar).toHaveClass('gap-3');
    expect(actionBar).toHaveClass('sm:flex-row');
  });
});
