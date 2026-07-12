import type { SdkToolCallRecord } from '@/lib/sdk-agent-observability-types';
import type { ToolRecord } from '@/components/react/ToolInspector';

export function sdkToolCallToToolRecord(call: SdkToolCallRecord): ToolRecord {
  return {
    name: call.tool,
    status: call.status,
    args: call.args,
    result: call.result,
    startedAt: call.startedAt,
    recordedAt: call.recordedAt,
    durationMs: call.durationMs,
  };
}
