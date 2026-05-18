import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { navigateToHashRoute, navigateToHomeDashboard } from './navigation';

const setWindowWidth = (width: number) => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });
};

describe('navigation mobile scroll reset', () => {
  const originalScrollTo = window.scrollTo;
  const originalRaf = window.requestAnimationFrame;

  beforeEach(() => {
    window.history.replaceState({}, '', '/');
    setWindowWidth(375);
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
    window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    }) as typeof window.requestAnimationFrame;
  });

  afterEach(() => {
    window.scrollTo = originalScrollTo;
    window.requestAnimationFrame = originalRaf;
  });

  it('scrolls to top on mobile when navigating to a hash route', () => {
    navigateToHashRoute('brand-navigator');
    expect(window.scrollTo).toHaveBeenCalled();
  });

  it('scrolls to top on mobile when navigating home', () => {
    navigateToHomeDashboard();
    expect(window.scrollTo).toHaveBeenCalled();
  });

  it('does not force scroll reset on desktop width', () => {
    setWindowWidth(1200);
    navigateToHashRoute('design-excavator');
    expect(window.scrollTo).not.toHaveBeenCalled();
  });
});
