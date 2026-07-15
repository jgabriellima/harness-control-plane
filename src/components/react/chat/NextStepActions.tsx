'use client';

import { ChevronRight, FileText, Plus, RefreshCw, Sparkles } from 'lucide-react';
import React, { useState } from 'react';

import type { ChatSessionMode } from '@/lib/chat-types';

import styles from './NextStepActions.module.css';

export type NextStepActionsVariant = 'default' | 'project-incomplete' | 'plan';

export const PROJECT_CONTINUE_PROMPT =
  'Continue from the stopped or incomplete turn. Read the conversation, current project files, and any visible errors, then take the next concrete step. If a primary artifact already exists, update it in place; otherwise create the missing primary artifact and summarize what changed.';

export const PROJECT_GENERATE_ARTIFACT_PROMPT =
  'Generate the missing project artifact now. Use the current conversation and project context to create the primary previewable deliverable. Save it with a short semantic filename and include a concise summary of the files created.';

interface NextStepAction {
  id: string;
  icon: React.ReactNode;
  title: string;
  description?: string;
  prompt: string;
  sessionMode?: ChatSessionMode;
}

const PROJECT_INCOMPLETE_ACTIONS: NextStepAction[] = [
  {
    id: 'project-continue',
    icon: <RefreshCw className="h-3.5 w-3.5" />,
    title: 'Continue working',
    prompt: PROJECT_CONTINUE_PROMPT,
  },
  {
    id: 'project-generate-artifact',
    icon: <Plus className="h-3.5 w-3.5" />,
    title: 'Generate artifact',
    prompt: PROJECT_GENERATE_ARTIFACT_PROMPT,
  },
];

const DEFAULT_ACTIONS: NextStepAction[] = [
  {
    id: 'continue-chat',
    icon: <Sparkles className="h-3.5 w-3.5" />,
    title: 'Continue working',
    prompt: PROJECT_CONTINUE_PROMPT,
  },
  {
    id: 'generate-artifact',
    icon: <Plus className="h-3.5 w-3.5" />,
    title: 'Generate artifact',
    prompt: PROJECT_GENERATE_ARTIFACT_PROMPT,
  },
];

const PLAN_ACTIONS: NextStepAction[] = [
  {
    id: 'plan-generate',
    icon: <Sparkles className="h-3.5 w-3.5" />,
    title: 'Generate from plan',
    description: 'Turn the plan into a design artifact',
    prompt:
      'Read the plan document and generate the primary design artifact it describes. Update project files in place.',
    sessionMode: 'design',
  },
  {
    id: 'plan-improve',
    icon: <FileText className="h-3.5 w-3.5" />,
    title: 'Improve plan',
    description: 'Refine the markdown plan',
    prompt: 'Review and improve the plan document based on the conversation so far.',
    sessionMode: 'plan',
  },
];

function actionsForVariant(variant: NextStepActionsVariant): NextStepAction[] {
  if (variant === 'project-incomplete') {
    return PROJECT_INCOMPLETE_ACTIONS;
  }
  if (variant === 'plan') {
    return PLAN_ACTIONS;
  }
  return DEFAULT_ACTIONS;
}

export interface NextStepActionsProps {
  variant?: NextStepActionsVariant;
  onPromptAction: (prompt: string, options?: { sessionMode?: ChatSessionMode }) => void;
  onMore?: () => void;
}

export default function NextStepActions({
  variant = 'default',
  onPromptAction,
  onMore,
}: NextStepActionsProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const actions = actionsForVariant(variant);
  const featured = actions.slice(0, 2);
  const overflow = actions.slice(2);

  return (
    <div className={styles.root} data-testid="next-step-actions">
      <span className={styles.label}>Next step</span>
      <div className={styles.row}>
        {featured.map((action) => (
          <button
            key={action.id}
            type="button"
            className={styles.chip}
            onClick={() => onPromptAction(action.prompt, { sessionMode: action.sessionMode })}
            data-testid={`next-step-${action.id}`}
          >
            <span className={styles.chipIcon}>{action.icon}</span>
            <span className={styles.chipCopy}>
              <span className={styles.chipTitle}>{action.title}</span>
              {action.description ? (
                <span className={styles.chipDesc}>{action.description}</span>
              ) : null}
            </span>
            <ChevronRight className={styles.chipChevron} aria-hidden="true" />
          </button>
        ))}
        {overflow.length > 0 || onMore ? (
          <button
            type="button"
            className={styles.more}
            onClick={() => {
              if (onMore) {
                onMore();
                return;
              }
              setMoreOpen((open) => !open);
            }}
            aria-expanded={moreOpen}
            data-testid="next-step-more"
          >
            More
          </button>
        ) : null}
      </div>
      {moreOpen && overflow.length > 0 ? (
        <div className={styles.moreMenu}>
          {overflow.map((action) => (
            <button
              key={action.id}
              type="button"
              className={styles.moreItem}
              onClick={() => {
                onPromptAction(action.prompt, { sessionMode: action.sessionMode });
                setMoreOpen(false);
              }}
            >
              {action.title}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
