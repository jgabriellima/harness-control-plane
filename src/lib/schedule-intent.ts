export interface ParsedScheduleIntent {
  title: string;
  description: string;
  icon: string;
  cron: string | null;
  needsSchedule: boolean;
}

const SCHEDULE_PHRASE =
  /\b(every\s+(day|morning|evening|night|hour|week|monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekday|weekend)|daily|weekly|hourly|once\s+a\s+(day|week|month)|each\s+(day|week|morning|friday)|at\s+\d{1,2}(:\d{2})?\s*(am|pm)?|\d{1,2}:\d{2}|@\w+)\b/gi;

const WEEKDAY_MAP: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function stripSchedulePhrases(text: string): string {
  return text
    .replace(SCHEDULE_PHRASE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseHourMinute(text: string): { hour: number; minute: number } {
  const atMatch = text.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (atMatch) {
    let hour = Number.parseInt(atMatch[1] ?? '9', 10);
    const minute = Number.parseInt(atMatch[2] ?? '0', 10);
    const meridiem = atMatch[3]?.toLowerCase();
    if (meridiem === 'pm' && hour < 12) {
      hour += 12;
    }
    if (meridiem === 'am' && hour === 12) {
      hour = 0;
    }
    return { hour, minute };
  }

  const colonMatch = text.match(/\b(\d{1,2}):(\d{2})\b/);
  if (colonMatch) {
    return {
      hour: Number.parseInt(colonMatch[1] ?? '9', 10),
      minute: Number.parseInt(colonMatch[2] ?? '0', 10),
    };
  }

  return { hour: 9, minute: 0 };
}

function detectWeekday(text: string): number | null {
  const lower = text.toLowerCase();
  for (const [name, index] of Object.entries(WEEKDAY_MAP)) {
    if (lower.includes(name)) {
      return index;
    }
  }
  if (/\bweekday(s)?\b/.test(lower)) {
    return 1;
  }
  return null;
}

function detectCron(text: string): string | null {
  const lower = text.toLowerCase();

  const explicitCron = text.match(/\b(\S+\s+\S+\s+\S+\s+\S+\s+\S+)\b/);
  if (explicitCron && explicitCron[1].split(' ').length === 5) {
    const candidate = explicitCron[1];
    if (/^[\d*,/-]+(\s+[\d*,/-]+){4}$/.test(candidate)) {
      return candidate;
    }
  }

  if (/\b(hourly|every\s+hour)\b/.test(lower)) {
    return '0 * * * *';
  }

  const { hour, minute } = parseHourMinute(lower);

  if (/\b(daily|every\s+day|each\s+day|once\s+a\s+day|every\s+morning)\b/.test(lower)) {
    return `${minute} ${hour} * * *`;
  }

  const weekday = detectWeekday(lower);
  if (weekday !== null && /\b(weekly|every\s+week|once\s+a\s+week|each\s+week)\b/.test(lower)) {
    return `${minute} ${hour} * * ${weekday}`;
  }
  if (weekday !== null && /\bevery\b/.test(lower)) {
    return `${minute} ${hour} * * ${weekday}`;
  }

  if (/\b(weekly|once\s+a\s+week|every\s+week)\b/.test(lower)) {
    return `${minute} ${hour} * * 1`;
  }

  return null;
}

function inferIcon(text: string): string {
  const lower = text.toLowerCase();
  if (/\b(emails?|inbox|mail)\b/.test(lower)) {
    return 'mail';
  }
  if (/\b(research|paper|report|article)\b/.test(lower)) {
    return 'globe';
  }
  if (/\b(job|consult|work|career)\b/.test(lower)) {
    return 'briefcase';
  }
  if (/\b(run|running|exercise|workout|fitness)\b/.test(lower)) {
    return 'activity';
  }
  if (/\b(brief|news|update|morning)\b/.test(lower)) {
    return 'sun';
  }
  return 'calendar';
}

function deriveTitle(description: string): string {
  const firstSentence = description.split(/[.!?]/)[0]?.trim() ?? description;
  if (firstSentence.length <= 56) {
    return firstSentence;
  }
  return `${firstSentence.slice(0, 53).trim()}...`;
}

export function parseScheduleIntent(rawInput: string): ParsedScheduleIntent {
  const trimmed = rawInput.trim();
  const cron = detectCron(trimmed);
  const description = stripSchedulePhrases(trimmed) || trimmed;

  return {
    title: deriveTitle(description),
    description,
    icon: inferIcon(trimmed),
    cron,
    needsSchedule: cron === null,
  };
}

export function formatCronLabel(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) {
    return cron;
  }

  const [minute, hour, , , dayOfWeek] = parts;
  if (minute === '0' && hour === '*' && dayOfWeek === '*') {
    return 'Every hour';
  }
  if (dayOfWeek === '*' && hour !== '*') {
    return `Daily at ${hour.padStart(2, '0')}:${minute.padStart(2, '0')} UTC`;
  }
  if (dayOfWeek !== '*') {
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayIndex = Number.parseInt(dayOfWeek, 10);
    const dayLabel = names[dayIndex] ?? dayOfWeek;
    return `Weekly on ${dayLabel} at ${hour.padStart(2, '0')}:${minute.padStart(2, '0')} UTC`;
  }
  return cron;
}

export const SCHEDULE_PRESETS = [
  { id: 'daily-9', label: 'Daily at 9:00 UTC', cron: '0 9 * * *' },
  { id: 'daily-8', label: 'Daily at 8:00 UTC', cron: '0 8 * * *' },
  { id: 'weekly-fri', label: 'Every Friday at 9:00 UTC', cron: '0 9 * * 5' },
  { id: 'weekly-mon', label: 'Every Monday at 9:00 UTC', cron: '0 9 * * 1' },
  { id: 'hourly', label: 'Every hour', cron: '0 * * * *' },
] as const;
