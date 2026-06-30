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

export function MessageContent({
  children,
  markdown = false,
  className,
  onFileClick,
  onLinkClick,
}: MessageContentProps) {
  const classNames = cn('rounded-2xl px-4 py-3 text-sm', className);

  if (markdown && typeof children === 'string') {
    return (
      <div className={cn(classNames, 'bg-gray-50')}>
        <Markdown onFileClick={onFileClick} onLinkClick={onLinkClick}>
          {children}
        </Markdown>
      </div>
    );
  }

  return <div className={classNames}>{children}</div>;
}
