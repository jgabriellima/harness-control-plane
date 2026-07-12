function normalizeToolName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function toolNamesMatch(definitionName: string, invocationName: string): boolean {
  return normalizeToolName(definitionName) === normalizeToolName(invocationName);
}
