import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Clock, RotateCcw, Trash2, X } from 'lucide-react';
import {
  clearRecentResults,
  getRecentResults,
  replaceRecentResults,
  removeRecentResult,
  RecentResultRecord,
  RecentResultsMode,
  saveRecentResult,
} from '../services/recent-results-storage';

type RecentResultsLibraryProps<T extends RecentResultRecord> = {
  mode: RecentResultsMode;
  title?: string;
  emptyMessage?: string;
  refreshNonce?: number;
  onSelectItem: (item: T) => void;
  className?: string;
};

export function RecentResultsLibrary<T extends RecentResultRecord>({
  mode,
  title = 'Recent Projects',
  refreshNonce = 0,
  onSelectItem,
  className = '',
}: RecentResultsLibraryProps<T>) {
  const [recentResults, setRecentResults] = useState<T[]>([]);
  const [pendingDeletes, setPendingDeletes] = useState<Record<string, T>>({});
  const [pendingClearHistory, setPendingClearHistory] = useState<T[] | null>(null);
  const deleteTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const clearHistoryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const next = getRecentResults<T>(mode);
    console.log('[RecentResultsLibrary] Loaded recent results.', {
      mode,
      count: next.length,
      refreshNonce,
    });
    setRecentResults(next);
  }, [mode, refreshNonce]);

  useEffect(() => {
    return () => {
      Object.values(deleteTimersRef.current).forEach((timerId) => {
        clearTimeout(timerId);
      });
      deleteTimersRef.current = {};
      if (clearHistoryTimerRef.current) {
        clearTimeout(clearHistoryTimerRef.current);
        clearHistoryTimerRef.current = null;
      }
    };
  }, []);

  const hasResults = recentResults.length > 0;
  const hasPendingDeletes = Object.keys(pendingDeletes).length > 0;
  const hasPendingClearHistory = Boolean(pendingClearHistory && pendingClearHistory.length > 0);
  const pendingEntries = Object.entries(pendingDeletes);
  const latestPendingDelete = pendingEntries.length > 0 ? pendingEntries[pendingEntries.length - 1] : null;

  const clearHistory = () => {
    console.log('[RecentResultsLibrary] Clearing recent results.', { mode, previousCount: recentResults.length });
    clearRecentResults(mode);
    Object.values(deleteTimersRef.current).forEach((timerId) => {
      clearTimeout(timerId);
    });
    deleteTimersRef.current = {};
    setPendingDeletes({});
    if (clearHistoryTimerRef.current) {
      clearTimeout(clearHistoryTimerRef.current);
      clearHistoryTimerRef.current = null;
    }
    setPendingClearHistory(null);
    setRecentResults([]);
  };

  const clearHistoryWithUndo = () => {
    if (recentResults.length === 0) {
      return;
    }

    const snapshot = [...recentResults];
    console.log('[RecentResultsLibrary] Clearing history with undo window.', { mode, previousCount: snapshot.length });

    Object.values(deleteTimersRef.current).forEach((timerId) => {
      clearTimeout(timerId);
    });
    deleteTimersRef.current = {};
    setPendingDeletes({});

    if (clearHistoryTimerRef.current) {
      clearTimeout(clearHistoryTimerRef.current);
      clearHistoryTimerRef.current = null;
    }

    clearRecentResults(mode);
    setRecentResults([]);
    setPendingClearHistory(snapshot);

    clearHistoryTimerRef.current = setTimeout(() => {
      console.log('[RecentResultsLibrary] Clear-history undo window expired.', { mode, previousCount: snapshot.length });
      setPendingClearHistory(null);
      clearHistoryTimerRef.current = null;
    }, 3000);
  };

  const deleteResultWithUndo = (item: T) => {
    const key = String(item.id);
    const pendingTimer = deleteTimersRef.current[key];
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      delete deleteTimersRef.current[key];
    }

    console.log('[RecentResultsLibrary] Deleting recent result with undo window.', { mode, id: item.id, title: item.title });
    setPendingDeletes((prev) => ({ ...prev, [key]: item }));
    const next = removeRecentResult<T>(mode, item.id);
    setRecentResults(next);

    deleteTimersRef.current[key] = setTimeout(() => {
      console.log('[RecentResultsLibrary] Deletion undo window expired.', { mode, id: item.id, title: item.title });
      setPendingDeletes((prev) => {
        const updated = { ...prev };
        delete updated[key];
        return updated;
      });
      delete deleteTimersRef.current[key];
    }, 3000);
  };

  const undoDelete = (itemId: string) => {
    const item = pendingDeletes[itemId];
    if (!item) return;

    const pendingTimer = deleteTimersRef.current[itemId];
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      delete deleteTimersRef.current[itemId];
    }

    console.log('[RecentResultsLibrary] Undoing recent result deletion.', { mode, id: item.id, title: item.title });
    const next = saveRecentResult<T>(mode, item);
    setRecentResults(next);
    setPendingDeletes((prev) => {
      const updated = { ...prev };
      delete updated[itemId];
      return updated;
    });
  };

  const undoClearHistory = () => {
    if (!pendingClearHistory || pendingClearHistory.length === 0) return;

    if (clearHistoryTimerRef.current) {
      clearTimeout(clearHistoryTimerRef.current);
      clearHistoryTimerRef.current = null;
    }

    console.log('[RecentResultsLibrary] Undoing clear-history action.', { mode, restoreCount: pendingClearHistory.length });
    const restored = replaceRecentResults<T>(mode, pendingClearHistory);
    setRecentResults(restored);
    setPendingClearHistory(null);
  };

  const heading = useMemo(() => `${title}`, [title]);

  if (!hasResults && !hasPendingDeletes && !hasPendingClearHistory) {
    return null;
  }

  return (
    <>
      {hasPendingClearHistory ? (
        <div
          className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-zinc-900 text-white px-6 py-3 rounded-full shadow-lg flex items-center gap-4 text-sm no-print"
          data-testid="recent-results-clear-history-undo-toast"
        >
          <span>History cleared.</span>
          <button
            type="button"
            onClick={undoClearHistory}
            className="underline font-semibold hover:text-zinc-200 transition-colors"
            data-testid="undo-clear-recent-history"
            aria-label="Undo clear history"
          >
            <RotateCcw className="inline-block h-3 w-3 mr-1" />
            Undo
          </button>
        </div>
      ) : latestPendingDelete ? (
        <div
          className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-zinc-900 text-white px-6 py-3 rounded-full shadow-lg flex items-center gap-4 text-sm no-print"
          data-testid="recent-results-undo-toast"
        >
          <span>Deleted {latestPendingDelete[1].title}.</span>
          <button
            type="button"
            onClick={() => undoDelete(latestPendingDelete[0])}
            className="underline font-semibold hover:text-zinc-200 transition-colors"
            data-testid={`undo-delete-recent-result-${latestPendingDelete[0]}`}
            aria-label={`Undo delete ${latestPendingDelete[1].title}`}
          >
            <RotateCcw className="inline-block h-3 w-3 mr-1" />
            Undo
          </button>
        </div>
      ) : null}

      <section
        className={`w-full rounded-2xl border border-zinc-200/80 bg-zinc-50/55 p-4 sm:p-5 ${className}`.trim()}
        data-testid="recent-results-library"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium uppercase tracking-wide text-zinc-600 flex items-center gap-2" data-testid="recent-results-title">
            <Clock className="h-4 w-4 text-zinc-400" />
            {heading}
          </h3>
          <button
            type="button"
            onClick={clearHistoryWithUndo}
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white/70 px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:bg-white hover:text-zinc-900 transition-colors disabled:opacity-50"
            data-testid="clear-recent-history"
            aria-label="Clear History"
            disabled={!hasResults}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear History
          </button>
        </div>

        <div className="flex flex-wrap gap-2" data-testid="recent-results-list">
          {recentResults.map((item) => (
            <div
              key={String(item.id)}
              className="w-full sm:w-[22rem] rounded-lg border border-zinc-200/80 bg-white/80 px-3 py-2 text-left"
              data-testid={`recent-result-row-${String(item.id)}`}
            >
              <div className="flex items-start gap-2">
                <button
                  type="button"
                  onClick={() => {
                    console.log('[RecentResultsLibrary] Selected recent result item.', { mode, id: item.id, title: item.title });
                    onSelectItem(item);
                  }}
                  className="flex-1 min-w-0 text-left hover:text-zinc-900 transition-colors"
                  data-testid={`recent-result-item-${String(item.id)}`}
                  aria-label={item.title}
                >
                  <p className="truncate text-sm font-medium text-zinc-900">{item.title}</p>
                  {item.description ? (
                    <p className="mt-1 line-clamp-2 text-xs text-zinc-600">{item.description}</p>
                  ) : null}
                </button>
                <button
                  type="button"
                  onClick={() => deleteResultWithUndo(item)}
                  className="inline-flex items-center justify-center rounded-md border border-zinc-200 bg-white p-1.5 text-zinc-500 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors"
                  data-testid={`delete-recent-result-${String(item.id)}`}
                  aria-label={`Delete ${item.title}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="sr-only" aria-live="polite" data-testid="recent-results-live-region">
          {pendingEntries.length > 0
            ? `${pendingEntries.length} recent project deletions pending undo.`
            : hasPendingClearHistory
              ? 'Recent project history clear pending undo.'
              : 'No pending recent project deletions.'}
        </div>
      </section>
    </>
  );
}
