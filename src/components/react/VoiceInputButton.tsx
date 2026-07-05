'use client';

import { Mic, Square } from 'lucide-react';
import React from 'react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { VoiceInputPhase } from '@/lib/voice-input-engine';

export interface VoiceInputButtonProps {
  phase: VoiceInputPhase;
  disabled?: boolean;
  supported?: boolean;
  shortcutLabel?: string;
  error?: string | null;
  onToggle: () => void;
}

export default function VoiceInputButton({
  phase,
  disabled = false,
  supported = true,
  shortcutLabel,
  error,
  onToggle,
}: VoiceInputButtonProps) {
  const listening = phase === 'listening';
  const processing = phase === 'processing';

  const label = listening
    ? 'Stop voice input'
    : processing
      ? 'Transcribing…'
      : 'Voice input';

  const tooltip = error
    ? error
    : supported
      ? shortcutLabel
        ? `${label} (${shortcutLabel})`
        : label
      : 'Voice input is not supported in this browser';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            data-testid="chat-voice-input"
            data-listening={listening ? 'true' : 'false'}
            data-phase={phase}
            className={`h-9 w-9 shrink-0 rounded-full ${
              listening ? 'bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700' : ''
            }`}
            disabled={disabled || !supported || processing}
            aria-label={label}
            aria-pressed={listening}
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
          >
            {listening ? <Square className="h-3.5 w-3.5 fill-current" /> : <Mic className="h-4 w-4" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
