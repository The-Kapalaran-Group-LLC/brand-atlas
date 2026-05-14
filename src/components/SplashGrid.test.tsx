import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SplashGrid } from './SplashGrid';

describe('SplashGrid', () => {
  it('renders the splash globe canvas', () => {
    render(<SplashGrid />);

    const canvas = screen.getByTestId('splash-globe-canvas');

    expect(canvas).toBeInTheDocument();
    expect(canvas).toHaveStyle({ touchAction: 'auto' });
    expect(canvas).toHaveStyle({ cursor: 'default' });
    expect(canvas).toHaveAttribute('data-quality-mode', 'auto');
  });

  it('supports a fast quality mode for splash-only rendering', () => {
    render(<SplashGrid qualityMode="fast" />);

    const canvas = screen.getByTestId('splash-globe-canvas');

    expect(canvas).toHaveAttribute('data-quality-mode', 'fast');
  });
});
