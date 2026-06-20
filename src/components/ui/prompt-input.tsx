'use client';

import * as React from 'react';
import { useLayoutEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

import { Textarea } from './textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

type PromptInputContextType = {
  isLoading: boolean;
  value: string;
  setValue: (value: string) => void;
  maxHeight: number | string;
  onSubmit?: () => void;
  disabled?: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
};

const PromptInputContext = React.createContext<PromptInputContextType>({
  isLoading: false,
  value: '',
  setValue: () => undefined,
  maxHeight: 240,
  onSubmit: undefined,
  disabled: false,
  textareaRef: React.createRef<HTMLTextAreaElement>(),
});

function usePromptInput(): PromptInputContextType {
  return React.useContext(PromptInputContext);
}

export type PromptInputProps = {
  isLoading?: boolean;
  value?: string;
  onValueChange?: (value: string) => void;
  maxHeight?: number | string;
  onSubmit?: () => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
} & React.ComponentProps<'div'>;

export function PromptInput({
  className,
  isLoading = false,
  maxHeight = 240,
  value,
  onValueChange,
  onSubmit,
  children,
  disabled = false,
  onClick,
  ...props
}: PromptInputProps) {
  const [internalValue, setInternalValue] = useState(value ?? '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (value !== undefined) {
      setInternalValue(value);
    }
  }, [value]);

  const handleChange = (newValue: string): void => {
    setInternalValue(newValue);
    onValueChange?.(newValue);
  };

  const handleClick: React.MouseEventHandler<HTMLDivElement> = (event) => {
    if ((event.target as HTMLElement).closest('button')) {
      onClick?.(event);
      return;
    }

    if (!disabled) {
      textareaRef.current?.focus();
    }
    onClick?.(event);
  };

  return (
    <TooltipProvider>
      <PromptInputContext.Provider
        value={{
          isLoading,
          value: value ?? internalValue,
          setValue: handleChange,
          maxHeight,
          onSubmit,
          disabled,
          textareaRef,
        }}
      >
        <div
          className={cn(
            'rounded-2xl border-2 border-violet-200 bg-white p-3 shadow-sm',
            disabled && 'opacity-60',
            className,
          )}
          onClick={handleClick}
          {...props}
        >
          {children}
        </div>
      </PromptInputContext.Provider>
    </TooltipProvider>
  );
}

export type PromptInputTextareaProps = {
  disableAutosize?: boolean;
} & React.ComponentProps<typeof Textarea>;

export function PromptInputTextarea({
  className,
  onKeyDown,
  disableAutosize = false,
  ...props
}: PromptInputTextareaProps) {
  const { value, setValue, maxHeight, onSubmit, disabled, textareaRef } = usePromptInput();

  const adjustHeight = (element: HTMLTextAreaElement | null): void => {
    if (!element || disableAutosize) {
      return;
    }

    element.style.height = 'auto';
    if (typeof maxHeight === 'number') {
      element.style.height = `${Math.min(element.scrollHeight, maxHeight)}px`;
    } else {
      element.style.height = `min(${element.scrollHeight}px, ${maxHeight})`;
    }
  };

  useLayoutEffect(() => {
    adjustHeight(textareaRef.current);
  }, [value, maxHeight, disableAutosize, textareaRef]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    onKeyDown?.(event);
    if (event.defaultPrevented) {
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      onSubmit?.();
    }
  };

  return (
    <Textarea
      ref={textareaRef}
      value={value}
      disabled={disabled}
      className={cn('min-h-[44px] resize-none', className)}
      onChange={(event) => {
        adjustHeight(event.target);
        setValue(event.target.value);
      }}
      onKeyDown={handleKeyDown}
      {...props}
    />
  );
}

export function PromptInputActions({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('mt-2 flex items-center justify-between gap-2', className)} {...props}>
      {children}
    </div>
  );
}

export type PromptInputActionProps = {
  className?: string;
  tooltip: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
} & React.ComponentProps<'button'>;

export function PromptInputAction({
  tooltip,
  children,
  className,
  side = 'top',
  ...props
}: PromptInputActionProps) {
  const { disabled } = usePromptInput();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50',
            className,
          )}
          disabled={disabled}
          onClick={(event) => event.stopPropagation()}
          {...props}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side={side}>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
