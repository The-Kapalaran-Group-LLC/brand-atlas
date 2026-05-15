import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SourceLinkRow } from './SourceLinkRow';

describe('SourceLinkRow', () => {
  it('shows a failed-to-load indicator for invalid source URLs', () => {
    render(<SourceLinkRow index={0} title="Invalid source" url="not-a-real-url description text" />);

    const link = screen.getByRole('link', { name: /\[1\]invalid source/i });
    expect(link).toHaveAttribute('href', '#');
    expect(screen.getByText(/source failed to load/i)).toBeInTheDocument();
  });

  it('renders clean external links for valid URLs', () => {
    render(<SourceLinkRow index={1} title="Valid source" url="https://example.com/path" />);

    const link = screen.getByRole('link', { name: /\[2\]valid source/i });
    expect(link).toHaveAttribute('href', 'https://example.com/path');
    expect(screen.queryByText(/source failed to load/i)).not.toBeInTheDocument();
  });

  it('does not show a failed chip for valid URLs with whitespace', () => {
    render(<SourceLinkRow index={2} title="Trimmed source" url="   https://example.com/trimmed   " />);

    const link = screen.getByRole('link', { name: /\[3\]trimmed source/i });
    expect(link).toHaveAttribute('href', 'https://example.com/trimmed');
    expect(screen.queryByText(/source failed to load/i)).not.toBeInTheDocument();
  });
});
