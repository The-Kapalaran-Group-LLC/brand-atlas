import React, { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { toSafeExternalHref } from '../services/external-links';

type SourceLinkRowProps = {
  index: number;
  title: string;
  url?: string | null;
  className?: string;
};

export function SourceLinkRow({ index, title, url, className = '' }: SourceLinkRowProps) {
  const safeHref = useMemo(() => toSafeExternalHref(url), [url]);
  const hasInvalidUrl = safeHref === '#';

  if (hasInvalidUrl) {
    console.log('[SourceLinkRow] Rendering invalid source URL as non-clickable fallback.', {
      index,
      title,
      rawUrl: url,
    });
  }

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
      {hasInvalidUrl ? (
        <div className="ml-7 mt-1 inline-flex items-center gap-1 text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-full px-2 py-0.5">
          <AlertTriangle className="w-3 h-3" />
          <span>Source failed to load</span>
        </div>
      ) : null}
    </li>
  );
}
