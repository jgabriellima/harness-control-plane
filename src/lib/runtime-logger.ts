type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function resolveLogLevel(): LogLevel {
  const raw = process.env.CONTROL_PLANE_LOG_LEVEL?.trim().toLowerCase();
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') {
    return raw;
  }
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

let activeLevel = resolveLogLevel();

export function setRuntimeLogLevel(level: LogLevel): void {
  activeLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[activeLevel];
}

export function createRequestId(prefix = 'req'): string {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${stamp}-${rand}`;
}

export interface RuntimeLogFields {
  request_id?: string;
  phase?: string;
  run_id?: string;
  agent_id?: string;
  conversation_id?: string;
  project_id?: string;
  cwd?: string;
  duration_ms?: number;
  error_name?: string;
  error_message?: string;
  [key: string]: unknown;
}

function writeLog(level: LogLevel, event: string, fields: RuntimeLogFields = {}): void {
  if (!shouldLog(level)) {
    return;
  }

  const payload: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    event,
    ...fields,
  };

  if (level === 'error') {
    console.error(JSON.stringify(payload));
    return;
  }

  if (level === 'warn') {
    console.warn(JSON.stringify(payload));
    return;
  }

  console.log(JSON.stringify(payload));
}

export const runtimeLogger = {
  debug(event: string, fields?: RuntimeLogFields): void {
    writeLog('debug', event, fields);
  },
  info(event: string, fields?: RuntimeLogFields): void {
    writeLog('info', event, fields);
  },
  warn(event: string, fields?: RuntimeLogFields): void {
    writeLog('warn', event, fields);
  },
  error(event: string, fields?: RuntimeLogFields): void {
    writeLog('error', event, fields);
  },
};

export function errorFields(error: unknown): RuntimeLogFields {
  if (error instanceof Error) {
    return {
      error_name: error.name,
      error_message: error.message,
      ...(activeLevel === 'debug' && error.stack ? { stack: error.stack.split('\n').slice(0, 8).join('\n') } : {}),
    };
  }
  return { error_message: String(error) };
}

export function isDebugLogLevel(): boolean {
  return activeLevel === 'debug';
}
