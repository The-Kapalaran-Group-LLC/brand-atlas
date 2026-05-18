import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProgressiveLoader } from './ProgressiveLoader';

describe('ProgressiveLoader', () => {
  it('uses mobile-friendly wrapping classes so message text is not clipped', () => {
    render(
      <ProgressiveLoader
        messages={['Collecting brand ecosystem snapshots...']}
        showProgress
        progress={52}
        averageDurationMs={4000}
      />
    );

    const message = screen.getByText('Collecting brand ecosystem snapshots...');
    expect(message.className).toContain('whitespace-normal');
    expect(message.className).toContain('break-words');
    expect(message.className).toContain('sm:whitespace-nowrap');
  });
});
