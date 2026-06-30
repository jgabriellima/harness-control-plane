import React from 'react';

export default function EmptyStateHero() {
  return (
    <div className="flex flex-col items-center text-center" data-testid="empty-state-hero">
      <div className="mb-6 flex h-24 w-32 items-center justify-center">
        <div className="relative">
          <div className="flex h-16 w-20 items-center justify-center rounded-2xl bg-gray-100/80">
            <svg className="h-8 w-8 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              <circle cx="9" cy="10" r="1" fill="currentColor" />
              <circle cx="12" cy="10" r="1" fill="currentColor" />
              <circle cx="15" cy="10" r="1" fill="currentColor" />
            </svg>
          </div>
          <div className="absolute -right-4 -top-2 flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 shadow-sm">
            <svg className="h-5 w-5 text-gray-500" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l1.09 3.26L16 6.27l-2.91 2.12L14.18 12 12 9.77 9.82 12l1.09-3.61L8 6.27l2.91-.01L12 2z" />
            </svg>
          </div>
        </div>
      </div>

      <h2 className="mb-2 text-xl font-semibold text-gray-900">Start a new conversation</h2>
      <p className="max-w-lg text-sm text-gray-500">
        Ask anything about your QA ecosystem. Use natural language or try a command to get started.
      </p>
    </div>
  );
}
