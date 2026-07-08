export interface ScheduleReadyPayload {
  title: string;
  description: string;
  cron: string;
  icon?: string;
}

const SCHEDULE_READY_PATTERN = /```schedule-ready\s*([\s\S]*?)```/i;
const JSON_FENCE_PATTERN = /```(?:json)?\s*([\s\S]*?)```/gi;

function parseScheduleRecord(raw: unknown): ScheduleReadyPayload | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const title = typeof record.title === 'string' ? record.title.trim() : '';
  const description = typeof record.description === 'string' ? record.description.trim() : '';
  const cron = typeof record.cron === 'string' ? record.cron.trim() : '';
  const icon = typeof record.icon === 'string' ? record.icon.trim() : undefined;

  if (!title || !description || !cron) {
    return null;
  }

  return { title, description, cron, icon };
}

function tryParseJsonPayload(text: string): ScheduleReadyPayload | null {
  try {
    return parseScheduleRecord(JSON.parse(text.trim()));
  } catch {
    return null;
  }
}

export function parseScheduleReadyBlock(content: string): ScheduleReadyPayload | null {
  const scheduleReadyMatch = content.match(SCHEDULE_READY_PATTERN);
  if (scheduleReadyMatch?.[1]) {
    const parsed = tryParseJsonPayload(scheduleReadyMatch[1]);
    if (parsed) {
      return parsed;
    }
  }

  const fences = [...content.matchAll(JSON_FENCE_PATTERN)];
  for (const fence of fences) {
    const candidate = fence[1];
    if (!candidate) {
      continue;
    }
    const parsed = tryParseJsonPayload(candidate);
    if (parsed) {
      return parsed;
    }
  }

  const inlineObjectMatch = content.match(/\{[\s\S]*?"title"[\s\S]*?"cron"[\s\S]*?\}/);
  if (inlineObjectMatch?.[0]) {
    const parsed = tryParseJsonPayload(inlineObjectMatch[0]);
    if (parsed) {
      return parsed;
    }
  }

  return null;
}
