/** Shared gate — operator Take control blocks agent CUA tool execution. */

let agentInputBlocked = false;

export function setComputerUseAgentInputBlocked(blocked: boolean): void {
  agentInputBlocked = blocked;
}

export function isComputerUseAgentInputBlocked(): boolean {
  return agentInputBlocked;
}

export function syncComputerUseAgentInputBlocked(activeUserControlCount: number): void {
  setComputerUseAgentInputBlocked(activeUserControlCount > 0);
}
