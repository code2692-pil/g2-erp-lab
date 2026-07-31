export interface AppHistoryEntry<Page extends string = string> {
  version: 1;
  id: string;
  index: number;
  page: Page;
}

const historyKey = "g2ErpAppNavigation";

export function readAppHistoryEntry<Page extends string>(state: unknown): AppHistoryEntry<Page> | null {
  if (!state || typeof state !== "object") return null;
  const value = (state as Record<string, unknown>)[historyKey];
  if (!value || typeof value !== "object") return null;
  const entry = value as Record<string, unknown>;
  if (entry.version !== 1 || typeof entry.id !== "string" || !entry.id || !Number.isInteger(entry.index) || typeof entry.page !== "string") return null;
  return entry as unknown as AppHistoryEntry<Page>;
}

export function withAppHistoryEntry<Page extends string>(state: unknown, entry: AppHistoryEntry<Page>) {
  const base = state && typeof state === "object" ? state as Record<string, unknown> : {};
  return { ...base, [historyKey]: entry };
}

export function navigationDelta<Page extends string>(current: AppHistoryEntry<Page>, target: AppHistoryEntry<Page>) {
  return target.index - current.index;
}
