import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import type { MatrixItem } from '../src/services/azure-openai';
import {
  parseCulturalBackfillCliArgs,
  type CulturalBackfillCliOptions,
} from '../src/services/cultural-deep-dive-backfill-cli';
import {
  CULTURAL_BACKFILL_KEYS,
  applyDeepDiveReports,
  extractBackfillContext,
  getMissingDeepDiveIndices,
  isRecord,
  resolveCulturalPayload,
} from '../src/services/cultural-deep-dive-backfill';

dotenv.config();
dotenv.config({ path: '.env.local', override: true });

const DEFAULT_TABLE_CANDIDATES = ['Cultural_Archaeologist', 'CulturalArchaeologist', 'culturalarchaeologist', 'searches'] as const;
const ORDER_COLUMNS = ['createdAt', 'created_at'] as const;

let deepDiveBatchGenerator:
  | ((insights: MatrixItem[], context: { audience: string; brand: string; generations: string[]; topicFocus?: string }) => Promise<any[]>)
  | null = null;
let deepDiveSingleGenerator:
  | ((insight: MatrixItem, context: { audience: string; brand: string; generations: string[]; topicFocus?: string }) => Promise<any>)
  | null = null;

const getDeepDiveBatchGenerator = async () => {
  if (deepDiveBatchGenerator) return deepDiveBatchGenerator;
  const module = await import('../src/services/azure-openai');
  deepDiveBatchGenerator = module.generateDeepDivesBatch;
  return deepDiveBatchGenerator;
};

const getDeepDiveSingleGenerator = async () => {
  if (deepDiveSingleGenerator) return deepDiveSingleGenerator;
  const module = await import('../src/services/azure-openai');
  deepDiveSingleGenerator = module.generateDeepDive;
  return deepDiveSingleGenerator;
};

type CliOptions = CulturalBackfillCliOptions;

const chunk = <T,>(items: T[], size: number): T[][] => {
  if (size <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const resolveSupabaseConfig = () => {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing Supabase config. Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY/VITE_SUPABASE_ANON_KEY).',
    );
  }

  return { url, key };
};

const loadRowsForTable = async (
  supabase: ReturnType<typeof createClient>,
  tableName: string,
  options: CliOptions,
): Promise<Record<string, unknown>[] | null> => {
  if (options.rowId) {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .eq('id', options.rowId)
      .limit(1);
    if (error) {
      console.log('[backfill] Row query failed.', { tableName, rowId: options.rowId, error: error.message });
      return null;
    }
    console.log('[backfill] Loaded row by id.', { tableName, count: Array.isArray(data) ? data.length : 0 });
    return (Array.isArray(data) ? data : []).filter(isRecord);
  }

  for (const orderColumn of ORDER_COLUMNS) {
    if (options.limit !== null) {
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .order(orderColumn, { ascending: false })
        .limit(options.limit);

      if (!error && Array.isArray(data)) {
        console.log('[backfill] Loaded rows.', { tableName, orderColumn, count: data.length, limit: options.limit });
        return data.filter(isRecord);
      }

      console.log('[backfill] Table load attempt failed.', {
        tableName,
        orderColumn,
        error: error?.message || 'unknown',
      });
      continue;
    }

    const collected: Record<string, unknown>[] = [];
    let from = 0;
    let page = 0;
    let failed = false;

    while (true) {
      const to = from + options.batchSize - 1;
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .order(orderColumn, { ascending: false })
        .range(from, to);

      if (error) {
        console.log('[backfill] Unlimited load page failed.', {
          tableName,
          orderColumn,
          from,
          to,
          error: error.message,
        });
        failed = true;
        break;
      }

      const pageRows = (Array.isArray(data) ? data : []).filter(isRecord);
      if (pageRows.length === 0) {
        break;
      }

      collected.push(...pageRows);
      page += 1;
      from += options.batchSize;

      if (page % 10 === 0) {
        console.log('[backfill] Unlimited load progress.', {
          tableName,
          orderColumn,
          pagesLoaded: page,
          rowsLoaded: collected.length,
        });
      }

      if (pageRows.length < options.batchSize) {
        break;
      }
    }

    if (!failed) {
      console.log('[backfill] Loaded rows (no limit).', {
        tableName,
        orderColumn,
        count: collected.length,
        batchSize: options.batchSize,
      });
      return collected;
    }
  }

  return null;
};

