export type DataMode = "mock" | "api";

const configuredMode = import.meta.env.VITE_DATA_MODE;
export const dataMode: DataMode = configuredMode === "api" ? "api" : "mock";
const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:5080").replace(/\/$/, "");

export function isApiMode() {
  return dataMode === "api";
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly errors: readonly string[] = [],
    public readonly traceId?: string
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export async function apiClient<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });

  if (!response.ok) {
    const detail = await response.text();
    let payload: { error?: string; errors?: string[]; traceId?: string } | undefined;
    try { payload = JSON.parse(detail) as { error?: string; errors?: string[]; traceId?: string }; } catch { /* Non-JSON errors retain their response text. */ }
    const errors = Array.isArray(payload?.errors) ? payload.errors : [];
    const message = errors[0] ?? payload?.error ?? (detail || `API request failed: ${response.status}`);
    throw new ApiClientError(message, response.status, errors, payload?.traceId);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
