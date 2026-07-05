'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  createVoiceInputEngine,
  type VoiceInputEngine,
  type VoiceInputPhase,
} from '@/lib/voice-input-engine';
import type { VoiceInputConfig } from '@/lib/voice-input-config';
import {
  formatKeyboardShortcut,
  matchesKeyboardShortcut,
  parseKeyboardShortcut,
} from '@/lib/keyboard-shortcut';

export interface UseVoiceInputOptions {
  config: VoiceInputConfig;
  value: string;
  onValueChange: (value: string) => void;
  onSubmit?: () => void;
  disabled?: boolean;
}

export interface UseVoiceInputResult {
  phase: VoiceInputPhase;
  listening: boolean;
  error: string | null;
  supported: boolean;
  shortcutLabel: string;
  toggle: () => void;
  stop: (options?: { abort?: boolean }) => void;
}

export function useVoiceInput({
  config,
  value,
  onValueChange,
  onSubmit,
  disabled = false,
}: UseVoiceInputOptions): UseVoiceInputResult {
  const [phase, setPhase] = useState<VoiceInputPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const engineRef = useRef<VoiceInputEngine | null>(null);
  const valueRef = useRef(value);
  const onValueChangeRef = useRef(onValueChange);
  const onSubmitRef = useRef(onSubmit);
  const configRef = useRef(config);

  valueRef.current = value;
  onValueChangeRef.current = onValueChange;
  onSubmitRef.current = onSubmit;
  configRef.current = config;

  const shortcutLabel = useMemo(
    () => formatKeyboardShortcut(config.keyboardShortcut),
    [config.keyboardShortcut],
  );

  const parsedShortcut = useMemo(
    () => parseKeyboardShortcut(config.keyboardShortcut),
    [config.keyboardShortcut],
  );

  const supported =
    typeof window !== 'undefined' &&
    (config.engine === 'media'
      ? Boolean(navigator.mediaDevices?.getUserMedia)
      : Boolean(window.SpeechRecognition || window.webkitSpeechRecognition));

  const ensureEngine = useCallback((): VoiceInputEngine => {
    if (engineRef.current) {
      return engineRef.current;
    }

    const engine = createVoiceInputEngine(configRef.current.engine, {
      onInterimTranscript: (text) => {
        onValueChangeRef.current(text);
      },
      onFinalTranscript: (text) => {
        onValueChangeRef.current(text);
        if (configRef.current.autoSubmit && text.trim()) {
          onSubmitRef.current?.();
        }
      },
      onPhaseChange: (nextPhase) => {
        setPhase(nextPhase);
      },
      onError: (message) => {
        setError(message);
      },
    });

    engineRef.current = engine;
    return engine;
  }, []);

  const stop = useCallback((options?: { abort?: boolean }) => {
    engineRef.current?.stop(options);
    setPhase('idle');
  }, []);

  const toggle = useCallback(() => {
    if (!configRef.current.enabled || disabled) {
      return;
    }

    setError(null);

    if (phase === 'listening' || phase === 'processing') {
      stop({ abort: true });
      return;
    }

    const engine = ensureEngine();
    void engine
      .start({
        language: configRef.current.language,
        baseText: valueRef.current,
      })
      .catch((startError) => {
        setPhase('idle');
        setError(startError instanceof Error ? startError.message : 'Voice input failed');
      });
  }, [disabled, ensureEngine, phase, stop]);

  useEffect(() => {
    if (!config.enabled || disabled || !parsedShortcut) {
      return;
    }

    function onKeyDown(event: KeyboardEvent): void {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        if (target.tagName !== 'TEXTAREA' || !target.closest('[data-testid="chat-pane-composer"]')) {
          return;
        }
      }

      if (!matchesKeyboardShortcut(event, parsedShortcut)) {
        return;
      }

      event.preventDefault();
      toggle();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [config.enabled, disabled, parsedShortcut, toggle]);

  useEffect(
    () => () => {
      engineRef.current?.dispose();
      engineRef.current = null;
    },
    [],
  );

  return {
    phase,
    listening: phase === 'listening',
    error,
    supported,
    shortcutLabel,
    toggle,
    stop,
  };
}
