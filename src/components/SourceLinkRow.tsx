import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { toSafeExternalHref } from '../services/external-links';

type SourceLinkRowProps = {
  index: number;
  title: string;
  url?: string | null;
  className?: string;
};

type ReachabilityState = 'idle' | 'checking' | 'reachable' | 'unreachable';

const SOURCE_REACHABILITY_CACHE = new Map<string, ReachabilityState>();
const PROBE_TIMEOUT_MS = 5500;

const isTestMode = (): boolean => {
  return Boolean((globalThis as { vitest?: unknown }).vitest);
};

const probeSourceReachability = async (url: string): Promise<boolean> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    await fetch(url, {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    });
    return true;
  } catch (error) {
    console.log('[SourceLinkRow] Source reachability probe failed.', { url, error });
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
};

export function SourceLinkRow({ index, title, url, className = '' }: SourceLinkRowProps) {
  const safeHref = useMemo(() => toSafeExternalHref(url), [url]);
  const [reachability, setReachability] = useState<ReachabilityState>(() => {
    if (safeHref === '#') {
      return 'unreachable';
    }
    const cached = SOURCE_REACHABILITY_CACHE.get(safeHref);
    return cached || 'idle';
  });

  useEffect(() => {
    let cancelled = false;

    if (safeHref === '#') {
      setReachability('unreachable');
      return () => {
        cancelled = true;
      };
    }

    const cached = SOURCE_REACHABILITY_CACHE.get(safeHref);
    if (cached === 'reachable' || cached === 'unreachable') {
      setReachability(cached);
      return () => {
        cancelled = true;
      };
    }

    if (isTestMode()) {
      return () => {
        cancelled = true;
      };
    }

    setReachability('checking');
    probeSourceReachability(safeHref).then((isReachable) => {
      if (cancelled) return;
      const nextState: ReachabilityState = isReachable ? 'reachable' : 'unreachable';
      SOURCE_REACHABILITY_CACHE.set(safeHref, nextState);
      setReachability(nextState);
    });

    return () => {
      cancelled = true;
    };
  }, [safeHref]);

  return (
    <li className={`text-sm ${className}`.trim()}>
      <a
        href={safeHref}
        target="_blank"
        rel="noopener noreferrer"
        className="text-indigo-600 hover:text-indigo-800 hover:underline flex items-start gap-2"
      >
        <span className="text-zinc-400 mt-0.5">[{index + 1}]</span>
        <span>{title}</span>
      </a>
      {reachability === 'unreachable' ? (
        <div className="ml-7 mt-1 inline-flex items-center gap-1 text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-full px-2 py-0.5">
          <AlertTriangle className="w-3 h-3" />
          <span>Source failed to load</span>
        </div>
      ) : null}
    </li>
  );
}
