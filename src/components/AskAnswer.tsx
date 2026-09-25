import React, { useEffect, useMemo } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowUpRight, Globe2, Sparkles } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { normalizeExternalHttpUrl } from '../services/external-links';

export type AskAnswerSource = { title: string; url: string };

type AskAnswerProps = {
  answer: string;
  sources: Array<AskAnswerSource | null>;
};

const evidenceDescriptions: Record<string, string> = {
  known: 'Supported by the available evidence',
  inferred: 'An interpretation of the available evidence',
  speculative: 'A possibility that needs more evidence',
  analogy: 'A comparison used to explain the finding',
};

/** Render model text as Markdown, but link only the verified, numbered sources. */
export function AskAnswer({ answer, sources }: AskAnswerProps) {
  const reduceMotion = useReducedMotion();
  const safeSources = useMemo(() => sources.map((source) => {
    if (!source || !/^https?:\/\//i.test(source.url)) return null;
    const url = normalizeExternalHttpUrl(source.url);
    return url ? { ...source, url, domain: new URL(url).hostname.replace(/^www\./, '') } : null;
  }), [sources]);
  const sourceCount = safeSources.filter(Boolean).length;

  useEffect(() => {
    console.log('[AskAnswer] Rendering formatted research answer.', {
      characterCount: answer.length,
      verifiedSourceCount: sourceCount,
    });
  }, [answer, sourceCount]);

  const renderInline = (children: React.ReactNode): React.ReactNode => React.Children.map(children, (child) => {
    if (typeof child === 'string') {
      return child.split(/(\[(?:\d+|KNOWN|INFERRED|INFERED|SPECULATIVE|ANALOGY)\])/gi).map((part, index) => {
        const citation = part.match(/^\[(\d+)\]$/);
        if (citation) {
          const number = Number(citation[1]);
          const source = safeSources[number - 1];
          if (!source) return part;
          return (
            <a
              key={`citation-${index}`}
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Source ${number}: ${source.title}`}
              title={source.title}
              data-testid={`ask-inline-citation-${number}`}
              className="mx-0.5 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-zinc-100 px-1.5 align-super text-[10px] leading-5 font-semibold text-zinc-600 no-underline transition-colors hover:bg-indigo-100 hover:text-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
            >
              {number}
            </a>
          );
        }
        const marker = part.match(/^\[(KNOWN|INFERRED|INFERED|SPECULATIVE|ANALOGY)\]$/i);
        if (!marker) return part;
        const label = marker[1].toLowerCase().replace('infered', 'inferred');
        return (
          <span
            key={`evidence-${index}`}
            title={evidenceDescriptions[label]}
            data-testid={`ask-evidence-${label}`}
            className="mx-1 inline-block align-baseline text-[11px] leading-normal font-medium text-zinc-500"
          >
            {label}
          </span>
        );
      });
    }
    if (React.isValidElement<{ children?: React.ReactNode }>(child) && child.type !== 'code' && child.type !== 'pre') {
      return React.cloneElement(child, undefined, renderInline(child.props.children));
    }
    return child;
  });

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      data-testid="ask-answer-card"
      className="mt-7 border-t border-zinc-100 pt-6 text-zinc-700"
    >
      <div className="mb-5 flex items-center gap-2.5">
        <Sparkles aria-hidden="true" className="h-5 w-5 text-indigo-500" />
        <h4 className="text-sm font-semibold tracking-wide text-zinc-800">AI overview</h4>
      </div>
      <div className={sourceCount ? 'grid min-w-0 gap-8 xl:grid-cols-[minmax(0,1fr)_16rem] xl:gap-10' : 'min-w-0'}>
        <div
          data-testid="ask-answer-content"
          className="min-w-0 max-w-[78ch] space-y-5 text-[15px] leading-7 break-words [overflow-wrap:anywhere] sm:text-base sm:leading-8 [&>p:first-child]:text-zinc-900"
        >
          <Markdown
            remarkPlugins={[remarkGfm]}
            skipHtml
            components={{
              p: ({ children }) => <p>{renderInline(children)}</p>,
              h1: ({ children }) => <h4 className="pt-2 text-lg leading-7 font-semibold text-zinc-900">{renderInline(children)}</h4>,
              h2: ({ children }) => <h4 className="pt-2 text-lg leading-7 font-semibold text-zinc-900">{renderInline(children)}</h4>,
              h3: ({ children }) => <h5 className="pt-1 text-base leading-7 font-semibold text-zinc-900">{renderInline(children)}</h5>,
              h4: ({ children }) => <h5 className="text-base font-semibold text-zinc-900">{renderInline(children)}</h5>,
              h5: ({ children }) => <h6 className="font-semibold text-zinc-900">{renderInline(children)}</h6>,
              h6: ({ children }) => <h6 className="font-semibold text-zinc-900">{renderInline(children)}</h6>,
              strong: ({ children }) => <strong className="font-semibold text-zinc-900">{children}</strong>,
              ul: ({ children }) => <ul className="list-disc space-y-3 pl-5 marker:text-zinc-400">{children}</ul>,
              ol: ({ children, start }) => <ol start={start} className="list-decimal space-y-3 pl-5 marker:font-medium marker:text-zinc-500">{children}</ol>,
              li: ({ children }) => <li className="pl-1.5 [&>p+p]:mt-2 [&>ul]:mt-2 [&>ol]:mt-2">{renderInline(children)}</li>,
              blockquote: ({ children }) => <blockquote className="border-l-2 border-indigo-200 pl-4 text-sm leading-7 text-zinc-600">{children}</blockquote>,
              table: ({ children }) => <div className="max-w-full overflow-x-auto rounded-xl border border-zinc-200"><table className="w-full border-collapse text-left text-sm">{children}</table></div>,
              th: ({ children }) => <th className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 font-semibold text-zinc-900">{renderInline(children)}</th>,
              td: ({ children }) => <td className="border-b border-zinc-100 px-4 py-3 align-top">{renderInline(children)}</td>,
              a: ({ children }) => <span>{children}</span>,
              img: ({ alt }) => <span>{alt}</span>,
              hr: () => <hr className="border-zinc-100" />,
              pre: ({ children }) => <pre className="overflow-x-auto rounded-xl bg-zinc-50 p-4 text-sm">{children}</pre>,
            }}
          >
            {answer}
          </Markdown>
        </div>
        {sourceCount > 0 && (
          <aside data-testid="ask-answer-sources" aria-label="Answer sources" className="min-w-0 border-t border-zinc-100 pt-5 xl:border-t-0 xl:pt-0">
            <div className="mb-3 flex items-center gap-2">
              <h4 className="text-sm font-semibold text-zinc-800">Sources</h4>
              <span className="text-xs text-zinc-400">{sourceCount}</span>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              {safeSources.map((source, index) => source && (
                <li key={`${source.url}-${index}`} className="min-w-0">
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`[${index + 1}] ${source.title}`}
                    data-testid={`ask-source-${index + 1}`}
                    className="group flex h-full flex-col gap-2 rounded-xl border border-zinc-200 p-3.5 transition-colors hover:border-indigo-200 hover:bg-indigo-50/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
                  >
                    <span className="flex min-w-0 items-center gap-2 text-xs text-zinc-500">
                      <Globe2 aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                      <span className="min-w-0 truncate">{source.domain}</span>
                      <ArrowUpRight aria-hidden="true" className="ml-auto h-3.5 w-3.5 shrink-0 text-zinc-400 group-hover:text-indigo-500" />
                    </span>
                    <span className="line-clamp-2 text-sm leading-5 font-medium text-zinc-800">{source.title}</span>
                    <span className="text-[11px] text-zinc-400">Source {index + 1}</span>
                  </a>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>
    </motion.div>
  );
}
