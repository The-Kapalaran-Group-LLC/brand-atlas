import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SplashGrid } from './SplashGrid';

describe('SplashGrid', () => {
  it('renders a pre-rendered splash loop by default for smoother idle playback', () => {
    render(<SplashGrid />);

    const preview = screen.getByTestId('splash-globe-preview');

    expect(preview).toBeInTheDocument();
    expect(preview.getAttribute('src')).toContain('/assets/menupage-globe-loop.gif');
    expect(screen.queryByTestId('splash-globe-canvas')).not.toBeInTheDocument();
  });

  it('supports a fast quality mode for splash-only rendering', () => {
    render(<SplashGrid qualityMode="fast" usePreRenderedLoop={false} />);

    const canvas = screen.getByTestId('splash-globe-canvas');

    expect(canvas).toHaveAttribute('data-quality-mode', 'fast');
  });

  it('switches from pre-rendered loop to live canvas after pointer interaction when interactive', () => {
    render(<SplashGrid interactive />);

    const activationLayer = screen.getByTestId('splash-globe-activate-live');
    fireEvent.pointerDown(activationLayer, { pointerId: 1, clientX: 100, clientY: 100 });

    expect(screen.getByTestId('splash-globe-canvas')).toBeInTheDocument();
    expect(screen.queryByTestId('splash-globe-preview')).not.toBeInTheDocument();
  });
});
