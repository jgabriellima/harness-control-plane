export type VoiceInputPhase = 'idle' | 'listening' | 'processing' | 'error';

export interface VoiceInputCallbacks {
  onInterimTranscript: (text: string) => void;
  onFinalTranscript: (text: string) => void;
  onPhaseChange: (phase: VoiceInputPhase) => void;
  onError: (message: string | null) => void;
}

export interface VoiceInputEngine {
  start: (options: { language: string; baseText: string }) => Promise<void>;
  stop: (options?: { abort?: boolean }) => void;
  dispose: () => void;
}

interface SpeechRecognitionAlternativeLike {
  transcript?: string;
}

interface SpeechRecognitionResultLike {
  0?: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionResultListLike {
  length: number;
  [index: number]: SpeechRecognitionResultLike;
}

interface SpeechRecognitionEventLike {
  results: SpeechRecognitionResultListLike;
}

interface SpeechRecognitionErrorEventLike {
  error?: string;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionLike;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

function speechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

export function isEmbeddedPreviewBrowser(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  const ua = navigator.userAgent || '';
  if (/Electron/i.test(ua)) {
    return true;
  }
  if (/Cursor/i.test(ua)) {
    return true;
  }
  try {
    return Boolean(
      (window as Window & { cursor?: unknown; __CURSOR__?: unknown; __GLASS_BROWSER__?: unknown })
        .cursor ||
        (window as Window & { __CURSOR__?: unknown }).__CURSOR__ ||
        (window as Window & { __GLASS_BROWSER__?: unknown }).__GLASS_BROWSER__,
    );
  } catch {
    return false;
  }
}

export function voiceInputUnavailableMessage(): string {
  return 'Voice input works in Chrome or Safari. Embedded preview browsers cannot reach speech services.';
}

export function mapVoiceRecognitionError(code: string): string | null {
  switch (code) {
    case 'not-allowed':
      return 'Microphone access blocked';
    case 'audio-capture':
      return 'No microphone found';
    case 'network':
      return isEmbeddedPreviewBrowser()
        ? voiceInputUnavailableMessage()
        : 'Voice input needs a network connection (browser speech uses a cloud service)';
    case 'service-not-allowed':
      return 'Voice input is not available in this browser tab';
    case 'language-not-supported':
      return 'Speech language not supported';
    case 'no-speech':
    case 'aborted':
      return null;
    default:
      return `Voice input failed (${code})`;
  }
}

export function createBrowserSpeechEngine(callbacks: VoiceInputCallbacks): VoiceInputEngine {
  let recognition: SpeechRecognitionLike | null = null;
  let interimBase = '';
  let suppressEnd = false;
  let latestTranscript = '';

  function releaseRecognition(abort: boolean): void {
    const active = recognition;
    recognition = null;
    if (!active) {
      return;
    }
    active.onstart = null;
    active.onresult = null;
    active.onerror = null;
    active.onend = null;
    try {
      if (abort) {
        active.abort();
      } else {
        active.stop();
      }
    } catch {
      /* already ended */
    }
  }

  return {
    async start({ language, baseText }) {
      const Ctor = speechRecognitionConstructor();
      if (!Ctor) {
        throw new Error('Voice input needs Speech Recognition (Chrome, Safari, or Edge)');
      }
      if (typeof window !== 'undefined' && !window.isSecureContext) {
        throw new Error('Voice input needs HTTPS or localhost');
      }
      if (isEmbeddedPreviewBrowser()) {
        throw new Error(voiceInputUnavailableMessage());
      }

      releaseRecognition(true);
      suppressEnd = false;
      interimBase = baseText.trim() ? `${baseText.trim()} ` : '';
      latestTranscript = interimBase.trim();

      const rec = new Ctor();
      rec.continuous = false;
      rec.interimResults = true;
      rec.lang = language;
      rec.maxAlternatives = 1;

      rec.onstart = () => {
        callbacks.onPhaseChange('listening');
      };

      rec.onresult = (event) => {
        let transcript = '';
        for (let index = 0; index < event.results.length; index += 1) {
          transcript += event.results[index]?.[0]?.transcript ?? '';
        }
        latestTranscript = (interimBase + transcript).trim();
        callbacks.onInterimTranscript(latestTranscript);
      };

      rec.onerror = (event) => {
        const message = mapVoiceRecognitionError(event.error ?? 'unknown');
        suppressEnd = true;
        releaseRecognition(true);
        callbacks.onPhaseChange('idle');
        callbacks.onError(message);
      };

      rec.onend = () => {
        if (recognition !== rec) {
          return;
        }
        recognition = null;
        if (suppressEnd) {
          suppressEnd = false;
          return;
        }
        if (latestTranscript) {
          callbacks.onFinalTranscript(latestTranscript);
        }
        callbacks.onPhaseChange('idle');
      };

      recognition = rec;
      try {
        rec.start();
      } catch (error) {
        releaseRecognition(true);
        const message =
          error instanceof Error && error.message.includes('already started')
            ? 'Voice input already running'
            : 'Could not start voice input';
        throw new Error(message);
      }
    },
    stop(options) {
      suppressEnd = Boolean(options?.abort);
      releaseRecognition(Boolean(options?.abort));
      callbacks.onPhaseChange('idle');
    },
    dispose() {
      suppressEnd = true;
      releaseRecognition(true);
    },
  };
}

export function createMediaRecorderEngine(callbacks: VoiceInputCallbacks): VoiceInputEngine {
  let mediaStream: MediaStream | null = null;
  let mediaRecorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let interimBase = '';

  async function cleanup(): Promise<void> {
    mediaRecorder = null;
    chunks = [];
    if (mediaStream) {
      for (const track of mediaStream.getTracks()) {
        track.stop();
      }
      mediaStream = null;
    }
  }

  return {
    async start({ baseText }) {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone capture is not supported in this browser');
      }

      await cleanup();
      interimBase = baseText.trim() ? `${baseText.trim()} ` : '';
      callbacks.onPhaseChange('listening');

      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        throw new Error('Microphone access blocked');
      }

      chunks = [];
      mediaRecorder = new MediaRecorder(mediaStream);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        void (async () => {
          callbacks.onPhaseChange('processing');
          try {
            const blob = new Blob(chunks, { type: mediaRecorder?.mimeType || 'audio/webm' });
            const formData = new FormData();
            formData.append('audio', blob, 'voice-input.webm');

            const response = await fetch('/api/runtime/transcribe', {
              method: 'POST',
              body: formData,
            });
            const payload = (await response.json()) as { text?: string; error?: string };
            if (!response.ok) {
              throw new Error(payload.error ?? 'Transcription failed');
            }
            const text = payload.text?.trim() ?? '';
            if (text) {
              const combined = `${interimBase}${text}`.trim();
              callbacks.onInterimTranscript(combined);
              callbacks.onFinalTranscript(combined);
            }
            callbacks.onPhaseChange('idle');
          } catch (error) {
            callbacks.onPhaseChange('error');
            callbacks.onError(error instanceof Error ? error.message : 'Transcription failed');
            callbacks.onPhaseChange('idle');
          } finally {
            await cleanup();
          }
        })();
      };

      mediaRecorder.start();
    },
    stop(options) {
      if (options?.abort) {
        void cleanup();
        callbacks.onPhaseChange('idle');
        return;
      }
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        return;
      }
      void cleanup();
      callbacks.onPhaseChange('idle');
    },
    dispose() {
      void cleanup();
    },
  };
}

export function createVoiceInputEngine(
  engine: 'browser' | 'media',
  callbacks: VoiceInputCallbacks,
): VoiceInputEngine {
  if (engine === 'media') {
    return createMediaRecorderEngine(callbacks);
  }
  return createBrowserSpeechEngine(callbacks);
}
