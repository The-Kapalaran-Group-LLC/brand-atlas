export type CulturalPrefillPayload = {
  audience?: string;
  brand?: string;
  topicFocus?: string;
};

const CULTURAL_PREFILL_STORAGE_KEY = 'cultural_archaeologist_prefill_payload';

export const saveCulturalPrefill = (payload: CulturalPrefillPayload): void => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(CULTURAL_PREFILL_STORAGE_KEY, JSON.stringify(payload || {}));
  } catch (error) {
    console.warn('[CulturalPrefill] Failed to save prefill payload.', error);
  }
};

export const readCulturalPrefill = (): CulturalPrefillPayload | null => {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(CULTURAL_PREFILL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CulturalPrefillPayload;
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch (error) {
    console.warn('[CulturalPrefill] Failed to read prefill payload.', error);
    return null;
  }
};

export const clearCulturalPrefill = (): void => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(CULTURAL_PREFILL_STORAGE_KEY);
  } catch (error) {
    console.warn('[CulturalPrefill] Failed to clear prefill payload.', error);
  }
};