const processRow = async (
  supabase: ReturnType<typeof createClient>,
  tableName: string,
  row: Record<string, unknown>,
  options: CliOptions,
) => {
  const rowId = String(row.id || '');
  const payloadResolution = resolveCulturalPayload(row);

  if (!payloadResolution) {
    console.log('[backfill] Skipping row with no cultural payload.', { tableName, rowId });
    return { touched: false, applied: 0, missing: 0, remaining: 0, updateFailed: false };
  }

  const payload = payloadResolution.payload;
  const context = extractBackfillContext(row);
  let totalApplied = 0;
  let touched = false;
  let totalMissing = 0;
  let totalRemaining = 0;

  console.log('[backfill] Processing row.', {
    tableName,
    rowId,
    payloadColumn: payloadResolution.columnName,
    audience: context.audience,
    brand: context.brand,
    generations: context.generations,
    topicFocus: context.topicFocus || null,
  });

  for (const key of CULTURAL_BACKFILL_KEYS) {
    const rawItems = payload[key];
    if (!Array.isArray(rawItems)) continue;

    const items = rawItems as MatrixItem[];
    const initialMissing = getMissingDeepDiveIndices(items);
    if (!initialMissing.length) continue;
    totalMissing += initialMissing.length;

    if (options.scanOnly) {
      touched = true;
      totalRemaining += initialMissing.length;
      console.log('[backfill] Scan only: missing deep dives detected.', {
        tableName,
        rowId,
        category: key,
        missingCount: initialMissing.length,
      });
      continue;
    }

    let pass = 0;
    let categoryApplied = 0;
    while (pass < options.maxCategoryPasses) {
      pass += 1;
      const missingIndices = getMissingDeepDiveIndices(items);
      if (!missingIndices.length) break;

      console.log('[backfill] Generating missing deep dives.', {
        tableName,
        rowId,
        category: key,
        missingCount: missingIndices.length,
        pass,
      });

      let appliedThisPass = 0;
      const generateDeepDivesBatch = await getDeepDiveBatchGenerator();
      const indexChunks = chunk(missingIndices, options.deepDiveBatchChunkSize);

      for (const indexChunk of indexChunks) {
        const missingItems = indexChunk
          .map((index) => items[index])
          .filter((item): item is MatrixItem => Boolean(item));
        if (!missingItems.length) continue;

        try {
          const reports = await generateDeepDivesBatch(missingItems, context);
          const appliedByBatch = applyDeepDiveReports(items, indexChunk, reports);
          appliedThisPass += appliedByBatch;

          const stillMissingInChunk = indexChunk.filter((index) => !items[index]?.deepDive);
          if (options.fallbackSingles && stillMissingInChunk.length > 0) {
            const generateDeepDive = await getDeepDiveSingleGenerator();
            for (const missingIndex of stillMissingInChunk) {
              const candidate = items[missingIndex];
              if (!candidate || candidate.deepDive) continue;
              try {
                const singleReport = await generateDeepDive(candidate, context);
                candidate.deepDive = singleReport;
                appliedThisPass += 1;
              } catch (singleError) {
                console.log('[backfill] Single deep-dive fallback failed.', {
                  tableName,
                  rowId,
                  category: key,
                  missingIndex,
                  pass,
                  error: singleError instanceof Error ? singleError.message : String(singleError),
                });
              }
            }
          }
        } catch (chunkError) {
          console.log('[backfill] Batch deep-dive chunk failed.', {
            tableName,
            rowId,
            category: key,
            pass,
            chunkSize: indexChunk.length,
            error: chunkError instanceof Error ? chunkError.message : String(chunkError),
          });

          if (options.fallbackSingles) {
            const generateDeepDive = await getDeepDiveSingleGenerator();
            for (const missingIndex of indexChunk) {
              const candidate = items[missingIndex];
              if (!candidate || candidate.deepDive) continue;
              try {
                const singleReport = await generateDeepDive(candidate, context);
                candidate.deepDive = singleReport;
                appliedThisPass += 1;
              } catch (singleError) {
                console.log('[backfill] Single deep-dive fallback failed after batch error.', {
                  tableName,
                  rowId,
                  category: key,
                  missingIndex,
                  pass,
                  error: singleError instanceof Error ? singleError.message : String(singleError),
                });
              }
            }
          }
        }
      }

      categoryApplied += appliedThisPass;
      if (appliedThisPass === 0) {
        console.log('[backfill] No additional deep dives applied this pass.', {
          tableName,
          rowId,
          category: key,
          pass,
          remainingMissingAfterPass: getMissingDeepDiveIndices(items).length,
          nextAction: pass < options.maxCategoryPasses ? 'retry-next-pass' : 'stop-max-passes-reached',
        });
      }
    }

    const remaining = getMissingDeepDiveIndices(items).length;
    totalRemaining += remaining;
    if (categoryApplied > 0) {
      totalApplied += categoryApplied;
      touched = true;
    }
    console.log('[backfill] Category generation summary.', {
      tableName,
      rowId,
      category: key,
      applied: categoryApplied,
      remaining,
      passesUsed: pass,
    });
  }

  if (!touched) {
    console.log('[backfill] No missing deep dives found for row.', { tableName, rowId });
    return { touched: false, applied: 0, missing: 0, remaining: 0, updateFailed: false };
  }

  if (options.scanOnly) {
    console.log('[backfill] Scan only: row summary.', {
      tableName,
      rowId,
      totalMissing,
      totalRemaining,
    });
    return { touched: true, applied: 0, missing: totalMissing, remaining: totalRemaining, updateFailed: false };
  }

  if (!options.commit) {
    console.log('[backfill] Dry run: skipping Supabase update.', {
      tableName,
      rowId,
      payloadColumn: payloadResolution.columnName,
      totalApplied,
      totalRemaining,
    });
    return { touched: true, applied: totalApplied, missing: totalMissing, remaining: totalRemaining, updateFailed: false };
  }

  const { error: updateError } = await supabase
    .from(tableName)
    .update({ [payloadResolution.columnName]: payload })
    .eq('id', rowId);

  if (updateError) {
    console.log('[backfill] Failed to update row.', {
      tableName,
      rowId,
      payloadColumn: payloadResolution.columnName,
      error: updateError.message,
    });
    return { touched: true, applied: totalApplied, missing: totalMissing, remaining: totalRemaining, updateFailed: true };
  }

  console.log('[backfill] Updated row successfully.', {
    tableName,
    rowId,
    payloadColumn: payloadResolution.columnName,
    totalApplied,
    totalRemaining,
  });
  return { touched: true, applied: totalApplied, missing: totalMissing, remaining: totalRemaining, updateFailed: false };
};

