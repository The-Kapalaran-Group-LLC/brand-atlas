export const MAX_AUDIENCE_HISTORY_ITEMS = 25;
const UNKNOWN_IP_BUCKET = 'unknown-ip';

export const APP_AUDIENCE_HISTORY_MODES = {
  CULTURAL_ARCHAEOLOGIST: 'cultural_archaeologist_audience_history',
} as const;

export type AudienceHistoryMode =
  (typeof APP_AUDIENCE_HISTORY_MODES)[keyof typeof APP_AUDIENCE_HISTORY_MODES];

type AudienceHistoryStore = Record<string, string[]>;

const safeLocalStorage = (): Storage | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch (error) {
    console.error('[audience-history] Unable to access localStorage.', error);
    return null;
  }
};

const normalizeIpBucket = (ipAddress: string): string => {
  const trimmed = (ipAddress || '').trim();
  return trimmed.length > 0 ? trimmed : UNKNOWN_IP_BUCKET;
};

const normalizeAudienceValue = (audience: string): string => {
  return (audience || '')
    .replace(/\s+/g, ' ')
    .trim();
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
};

const sanitizeAudienceBucket = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const deduped = new Set<string>();
  const sanitized: string[] = [];
  value.forEach((candidate) => {
    if (typeof candidate !== 'string') {
      return;
    }
    const normalized = normalizeAudienceValue(candidate);
    if (!normalized) {
      return;
    }
    const key = normalized.toLowerCase();
    if (deduped.has(key)) {
      return;
    }
    deduped.add(key);
    sanitized.push(normalized);
  });

  return sanitized.slice(0, MAX_AUDIENCE_HISTORY_ITEMS);
};

const readHistoryStore = (mode: AudienceHistoryMode): AudienceHistoryStore => {
  const storage = safeLocalStorage();
  if (!storage) {
    console.log('[audience-history] No storage available. Returning empty store.', { mode });
    return {};
  }

  try {
    const raw = storage.getItem(mode);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) {
      console.log('[audience-history] Stored value is not an object. Resetting mode.', { mode });
      return {};
    }

    const sanitizedStore: AudienceHistoryStore = {};
    Object.entries(parsed).forEach(([ipBucket, value]) => {
      sanitizedStore[ipBucket] = sanitizeAudienceBucket(value);
    });
    return sanitizedStore;
  } catch (error) {
    console.error('[audience-history] Failed to parse history store.', { mode, error });
    return {};
  }
};

const writeHistoryStore = (mode: AudienceHistoryMode, store: AudienceHistoryStore): void => {
  const storage = safeLocalStorage();
  if (!storage) {
    console.log('[audience-history] No storage available. Skipping save.', { mode });
    return;
  }

  try {
    storage.setItem(mode, JSON.stringify(store));
  } catch (error) {
    console.error('[audience-history] Failed to persist history store.', { mode, error });
  }
};

export const getAudienceHistory = (
  mode: AudienceHistoryMode,
  ipAddress: string
): string[] => {
  const store = readHistoryStore(mode);
  const ipBucket = normalizeIpBucket(ipAddress);
  return sanitizeAudienceBucket(store[ipBucket]);
};

export const saveAudienceHistoryEntry = (
  mode: AudienceHistoryMode,
  ipAddress: string,
  audience: string
): string[] => {
  const normalizedAudience = normalizeAudienceValue(audience);
  if (!normalizedAudience) {
    return getAudienceHistory(mode, ipAddress);
  }

  const store = readHistoryStore(mode);
  const ipBucket = normalizeIpBucket(ipAddress);
  const existing = sanitizeAudienceBucket(store[ipBucket]);
  const deduped = existing.filter((candidate) => candidate.toLowerCase() !== normalizedAudience.toLowerCase());
  const nextBucket = [normalizedAudience, ...deduped].slice(0, MAX_AUDIENCE_HISTORY_ITEMS);
  const nextStore: AudienceHistoryStore = {
    ...store,
    [ipBucket]: nextBucket,
  };

  writeHistoryStore(mode, nextStore);
  console.log('[audience-history] Saved audience entry.', {
    mode,
    ipBucket,
    audience: normalizedAudience,
    nextCount: nextBucket.length,
  });
  return nextBucket;
};

export const clearAudienceHistory = (
  mode: AudienceHistoryMode,
  ipAddress?: string
): void => {
  const storage = safeLocalStorage();
  if (!storage) {
    console.log('[audience-history] No storage available. Skipping clear.', { mode, ipAddress });
    return;
  }

  try {
    if (!ipAddress || !ipAddress.trim()) {
      storage.removeItem(mode);
      return;
    }

    const store = readHistoryStore(mode);
    const ipBucket = normalizeIpBucket(ipAddress);
    if (!store[ipBucket]) {
      return;
    }
    const nextStore = { ...store };
    delete nextStore[ipBucket];
    writeHistoryStore(mode, nextStore);
  } catch (error) {
    console.error('[audience-history] Failed to clear history.', { mode, ipAddress, error });
  }
};
