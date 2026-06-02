import type { MatrixItem, DeepDiveReport } from './azure-openai';

export type CulturalBackfillKey =
  | 'moments'
  | 'beliefs'
  | 'behaviors'
  | 'contradictions'
  | 'tone'
  | 'language'
  | 'community'
  | 'influencers';

export const CULTURAL_BACKFILL_KEYS: CulturalBackfillKey[] = [
  'moments',
  'beliefs',
  'behaviors',
  'contradictions',
  'tone',
  'language',
  'community',
  'influencers',
];

export type CulturalBackfillContext = {
  audience: string;
  brand: string;
  generations: string[];
  topicFocus?: string;
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const parseJsonValue = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) {
    return value;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
};

const toRecordValue = (value: unknown): Record<string, unknown> | null => {
  const parsed = parseJsonValue(value);
  return isRecord(parsed) ? parsed : null;
};

const toStringValue = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
};

const toStringList = (value: unknown): string[] => {
  const parsed = parseJsonValue(value);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((item) => toStringValue(item).trim())
    .filter(Boolean);
};

const isTextLikelyMissing = (value: string): boolean => {
  const normalized = value.trim().toLowerCase();
  return !normalized || normalized === 'n/a' || normalized === 'na' || normalized === 'data unavailable';
};

const hasCulturalSections = (value: unknown): boolean => {
  const record = toRecordValue(value);
  if (!record) return false;
  return CULTURAL_BACKFILL_KEYS.some((key) => Array.isArray(parseJsonValue(record[key])));
};

const hasCulturalPayloadSignals = (value: unknown): value is Record<string, unknown> => {
  const record = toRecordValue(value);
  if (!record) return false;
  if (hasCulturalSections(record)) return true;
  if (Boolean(toStringValue(record.sociological_analysis || record.sociologicalAnalysis).trim())) return true;
  if (toRecordValue(record.demographics)) return true;
  if (Array.isArray(parseJsonValue(record.sources))) return true;
  return false;
};

export const getMissingDeepDiveIndices = (items: MatrixItem[]): number[] => {
  if (!Array.isArray(items)) return [];

  return items.flatMap((item, index) => {
    const record = isRecord(item) ? item : null;
    if (!item || item.deepDive || Boolean(record?.deep_dive)) return [];
    if (isTextLikelyMissing(toStringValue(item.text))) return [];
    return [index];
  });
};

export const applyDeepDiveReports = (
  items: MatrixItem[],
  targetIndices: number[],
  reports: DeepDiveReport[],
): number => {
  const safeItems = Array.isArray(items) ? items : [];
  const safeTargets = Array.isArray(targetIndices) ? targetIndices : [];
  const safeReports = Array.isArray(reports) ? reports : [];

  let applied = 0;
  const count = Math.min(safeTargets.length, safeReports.length);
  for (let idx = 0; idx < count; idx += 1) {
    const itemIndex = safeTargets[idx];
    if (typeof itemIndex !== 'number') continue;
    if (!safeItems[itemIndex]) continue;
    safeItems[itemIndex].deepDive = safeReports[idx];
    applied += 1;
  }
  return applied;
};

export const extractBackfillContext = (row: Record<string, unknown>): CulturalBackfillContext => {
  const generations = toStringList(row.generations);
  const audience = toStringValue(row.audience).trim();
  const brand = toStringValue(row.brand).trim();
  const topicFocus = toStringValue(row.topicFocus ?? row.topic_focus).trim();

  return {
    audience: audience || 'Unknown audience',
    brand,
    generations,
    topicFocus: topicFocus || undefined,
  };
};

export const resolveCulturalPayload = (
  row: Record<string, unknown>,
): { columnName: 'results' | 'matrix'; payload: Record<string, unknown> } | null => {
  // Keep this aligned with AdminPage, which prefers `matrix` over `results`.
  const matrixRecord = toRecordValue(row.matrix);
  const matrixNestedResults = matrixRecord ? toRecordValue(matrixRecord.results) : null;
  if (matrixNestedResults && hasCulturalPayloadSignals(matrixNestedResults)) {
    return { columnName: 'matrix', payload: matrixNestedResults };
  }
  if (matrixRecord && hasCulturalPayloadSignals(matrixRecord)) {
    return { columnName: 'matrix', payload: matrixRecord };
  }

  const resultsRecord = toRecordValue(row.results);
  const resultsNestedMatrix = resultsRecord ? toRecordValue(resultsRecord.matrix) : null;
  if (resultsNestedMatrix && hasCulturalPayloadSignals(resultsNestedMatrix)) {
    return { columnName: 'results', payload: resultsNestedMatrix };
  }
  if (resultsRecord && hasCulturalPayloadSignals(resultsRecord)) {
    return { columnName: 'results', payload: resultsRecord };
  }

  if (hasCulturalPayloadSignals(row)) {
    return { columnName: 'results', payload: row };
  }
  return null;
};
