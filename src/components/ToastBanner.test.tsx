import { render, screen, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ToastBanner } from './ToastBanner';

describe('ToastBanner', () => {
  it('auto-dismisses PDF success toast after 3 seconds', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();

    render(<ToastBanner toast="PDF exported successfully!" onDismiss={onDismiss} />);

    expect(screen.getByText('PDF exported successfully!')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2999);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('auto-dismisses PowerPoint success toast after 3 seconds', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();

    render(<ToastBanner toast="PowerPoint exported successfully!" onDismiss={onDismiss} />);

    expect(screen.getByText('PowerPoint exported successfully!')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2999);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('does not auto-dismiss non-PDF toasts', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();

    render(<ToastBanner toast="Generating PDF..." onDismiss={onDismiss} />);

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(onDismiss).not.toHaveBeenCalled();
    expect(screen.getByText('Generating PDF...')).toBeInTheDocument();

    vi.useRealTimers();
  });
});
