import * as React from 'react';

import { cn } from '@/lib/utils';

import { Markdown } from './markdown';

export type MessageProps = {
  children: React.ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>;

export function Message({ children, className, ...props }: MessageProps) {
  return (
    <div className={cn('group flex w-full gap-3', className)} {...props}>
      {children}
    </div>
  );
}

export type MessageContentProps = {
  children: React.ReactNode;
  markdown?: boolean;
  className?: string;
  onFileClick?: (filePath: string) => void;
  onLinkClick?: (url: string) => void;
};

function extractMarkdownText(children: React.ReactNode): string | null {
  const nodes = React.Children.toArray(children);
  const strings: string[] = [];

  for (const node of nodes) {
    if (typeof node === 'string') {
      strings.push(node);
      continue;
    }

    if (node === null || node === undefined || typeof node === 'boolean') {
      continue;
    }

    return null;
  }

  const text = strings.join('');
  return text.length > 0 ? text : null;
}

export function MessageContent({
  children,
  markdown = false,
  className,
  onFileClick,
  onLinkClick,
}: MessageContentProps) {
  const classNames = cn('rounded-2xl px-4 py-3 text-sm', className);
  const markdownText = markdown ? extractMarkdownText(children) : null;

  if (markdown && markdownText !== null) {
    return (
      <div className={classNames}>
        <Markdown onFileClick={onFileClick} onLinkClick={onLinkClick}>
          {markdownText}
        </Markdown>
      </div>
    );
  }

  return <div className={classNames}>{children}</div>;
}
