import { apiClient, demoSessionStorageKey, isApiMode, readStoredDemoSessionToken } from "./apiClient";

export type DemoRole = "Viewer" | "Operator" | "Manager" | "Admin";

export interface DemoUser {
  Id: string;
  Name: string;
  Role: DemoRole;
}

export interface DemoSession {
  Token: string;
  User: DemoUser;
  ExpiresAt: string;
}

export interface DemoContext {
  User: DemoUser;
  ExpiresAt: string;
  Environment: string;
  ProductionData: false;
}

export const demoEnvironment = import.meta.env.VITE_DEMO_MODE === "shared" && isApiMode()
  ? "shared"
  : import.meta.env.VITE_DEMO_MODE === "personal" || !isApiMode()
    ? "personal"
    : "development";

export function storedDemoSessionToken() {
  return readStoredDemoSessionToken();
}

export function clearDemoSession() {
  window.sessionStorage.removeItem(demoSessionStorageKey);
}

export const demoApi = {
  users: () => apiClient<DemoUser[]>("/api/demo/users"),
  context: () => apiClient<DemoContext>("/api/demo/context"),
  async createSession(userId: string) {
    const session = await apiClient<DemoSession>("/api/demo/session", {
      method: "POST",
      body: JSON.stringify({ UserId: userId })
    });
    window.sessionStorage.setItem(demoSessionStorageKey, JSON.stringify({ version: 1, token: session.Token }));
    return session;
  },
  reset: () => apiClient<{ Status: string; SeedVersion: string }>("/api/demo/reset", {
    method: "POST",
    body: JSON.stringify({ ConfirmationText: "DEMO RESET" })
  })
};
