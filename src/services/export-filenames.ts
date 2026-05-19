const SAFE_CHARS_REGEX = /[^a-zA-Z0-9 _-]/g;
const SPACE_REGEX = /\s+/g;

export const buildExportFileBase = (audience: unknown, fallbackBase: string): string => {
  const raw = typeof audience === 'string' ? audience : '';
  const normalized = raw.replace(SAFE_CHARS_REGEX, ' ').trim().replace(SPACE_REGEX, '_');
  if (!normalized) {
    return fallbackBase;
  }
  return normalized;
};