type BackfillPassSummary = {
  totalRowsLoaded: number;
  totalRowsTouched: number;
  totalTablesResolved: number;
  totalDeepDivesMissing: number;
  totalDeepDivesRemaining: number;
  totalDeepDivesApplied: number;
  totalUpdateFailures: number;
};

const runBackfillPass = async (
  supabase: ReturnType<typeof createClient>,
  options: CliOptions,
  tableCandidates: string[],
  passLabel: string,
): Promise<BackfillPassSummary> => {
  const summary: BackfillPassSummary = {
    totalRowsLoaded: 0,
    totalRowsTouched: 0,
    totalTablesResolved: 0,
    totalDeepDivesMissing: 0,
    totalDeepDivesRemaining: 0,
    totalDeepDivesApplied: 0,
    totalUpdateFailures: 0,
  };

  console.log('[backfill] Starting cultural deep-dive backfill.', {
    passLabel,
    commit: options.commit,
    scanOnly: options.scanOnly,
    repeatUntilClean: options.repeatUntilClean,
    limit: options.limit === null ? 'none' : options.limit,
    batchSize: options.batchSize,
    deepDiveBatchChunkSize: options.deepDiveBatchChunkSize,
    maxCategoryPasses: options.maxCategoryPasses,
    fallbackSingles: options.fallbackSingles,
    rowId: options.rowId || null,
    tableCandidates,
    allTables: options.allTables,
  });

  for (const tableName of tableCandidates) {
    const rows = await loadRowsForTable(supabase, tableName, options);
    if (!rows) continue;

    summary.totalTablesResolved += 1;
    summary.totalRowsLoaded += rows.length;

    for (const row of rows) {
      try {
        const result = await processRow(supabase, tableName, row, options);
        if (result.touched) summary.totalRowsTouched += 1;
        summary.totalDeepDivesMissing += result.missing || 0;
        summary.totalDeepDivesRemaining += result.remaining || 0;
        summary.totalDeepDivesApplied += result.applied;
        if (result.updateFailed) summary.totalUpdateFailures += 1;
      } catch (error) {
        summary.totalUpdateFailures += 1;
        console.log('[backfill] Row processing failed.', {
          tableName,
          rowId: String(row.id || ''),
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (!options.allTables) {
      if (rows.length > 0) {
        break;
      }
    }
  }

  console.log('[backfill] Finished cultural deep-dive backfill.', {
    passLabel,
    commit: options.commit,
    scanOnly: options.scanOnly,
    repeatUntilClean: options.repeatUntilClean,
    totalTablesResolved: summary.totalTablesResolved,
    totalRowsLoaded: summary.totalRowsLoaded,
    totalRowsTouched: summary.totalRowsTouched,
    totalDeepDivesMissing: summary.totalDeepDivesMissing,
    totalDeepDivesRemaining: summary.totalDeepDivesRemaining,
    totalDeepDivesApplied: summary.totalDeepDivesApplied,
    totalUpdateFailures: summary.totalUpdateFailures,
  });

  if (options.scanOnly && summary.totalDeepDivesMissing > 0) {
    console.log('[backfill] Scan-only mode found missing deep dives. Re-run with write mode to apply updates.', {
      suggestedCommitCommand:
        'npm run backfill:cultural-deep-dives -- --commit --no-limit --all-tables',
      suggestedRepeatCommand:
        'npm run backfill:cultural-deep-dives -- --repeat-until-clean --no-limit --all-tables',
      missingDetected: summary.totalDeepDivesMissing,
    });
  }

  if (!options.scanOnly && summary.totalDeepDivesRemaining > 0 && summary.totalDeepDivesApplied === 0) {
    console.log('[backfill] Write mode completed without applying new deep dives while missing items remain.', {
      remainingMissing: summary.totalDeepDivesRemaining,
      recommendation: 'Try --repeat-until-clean with --deep-dive-batch-chunk-size=1 and a higher --max-category-passes.',
    });
  }

  return summary;
};

const main = async () => {
  const options = parseCulturalBackfillCliArgs(process.argv.slice(2));
  const { url, key } = resolveSupabaseConfig();
  const supabase = createClient(url, key);

  const tableCandidates = options.table
    ? [options.table]
    : Array.from(DEFAULT_TABLE_CANDIDATES);

  if (!options.repeatUntilClean) {
    await runBackfillPass(supabase, options, tableCandidates, 'single-pass');
    return;
  }

  console.log('[backfill] Repeat-until-clean mode enabled. Running scan + commit cycles until no missing deep dives remain.', {
    tableCandidates,
    limit: options.limit === null ? 'none' : options.limit,
  });

  let cycle = 0;
  // User-requested behavior: keep cycling until scan reports no missing deep dives.
  while (true) {
    cycle += 1;
    const scanOptions: CliOptions = { ...options, scanOnly: true, commit: false };
    const scanSummary = await runBackfillPass(supabase, scanOptions, tableCandidates, `repeat-scan-${cycle}`);

    if (scanSummary.totalTablesResolved === 0) {
      throw new Error('Repeat-until-clean scan could not resolve any configured table. Check Supabase access or table names.');
    }

    if (scanSummary.totalDeepDivesRemaining === 0) {
      console.log('[backfill] Repeat-until-clean complete. No missing deep dives remain.', {
        cycle,
      });
      break;
    }

    console.log('[backfill] Repeat-until-clean committing another pass.', {
      cycle,
      missingBeforeCommit: scanSummary.totalDeepDivesRemaining,
    });

    const commitOptions: CliOptions = { ...options, scanOnly: false, commit: true };
    const commitSummary = await runBackfillPass(supabase, commitOptions, tableCandidates, `repeat-commit-${cycle}`);

    console.log('[backfill] Repeat-until-clean commit pass finished.', {
      cycle,
      applied: commitSummary.totalDeepDivesApplied,
      remainingAfterCommit: commitSummary.totalDeepDivesRemaining,
      updateFailures: commitSummary.totalUpdateFailures,
    });
  }
};

void main().catch((error) => {
  console.error('[backfill] Fatal error while running cultural deep-dive backfill.', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
