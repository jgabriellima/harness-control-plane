'use client';

import { StickToBottom } from 'use-stick-to-bottom';

import { cn } from '@/lib/utils';

export function ChatContainerRoot({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <StickToBottom className={cn('relative flex h-full flex-col overflow-hidden', className)} {...props}>
      {children}
    </StickToBottom>
  );
}

export function ChatContainerContent({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <StickToBottom.Content className={cn('flex flex-col gap-4 p-6', className)} {...props}>
      {children}
    </StickToBottom.Content>
  );
}

export function ChatContainerScrollAnchor({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('h-px w-full shrink-0', className)} {...props} />;
}
