import { Calendar, Mail, Globe, Briefcase, Activity, Sun } from 'lucide-react';
import React from 'react';

import type { ScheduleTip } from '../../lib/schedule-tips';

interface ScheduleTipCardProps {
  tip: ScheduleTip;
  onSelect: (prompt: string) => void;
}

function TipIcon({ name }: { name: string }) {
  const className = 'h-5 w-5 text-gray-500';
  switch (name) {
    case 'mail':
      return <Mail className={className} aria-hidden="true" />;
    case 'globe':
      return <Globe className={className} aria-hidden="true" />;
    case 'briefcase':
      return <Briefcase className={className} aria-hidden="true" />;
    case 'activity':
      return <Activity className={className} aria-hidden="true" />;
    case 'sun':
      return <Sun className={className} aria-hidden="true" />;
    default:
      return <Calendar className={className} aria-hidden="true" />;
  }
}

export default function ScheduleTipCard({ tip, onSelect }: ScheduleTipCardProps) {
  return (
    <button
      type="button"
      data-testid={`schedule-tip-${tip.id}`}
      className="flex w-full flex-col items-start rounded-xl border border-gray-200 bg-white p-4 text-left transition-colors hover:border-gray-300 hover:bg-gray-50"
      onClick={() => onSelect(tip.prompt)}
    >
      <span className="mb-2 flex items-center gap-2">
        <TipIcon name={tip.icon} />
        <span className="text-sm font-medium text-gray-900">{tip.title}</span>
      </span>
      <span className="text-xs leading-relaxed text-gray-500">{tip.description}</span>
    </button>
  );
}
