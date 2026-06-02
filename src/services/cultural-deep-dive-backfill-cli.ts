export type CulturalBackfillCliOptions = {
  commit: boolean;
  scanOnly: boolean;
  repeatUntilClean: boolean;
  limit: number | null;
  batchSize: number;
  deepDiveBatchChunkSize: number;
  maxCategoryPasses: number;
  fallbackSingles: boolean;
  rowId?: string;
  table?: string;
  allTables: boolean;
};

export const DEFAULT_BATCH_SIZE = 200;

export const parseCulturalBackfillCliArgs = (argv: string[]): CulturalBackfillCliOptions => {
  const options: CulturalBackfillCliOptions = {
    commit: false,
    scanOnly: false,
    repeatUntilClean: false,
    limit: null,
    batchSize: DEFAULT_BATCH_SIZE,
    deepDiveBatchChunkSize: 2,
    maxCategoryPasses: 8,
    fallbackSingles: true,
    allTables: true,
  };

  argv.forEach((arg) => {
    if (arg === '--commit') options.commit = true;
    if (arg === '--scan-only') options.scanOnly = true;
    if (arg === '--repeat-until-clean') options.repeatUntilClean = true;
    if (arg === '--all-tables') options.allTables = true;
    if (arg === '--first-table-only') options.allTables = false;
    if (arg.startsWith('--row-id=')) options.rowId = arg.slice('--row-id='.length).trim();
    if (arg.startsWith('--table=')) options.table = arg.slice('--table='.length).trim();
    if (arg.startsWith('--limit=')) {
      const parsed = Number(arg.slice('--limit='.length).trim());
      if (Number.isFinite(parsed) && parsed > 0) {
        options.limit = Math.floor(parsed);
      }
    }
    if (arg === '--no-limit') {
      options.limit = null;
    }
    if (arg.startsWith('--batch-size=')) {
      const parsed = Number(arg.slice('--batch-size='.length).trim());
      if (Number.isFinite(parsed) && parsed > 0) {
        options.batchSize = Math.floor(parsed);
      }
    }
    if (arg.startsWith('--deep-dive-batch-chunk-size=')) {
      const parsed = Number(arg.slice('--deep-dive-batch-chunk-size='.length).trim());
      if (Number.isFinite(parsed) && parsed > 0) {
        options.deepDiveBatchChunkSize = Math.floor(parsed);
      }
    }
    if (arg.startsWith('--max-category-passes=')) {
      const parsed = Number(arg.slice('--max-category-passes='.length).trim());
      if (Number.isFinite(parsed) && parsed > 0) {
        options.maxCategoryPasses = Math.floor(parsed);
      }
    }
    if (arg === '--no-single-fallback') {
      options.fallbackSingles = false;
    }
  });

  return options;
};
