import React, { useEffect, useState } from 'react';

import type { HarnessCommand } from '../../lib/harness-types';
import CommandCard from './CommandCard';
import EmptyStateHero from './EmptyStateHero';
import MessageComposer from './MessageComposer';

export default function HomeEmptyState() {
  const [message, setMessage] = useState('');
  const [commands, setCommands] = useState<HarnessCommand[]>([]);
  const [commandsError, setCommandsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadCommands(): Promise<void> {
      try {
        const response = await fetch('/api/runtime/commands');
        if (!response.ok) {
          throw new Error('Failed to load harness commands');
        }

        const payload = (await response.json()) as { commands: HarnessCommand[] };
        if (!cancelled) {
          setCommands(payload.commands);
          setCommandsError(null);
        }
      } catch (error) {
        if (!cancelled) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to load commands';
          setCommandsError(errorMessage);
        }
      }
    }

    void loadCommands();

    return () => {
      cancelled = true;
    };
  }, []);

  function handleCommandSelect(command: string) {
    setMessage(command);
  }

  return (
    <div className="flex min-h-full flex-col" data-testid="home-empty-state">
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <EmptyStateHero />

        {commandsError ? (
          <p className="mt-6 text-xs text-red-600" role="alert">
            {commandsError}
          </p>
        ) : null}

        <div className="mt-8 grid w-full max-w-4xl grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {commands.map((item) => (
            <CommandCard
              key={item.command}
              command={item.command}
              description={item.description}
              onSelect={handleCommandSelect}
            />
          ))}
        </div>

        <div className="mt-8 flex w-full max-w-4xl items-center gap-4">
          <div className="h-px flex-1 bg-gray-200" />
          <span className="text-xs font-medium text-gray-400">or</span>
          <div className="h-px flex-1 bg-gray-200" />
        </div>

        <p className="mt-4 text-xs text-gray-400">
          Type &apos;/&apos; in the prompt to see all harness commands
        </p>
      </div>

      <MessageComposer value={message} onChange={setMessage} knownCommands={commands.map((item) => item.command)} />
    </div>
  );
}
