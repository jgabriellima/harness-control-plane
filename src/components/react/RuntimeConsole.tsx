'use client';

import ChatPane from './ChatPane';

interface RuntimeConsoleProps {
  conversationId?: string;
  seedArtifactE2e?: boolean;
}

export default function RuntimeConsole({
  conversationId,
  seedArtifactE2e = false,
}: RuntimeConsoleProps) {
  return (
    <div className="h-[calc(100dvh-3.5rem)] min-h-0" data-testid="runtime-console">
      <ChatPane
        conversationId={conversationId ?? null}
        seedArtifactE2e={seedArtifactE2e}
      />
    </div>
  );
}
