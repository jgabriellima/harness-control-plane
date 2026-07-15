'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import {
  applyReaderPreferencesToDocument,
  DEFAULT_READER_PREFERENCES,
  type ReaderFontSize,
  type ReaderLineHeight,
  type ReaderPreferences,
  type ReaderSpacing,
} from '@/lib/reader-preferences';

interface ReaderPreferencesContextValue {
  preferences: ReaderPreferences;
  loading: boolean;
  updatePreferences: (patch: Partial<ReaderPreferences>) => Promise<void>;
}

const ReaderPreferencesContext = createContext<ReaderPreferencesContextValue | null>(null);

export function ReaderPreferencesProvider({ children }: { children: React.ReactNode }) {
  const [preferences, setPreferences] = useState<ReaderPreferences>(DEFAULT_READER_PREFERENCES);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/ui/reader-preferences');
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as ReaderPreferences;
      setPreferences(payload);
      applyReaderPreferencesToDocument(payload);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const updatePreferences = useCallback(async (patch: Partial<ReaderPreferences>) => {
    const response = await fetch('/api/ui/reader-preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const payload = (await response.json()) as ReaderPreferences & { error?: string };
    if (!response.ok) {
      throw new Error(payload.error ?? 'Failed to save reader preferences');
    }
    setPreferences(payload);
    applyReaderPreferencesToDocument(payload);
  }, []);

  const value = useMemo(
    () => ({
      preferences,
      loading,
      updatePreferences,
    }),
    [preferences, loading, updatePreferences],
  );

  return (
    <ReaderPreferencesContext.Provider value={value}>{children}</ReaderPreferencesContext.Provider>
  );
}

export function useReaderPreferences(): ReaderPreferencesContextValue {
  const context = useContext(ReaderPreferencesContext);
  if (!context) {
    throw new Error('useReaderPreferences must be used within ReaderPreferencesProvider');
  }
  return context;
}

export type { ReaderFontSize, ReaderLineHeight, ReaderSpacing, ReaderPreferences };
