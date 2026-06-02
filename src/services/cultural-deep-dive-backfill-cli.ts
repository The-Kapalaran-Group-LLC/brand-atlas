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

  const readOptionValue = (
    arg: string,
    index: number,
    optionName: string,
  ): { value: string | null; nextIndex: number } => {
    const withEqualsPrefix = `${optionName}=`;
    if (arg.startsWith(withEqualsPrefix)) {
      return {
        value: arg.slice(withEqualsPrefix.length).trim(),
        nextIndex: index,
      };
    }
    if (arg === optionName) {
      const nextToken = argv[index + 1];
      if (typeof nextToken === 'string' && !nextToken.startsWith('--')) {
        return {
          value: nextToken.trim(),
          nextIndex: index + 1,
        };
      }
    }
    return { value: null, nextIndex: index };
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--commit') options.commit = true;
    if (arg === '--scan-only') options.scanOnly = true;
    if (arg === '--repeat-until-clean') options.repeatUntilClean = true;
    if (arg === '--all-tables') options.allTables = true;
    if (arg === '--first-table-only') options.allTables = false;

    const rowIdOption = readOptionValue(arg, index, '--row-id');
    if (rowIdOption.value) {
      options.rowId = rowIdOption.value;
      index = rowIdOption.nextIndex;
    }

    const tableOption = readOptionValue(arg, index, '--table');
    if (tableOption.value) {
      options.table = tableOption.value;
      index = tableOption.nextIndex;
    }

    const limitOption = readOptionValue(arg, index, '--limit');
    if (limitOption.value) {
      const parsed = Number(limitOption.value);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.limit = Math.floor(parsed);
      }
      index = limitOption.nextIndex;
    }

    if (arg === '--no-limit') {
      options.limit = null;
    }

    const batchSizeOption = readOptionValue(arg, index, '--batch-size');
    if (batchSizeOption.value) {
      const parsed = Number(batchSizeOption.value);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.batchSize = Math.floor(parsed);
      }
      index = batchSizeOption.nextIndex;
    }

    const deepDiveChunkOption = readOptionValue(arg, index, '--deep-dive-batch-chunk-size');
    if (deepDiveChunkOption.value) {
      const parsed = Number(deepDiveChunkOption.value);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.deepDiveBatchChunkSize = Math.floor(parsed);
      }
      index = deepDiveChunkOption.nextIndex;
    }

    const maxCategoryPassesOption = readOptionValue(arg, index, '--max-category-passes');
    if (maxCategoryPassesOption.value) {
      const parsed = Number(maxCategoryPassesOption.value);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.maxCategoryPasses = Math.floor(parsed);
      }
      index = maxCategoryPassesOption.nextIndex;
    }

    if (arg === '--no-single-fallback') {
      options.fallbackSingles = false;
    }
  }

  return options;
};
