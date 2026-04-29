const normalizeHashTarget = (target: string): string => {
  const trimmed = target.trim().toLowerCase();
  if (!trimmed) return '';
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
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
