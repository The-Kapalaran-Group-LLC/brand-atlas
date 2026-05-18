const normalizeHashTarget = (target: string): string => {
  const trimmed = target.trim().toLowerCase();
  if (!trimmed) return '';
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
};

const MOBILE_MAX_WIDTH_PX = 639;

const scrollToTopOnMobile = (): void => {
  if (typeof window === 'undefined') {
    return;
  }

  if (window.innerWidth > MOBILE_MAX_WIDTH_PX) {
    return;
  }

  try {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  } catch {
    try {
      window.scrollTo(0, 0);
    } catch {
      // no-op for environments without scroll support
    }
  }
};

const resetMobileScrollAfterNavigation = (): void => {
  if (typeof window === 'undefined') {
    return;
  }

  scrollToTopOnMobile();
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => {
      scrollToTopOnMobile();
    });
    return;
  }

  window.setTimeout(() => {
    scrollToTopOnMobile();
  }, 0);
};

export const navigateToHomeDashboard = (): void => {
  if (typeof window === 'undefined') {
    return;
  }

  console.log('[navigation] Navigating to dashboard route:', {
    pathname: window.location.pathname,
    search: window.location.search,
    hash: window.location.hash,
  });

  const nextUrl = '/?home=1';
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (currentUrl === nextUrl) {
    resetMobileScrollAfterNavigation();
    window.dispatchEvent(new Event('popstate'));
    return;
  }

  window.history.pushState({}, '', nextUrl);
  resetMobileScrollAfterNavigation();
  window.dispatchEvent(new Event('popstate'));
};

export const navigateToHashRoute = (target: string): void => {
  if (typeof window === 'undefined') {
    return;
  }

  const normalizedTarget = normalizeHashTarget(target);
  if (!normalizedTarget) {
    return;
  }

  console.log('[navigation] Navigating to hash route:', {
    from: window.location.hash,
    to: normalizedTarget,
    pathname: window.location.pathname,
  });

  if (window.location.hash.toLowerCase() === normalizedTarget) {
    resetMobileScrollAfterNavigation();
    window.dispatchEvent(new Event('hashchange'));
    return;
  }

  window.location.hash = normalizedTarget.slice(1);
  resetMobileScrollAfterNavigation();
};
