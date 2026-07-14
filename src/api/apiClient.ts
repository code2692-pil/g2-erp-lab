export type DataMode = "mock" | "api";

const configuredMode = import.meta.env.VITE_DATA_MODE;
export const dataMode: DataMode = configuredMode === "api" ? "api" : "mock";
const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:5080").replace(/\/$/, "");

export function isApiMode() {
  return dataMode === "api";
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
    throw new Error(detail || `API request failed: ${response.status}`);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
