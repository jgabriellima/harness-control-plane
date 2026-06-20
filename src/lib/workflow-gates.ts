import type { WorkflowNodeSpec } from './types/workflow';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function extractGateRulesFromPostCondition(postCondition: unknown): string[] {
  if (!isRecord(postCondition) || !Array.isArray(postCondition.checks)) {
    return [];
  }

  const rules: string[] = [];

  for (const check of postCondition.checks) {
    if (!isRecord(check)) {
      continue;
    }

    if (typeof check.ref === 'string') {
      rules.push(check.ref);
      continue;
    }

    if (check.type === 'schema' && typeof check.schema === 'string') {
      rules.push(`schema:${check.schema}`);
    }
  }

  return rules;
}

export function buildNodeGateRuleMap(nodes: WorkflowNodeSpec[]): Map<string, string[]> {
  const map = new Map<string, string[]>();

  for (const node of nodes) {
    const rules = extractGateRulesFromPostCondition(node.postCondition);
    if (rules.length > 0) {
      map.set(node.id, rules);
    }
  }

  return map;
}
