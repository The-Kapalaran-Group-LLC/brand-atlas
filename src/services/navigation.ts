const normalizeHashTarget = (target: string): string => {
  const trimmed = target.trim().toLowerCase();
  if (!trimmed) return '';
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
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
    window.dispatchEvent(new Event('popstate'));
    return;
  }

  window.history.pushState({}, '', nextUrl);
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
    window.dispatchEvent(new Event('hashchange'));
    return;
  }

  window.location.hash = normalizedTarget.slice(1);
};
