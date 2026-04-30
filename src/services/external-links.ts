const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

export const isLocalOrPrivateHostname = (hostname?: string | null): boolean => {
  const normalized = (hostname || '').trim().toLowerCase();
  if (!normalized) return true;
  if (LOCAL_HOSTNAMES.has(normalized)) return true;
  if (/^10\./.test(normalized)) return true;
  if (/^192\.168\./.test(normalized)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(normalized)) return true;
  return false;
};

const getCurrentHostname = (overrideHostname?: string | null): string | null => {
  if (typeof overrideHostname === 'string') {
    return overrideHostname.trim().toLowerCase();
  }

  if (typeof window !== 'undefined' && window.location?.hostname) {
    return window.location.hostname.trim().toLowerCase();
  }

  return null;
};

export const normalizeExternalHttpUrl = (
  rawUrl?: string | null,
  options?: { currentHostname?: string | null }
): string | null => {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) return null;

  const hasAnyProtocol = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
  if (hasAnyProtocol && !/^https?:\/\//i.test(trimmed)) {
    console.log('[external-links] Rejected URL due to unsupported protocol prefix.', { rawUrl });
    return null;
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      console.log('[external-links] Rejected URL due to unsupported protocol.', {
        rawUrl,
        protocol: parsed.protocol,
      });
      return null;
    }

    const currentHostname = getCurrentHostname(options?.currentHostname);
    if (isLocalOrPrivateHostname(parsed.hostname) && currentHostname && !isLocalOrPrivateHostname(currentHostname)) {
      console.log('[external-links] Rejected private/localhost URL while running on deployed host.', {
        rawUrl,
        parsedHostname: parsed.hostname,
        currentHostname,
      });
      return null;
    }

    return parsed.toString();
  } catch {
    console.log('[external-links] Rejected invalid URL.', { rawUrl });
    return null;
  }
};

export const sanitizeApiBaseUrl = (
  configuredUrl?: string | null,
  options?: { currentHostname?: string | null }
): string => {
  const trimmed = (configuredUrl || '').trim();
  if (!trimmed) return '';

  const noTrailingSlash = trimmed.replace(/\/$/, '');
  if (noTrailingSlash.startsWith('/')) {
    return noTrailingSlash;
  }

  try {
    const parsed = new URL(noTrailingSlash);
    const currentHostname = getCurrentHostname(options?.currentHostname);

    if (isLocalOrPrivateHostname(parsed.hostname) && currentHostname && !isLocalOrPrivateHostname(currentHostname)) {
      console.log('[external-links] Ignoring localhost/private API base for deployed browser host.', {
        configuredUrl,
        parsedHostname: parsed.hostname,
        currentHostname,
      });
      return '';
    }

    return noTrailingSlash;
  } catch {
    console.log('[external-links] API base URL is not absolute; preserving as-is.', { configuredUrl: noTrailingSlash });
    return noTrailingSlash;
  }
};

export const toSafeExternalHref = (rawUrl?: string | null): string => {
  return normalizeExternalHttpUrl(rawUrl) || '#';
};
