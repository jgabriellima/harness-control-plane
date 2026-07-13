import { memo, useMemo, useRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';

import ChatHtmlPreview from '@/components/react/ChatHtmlPreview';
import MermaidDiagram from '@/components/react/MermaidDiagram';
import { isLikelyFilePath } from '@/lib/file-reference';
import { looksLikeHtmlDocument } from '@/lib/html-document';
import { normalizeMarkdownForGfm } from '@/lib/markdown-gfm';
import { isChatBrowserLink } from '@/lib/runtime-browser-types';
import { cn } from '@/lib/utils';

export type MarkdownProps = {
  children: string;
  className?: string;
  onFileClick?: (filePath: string) => void;
  onLinkClick?: (url: string) => void;
};

type ElementProps = ComponentPropsWithoutRef<'div'>;

const RICH_EMBED_TEST_IDS = new Set(['mermaid-diagram', 'chat-html-preview']);

function isRichEmbedPreChild(children: ReactNode): boolean {
  const child = React.Children.toArray(children)[0];
  if (!React.isValidElement(child)) {
    return false;
  }

  const testId = (child.props as { 'data-testid'?: string })['data-testid'];
  return typeof testId === 'string' && RICH_EMBED_TEST_IDS.has(testId);
}

function MarkdownComponent({ children, className, onFileClick, onLinkClick }: MarkdownProps) {
  const onFileClickRef = useRef(onFileClick);
  onFileClickRef.current = onFileClick;
  const onLinkClickRef = useRef(onLinkClick);
  onLinkClickRef.current = onLinkClick;
  const normalizedChildren = useMemo(() => normalizeMarkdownForGfm(children), [children]);

  const components = useMemo(
    () => ({
      h1: ({ children: headingChildren }: ElementProps) => (
        <h1 className="mb-3 mt-1 text-base font-semibold tracking-tight text-gray-900 first:mt-0">
          {headingChildren}
        </h1>
      ),
      h2: ({ children: headingChildren }: ElementProps) => (
        <h2 className="mb-2 mt-4 border-b border-gray-100 pb-1 text-sm font-semibold text-gray-900 first:mt-0">
          {headingChildren}
        </h2>
      ),
      h3: ({ children: headingChildren }: ElementProps) => (
        <h3 className="mb-1.5 mt-3 text-sm font-medium text-gray-900 first:mt-0">{headingChildren}</h3>
      ),
      h4: ({ children: headingChildren }: ElementProps) => (
        <h4 className="mb-1 mt-2 text-xs font-medium uppercase tracking-wide text-gray-700 first:mt-0">
          {headingChildren}
        </h4>
      ),
      p: ({ children: paragraphChildren }: ElementProps) => (
        <p
          className="text-[length:var(--chat-font-size)] leading-[var(--chat-line-height)] text-gray-800 last:mb-0"
          style={{ marginBottom: 'var(--chat-paragraph-spacing)' }}
        >
          {paragraphChildren}
        </p>
      ),
      ul: ({ children: listChildren }: ElementProps) => (
        <ul
          className="list-disc pl-5 text-[length:var(--chat-font-size)] leading-[var(--chat-line-height)] text-gray-800"
          style={{ marginBottom: 'var(--chat-list-spacing)' }}
        >
          {listChildren}
        </ul>
      ),
      ol: ({ children: listChildren }: ElementProps) => (
        <ol
          className="list-decimal pl-5 text-[length:var(--chat-font-size)] leading-[var(--chat-line-height)] text-gray-800"
          style={{ marginBottom: 'var(--chat-list-spacing)' }}
        >
          {listChildren}
        </ol>
      ),
      li: ({ children: itemChildren }: ElementProps) => (
        <li className="leading-[var(--chat-line-height)] marker:text-gray-400">{itemChildren}</li>
      ),
      strong: ({ children: strongChildren }: ElementProps) => (
        <strong className="font-semibold text-gray-900">{strongChildren}</strong>
      ),
      em: ({ children: emChildren }: ElementProps) => <em className="text-gray-700">{emChildren}</em>,
      hr: () => <hr className="my-4 border-gray-200" />,
      blockquote: ({ children: quoteChildren }: ElementProps) => (
        <blockquote className="mb-3 rounded-r-md border-l-2 border-brand-400 bg-brand-50/40 py-1 pl-3 text-sm text-gray-700">
          {quoteChildren}
        </blockquote>
      ),
      table: ({ children: tableChildren }: ElementProps) => (
        <div className="mb-3 overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
          <table className="w-full min-w-full border-collapse text-left text-xs">{tableChildren}</table>
        </div>
      ),
      thead: ({ children: headChildren }: ElementProps) => (
        <thead className="bg-gray-50 text-gray-600">{headChildren}</thead>
      ),
      tbody: ({ children: bodyChildren }: ElementProps) => (
        <tbody className="divide-y divide-gray-100 bg-white">{bodyChildren}</tbody>
      ),
      tr: ({ children: rowChildren }: ElementProps) => <tr className="even:bg-gray-50/40">{rowChildren}</tr>,
      th: ({ children: headerChildren }: ElementProps) => (
        <th className="px-3 py-2 font-semibold text-gray-700">{headerChildren}</th>
      ),
      td: ({ children: cellChildren }: ElementProps) => (
        <td className="px-3 py-2 align-top text-gray-800">{cellChildren}</td>
      ),
      pre: ({ children: preChildren }: ElementProps) => {
        if (isRichEmbedPreChild(preChildren)) {
          return <>{preChildren}</>;
        }

        return (
          <pre className="mb-3 overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 p-3 shadow-sm">
            {preChildren}
          </pre>
        );
      },
      code: ({
        className: codeClassName,
        children: codeChildren,
      }: ElementProps & { className?: string }) => {
        const text = String(codeChildren ?? '').replace(/\n$/, '');
        const isBlockCode = Boolean(codeClassName?.startsWith('language-'));
        const language = codeClassName?.replace(/^language-/, '') ?? '';

        if (isBlockCode && language === 'mermaid') {
          return <MermaidDiagram source={text} />;
        }

        if (
          isBlockCode &&
          (language === 'html' || language === 'htm' || (language === '' && looksLikeHtmlDocument(text)))
        ) {
          return <ChatHtmlPreview source={text} />;
        }

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
          <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[11px] text-gray-700">{text}</code>
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
            className="font-medium text-brand-700 underline decoration-brand-300 underline-offset-2 hover:text-brand-800 hover:underline"
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
    <div
      className={cn(
        'chat-markdown break-words text-[length:var(--chat-font-size)] leading-[var(--chat-line-height)]',
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components}>
        {normalizedChildren}
      </ReactMarkdown>
    </div>
  );
}

export const Markdown = memo(MarkdownComponent);
