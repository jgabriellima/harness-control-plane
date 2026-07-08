export interface ScheduleReadyPayload {
  title: string;
  description: string;
  cron: string;
  icon?: string;
}

const SCHEDULE_READY_PATTERN = /```schedule-ready\s*([\s\S]*?)```/i;

export function parseScheduleReadyBlock(content: string): ScheduleReadyPayload | null {
  const match = content.match(SCHEDULE_READY_PATTERN);
  if (!match?.[1]) {
    return null;
  }

  try {
    const parsed = JSON.parse(match[1].trim()) as unknown;
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }

    const record = parsed as Record<string, unknown>;
    const title = typeof record.title === 'string' ? record.title.trim() : '';
    const description = typeof record.description === 'string' ? record.description.trim() : '';
    const cron = typeof record.cron === 'string' ? record.cron.trim() : '';
    const icon = typeof record.icon === 'string' ? record.icon.trim() : undefined;

    if (!title || !description || !cron) {
      return null;
    }

    return { title, description, cron, icon };
  } catch {
    return null;
  }
}
