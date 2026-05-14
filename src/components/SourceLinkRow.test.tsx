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
});

