import { memo, useMemo, useRef, type ComponentPropsWithoutRef } from 'react';
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';

import { isLikelyFilePath } from '@/lib/file-reference';
import { isChatBrowserLink } from '@/lib/runtime-browser-types';
import { cn } from '@/lib/utils';

export type MarkdownProps = {
  children: string;
  className?: string;
  onFileClick?: (filePath: string) => void;
  onLinkClick?: (url: string) => void;
};

type ElementProps = ComponentPropsWithoutRef<'div'>;

function MarkdownComponent({ children, className, onFileClick, onLinkClick }: MarkdownProps) {
  const onFileClickRef = useRef(onFileClick);
  onFileClickRef.current = onFileClick;
  const onLinkClickRef = useRef(onLinkClick);
  onLinkClickRef.current = onLinkClick;

  const components = useMemo(
    () => ({
      h1: ({ children: headingChildren }: ElementProps) => (
        <p className="mb-2 text-sm font-semibold text-gray-900">{headingChildren}</p>
      ),
      h2: ({ children: headingChildren }: ElementProps) => (
        <p className="mb-1.5 text-sm font-medium text-gray-900">{headingChildren}</p>
      ),
      h3: ({ children: headingChildren }: ElementProps) => (
        <p className="mb-1 text-xs font-medium text-gray-800">{headingChildren}</p>
      ),
      p: ({ children: paragraphChildren }: ElementProps) => (
        <p className="mb-2 text-sm leading-relaxed text-gray-800 last:mb-0">{paragraphChildren}</p>
      ),
      ul: ({ children: listChildren }: ElementProps) => (
        <ul className="mb-2 list-disc space-y-0.5 pl-4 text-sm text-gray-800">{listChildren}</ul>
      ),
      ol: ({ children: listChildren }: ElementProps) => (
        <ol className="mb-2 list-decimal space-y-0.5 pl-4 text-sm text-gray-800">{listChildren}</ol>
      ),
      li: ({ children: itemChildren }: ElementProps) => (
        <li className="leading-relaxed">{itemChildren}</li>
      ),
      strong: ({ children: strongChildren }: ElementProps) => (
        <strong className="font-medium text-gray-900">{strongChildren}</strong>
      ),
      em: ({ children: emChildren }: ElementProps) => <em className="text-gray-700">{emChildren}</em>,
      hr: () => <hr className="my-3 border-gray-200" />,
      blockquote: ({ children: quoteChildren }: ElementProps) => (
        <blockquote className="mb-2 border-l-2 border-gray-200 pl-3 text-sm text-gray-600">
          {quoteChildren}
        </blockquote>
      ),
      table: ({ children: tableChildren }: ElementProps) => (
        <div className="mb-2 overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full min-w-full border-collapse text-left text-xs">{tableChildren}</table>
        </div>
      ),
      thead: ({ children: headChildren }: ElementProps) => (
        <thead className="bg-gray-50">{headChildren}</thead>
      ),
      tbody: ({ children: bodyChildren }: ElementProps) => (
        <tbody className="divide-y divide-gray-100">{bodyChildren}</tbody>
      ),
      tr: ({ children: rowChildren }: ElementProps) => <tr>{rowChildren}</tr>,
      th: ({ children: headerChildren }: ElementProps) => (
        <th className="px-2.5 py-1.5 font-medium text-gray-600">{headerChildren}</th>
      ),
      td: ({ children: cellChildren }: ElementProps) => (
        <td className="px-2.5 py-1.5 text-gray-800">{cellChildren}</td>
      ),
      pre: ({ children: preChildren }: ElementProps) => (
        <pre className="mb-2 overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 p-3">
          {preChildren}
        </pre>
      ),
      code: ({
        className: codeClassName,
        children: codeChildren,
      }: ElementProps & { className?: string }) => {
        const text = String(codeChildren ?? '').replace(/\n$/, '');
        const isBlockCode = Boolean(codeClassName?.startsWith('language-'));

        if (!isBlockCode && isLikelyFilePath(text)) {
          return (
            <button
              type="button"
              className="cursor-pointer rounded bg-gray-100 px-1 py-0.5 font-mono text-[11px] text-gray-700 underline decoration-gray-300 underline-offset-2 hover:bg-gray-200"
              data-testid="chat-file-reference"
              data-file-path={text}
              onClick={() => onFileClickRef.current?.(text)}
            >
              {text}
            </button>
          );
        }

        if (isBlockCode) {
          return (
            <code className="block whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-gray-700">
              {text}
            </code>
          );
        }

        return (
          <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[11px] text-gray-700">
            {text}
          </code>
        );
      },
      a: ({
        href,
        children: linkChildren,
      }: ElementProps & { href?: string }) => {
        const hrefValue = href ?? '';

        if (isLikelyFilePath(hrefValue)) {
          return (
            <button
              type="button"
              className="cursor-pointer font-mono text-xs text-gray-700 underline decoration-gray-300 underline-offset-2 hover:text-gray-900"
              data-testid="chat-file-reference"
              data-file-path={hrefValue}
              onClick={() => onFileClickRef.current?.(hrefValue)}
            >
              {linkChildren}
            </button>
          );
        }

        if (
          onLinkClickRef.current &&
          isChatBrowserLink(hrefValue, typeof window !== 'undefined' ? window.location.origin : undefined)
        ) {
          return (
            <a
              href={hrefValue}
              className="cursor-pointer font-medium text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-900"
              data-testid="chat-browser-link"
              onClick={(event) => {
                event.preventDefault();
                onLinkClickRef.current?.(hrefValue);
              }}
            >
              {linkChildren}
            </a>
          );
        }

        return (
          <a
            href={hrefValue}
            className="font-medium text-gray-700 underline-offset-2 hover:text-gray-900 hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            {linkChildren}
          </a>
        );
      },
    }),
    [],
  );

  return (
    <div className={cn('chat-markdown break-words', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

export const Markdown = memo(MarkdownComponent);
