import { describe, expect, it } from 'vitest';
import { parseCulturalBackfillCliArgs } from './cultural-deep-dive-backfill-cli';

describe('parseCulturalBackfillCliArgs', () => {
  it('enables repeat-until-clean when requested', () => {
    const options = parseCulturalBackfillCliArgs(['--repeat-until-clean']);
    expect(options.repeatUntilClean).toBe(true);
  });

  it('parses common backfill arguments', () => {
    const options = parseCulturalBackfillCliArgs([
      '--commit',
      '--no-limit',
      '--first-table-only',
      '--batch-size=150',
      '--deep-dive-batch-chunk-size=1',
      '--max-category-passes=12',
      '--table=Cultural_Archaeologist',
      '--row-id=123',
    ]);

    expect(options.commit).toBe(true);
    expect(options.limit).toBeNull();
    expect(options.allTables).toBe(false);
    expect(options.batchSize).toBe(150);
    expect(options.deepDiveBatchChunkSize).toBe(1);
    expect(options.maxCategoryPasses).toBe(12);
    expect(options.table).toBe('Cultural_Archaeologist');
    expect(options.rowId).toBe('123');
  });
});
