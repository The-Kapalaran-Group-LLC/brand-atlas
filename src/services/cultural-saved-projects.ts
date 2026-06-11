import type { CulturalMatrix, MatrixItem, Source } from './azure-openai';

const MATRIX_INSIGHT_KEYS = [
  'moments',
  'beliefs',
  'behaviors',
  'contradictions',
  'tone',
  'language',
  'community',
  'influencers',
] as const;

type MatrixInsightKey = (typeof MATRIX_INSIGHT_KEYS)[number];

export type SavedMatrixRecord = {
  id: string;
  date: string;
  brand: string;
  audience: string;
  generations: string[];
  topicFocus?: string;
  sourcesType?: string[];
  hasUploadedDocuments?: boolean;
  customName?: string;
  matrix: CulturalMatrix;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
};

const toStringValue = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
};

const toOptionalString = (value: unknown): string | undefined => {
  const text = toStringValue(value).trim();
  return text.length > 0 ? text : undefined;
};

const toStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => toStringValue(entry).trim())
      .filter(Boolean);
  }

  const asString = toStringValue(value).trim();
  if (!asString) return [];
  return asString
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const toBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lowered = value.trim().toLowerCase();
    if (lowered === 'true') return true;
    if (lowered === 'false') return false;
  }
  return undefined;
};

const toNullableString = (value: unknown): string | null => {
  const text = toStringValue(value).trim();
  return text.length > 0 ? text : null;
};

const isMatrixItem = (value: unknown): value is MatrixItem => {
  if (!isRecord(value)) return false;
  return (
    typeof value.text === 'string' &&
    typeof value.isHighlyUnique === 'boolean'
  );
};

const normalizeMatrixItems = (value: unknown): MatrixItem[] => {
  if (!Array.isArray(value)) return [];
  return value.filter(isMatrixItem);
};

const normalizeSources = (value: unknown): Source[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!isRecord(entry)) return null;
      const title = toStringValue(entry.title).trim();
      const url = toStringValue(entry.url).trim();
      if (!title || !url) return null;
      return { title, url };
    })
    .filter((entry): entry is Source => Boolean(entry));
};

const normalizeCulturalMatrix = (value: unknown): CulturalMatrix | null => {
  if (!isRecord(value)) return null;

  const demographicsCandidate = isRecord(value.demographics) ? value.demographics : {};
  const vocabularyCandidate = isRecord(value.vocabulary) ? value.vocabulary : null;
  const normalizedVocabulary = vocabularyCandidate
    ? {
        wordsTheyUse: toStringArray(vocabularyCandidate.wordsTheyUse),
        wordsToAvoid: toStringArray(vocabularyCandidate.wordsToAvoid),
      }
    : undefined;

  const normalizedMatrix: CulturalMatrix = {
    demographics: {
      age: toNullableString(demographicsCandidate.age),
      race: toNullableString(demographicsCandidate.race),
      gender: toNullableString(demographicsCandidate.gender),
    },
    sociological_analysis: toStringValue(
      value.sociological_analysis ?? value.sociologicalAnalysis
    ),
    moments: normalizeMatrixItems(value.moments),
    beliefs: normalizeMatrixItems(value.beliefs),
    tone: normalizeMatrixItems(value.tone),
    language: normalizeMatrixItems(value.language),
    behaviors: normalizeMatrixItems(value.behaviors),
    contradictions: normalizeMatrixItems(value.contradictions),
    community: normalizeMatrixItems(value.community),
    influencers: normalizeMatrixItems(value.influencers),
    sources: normalizeSources(value.sources),
    ...(normalizedVocabulary ? { vocabulary: normalizedVocabulary } : {}),
  };

  return normalizedMatrix;
};

const resolveSavedMatrixId = (value: unknown): string => {
  return toStringValue(value).trim();
};

export const normalizeSavedMatrixRecord = (
  row: unknown
): SavedMatrixRecord | null => {
  if (!isRecord(row)) {
    return null;
  }

  const id = resolveSavedMatrixId(row.id);
  if (!id) {
    return null;
  }

  const matrixCandidate = row.matrix ?? row.results;
  const matrix = normalizeCulturalMatrix(matrixCandidate);
  if (!matrix) {
    return null;
  }

  const createdDate =
    toOptionalString(row.date) ||
    toOptionalString(row.createdAt) ||
    toOptionalString(row.created_at) ||
    new Date().toISOString();

  return {
    id,
    date: createdDate,
    brand: toStringValue(row.brand).trim(),
    audience: toStringValue(row.audience).trim(),
    generations: toStringArray(row.generations),
    topicFocus: toOptionalString(row.topicFocus ?? row.topic_focus),
    sourcesType: toStringArray(row.sourcesType ?? row.sources_type),
    hasUploadedDocuments: toBoolean(row.hasUploadedDocuments ?? row.has_uploaded_documents),
    customName: toOptionalString(row.customName ?? row.custom_name),
    matrix,
  };
};

export const normalizeSavedMatrixRecords = (
  rows: unknown[]
): SavedMatrixRecord[] => {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => normalizeSavedMatrixRecord(row))
    .filter((row): row is SavedMatrixRecord => Boolean(row));
};

export const hasMatrixDeepDiveContent = (
  matrix: CulturalMatrix | null | undefined
): boolean => {
  if (!matrix) return false;

  return MATRIX_INSIGHT_KEYS.some((key: MatrixInsightKey) => {
    const items = Array.isArray(matrix[key]) ? matrix[key] : [];
    return items.some((item) => {
      if (!item.deepDive) return false;
      const deepDive = item.deepDive;
      return Boolean(
        toStringValue(deepDive.expandedContext).trim() ||
          toStringValue(deepDive.relevance).trim() ||
          toStringValue(deepDive.originationDate).trim() ||
          (Array.isArray(deepDive.strategicImplications) &&
            deepDive.strategicImplications.length > 0) ||
          (Array.isArray(deepDive.realWorldExamples) &&
            deepDive.realWorldExamples.length > 0) ||
          (Array.isArray(deepDive.sources) && deepDive.sources.length > 0)
      );
    });
  });
};
