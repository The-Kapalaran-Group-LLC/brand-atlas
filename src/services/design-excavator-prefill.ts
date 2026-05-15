export type DesignExcavatorPrefillBrand = {
  name: string;
  website?: string;
};

export type DesignExcavatorPrefillPayload = {
  brands?: DesignExcavatorPrefillBrand[];
  analysisObjective?: string;
  targetAudience?: string;
};

const DESIGN_EXCAVATOR_PREFILL_STORAGE_KEY = 'design_excavator_prefill_payload';

export const saveDesignExcavatorPrefill = (payload: DesignExcavatorPrefillPayload): void => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(DESIGN_EXCAVATOR_PREFILL_STORAGE_KEY, JSON.stringify(payload || {}));
  } catch (error) {
    console.warn('[DesignExcavatorPrefill] Failed to save prefill payload.', error);
  }
};

export const readDesignExcavatorPrefill = (): DesignExcavatorPrefillPayload | null => {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(DESIGN_EXCAVATOR_PREFILL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DesignExcavatorPrefillPayload;
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch (error) {
    console.warn('[DesignExcavatorPrefill] Failed to read prefill payload.', error);
    return null;
  }
};

export const clearDesignExcavatorPrefill = (): void => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(DESIGN_EXCAVATOR_PREFILL_STORAGE_KEY);
  } catch (error) {
    console.warn('[DesignExcavatorPrefill] Failed to clear prefill payload.', error);
  }
};

