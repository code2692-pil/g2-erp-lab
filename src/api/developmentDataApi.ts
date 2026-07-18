import { apiClient, isApiMode } from "./apiClient";

export type DevelopmentScope = "production-masters" | "sales-orders" | "purchase-orders" | "work-orders" | "all";

export interface DevelopmentEnvironment {
  Environment: string;
  RepositoryMode: string;
  Server: string;
  Database: string;
  IsLocal: boolean;
  IsAllowed: boolean;
  SafetyStatus: string;
  Message: string;
  GeneratedAt: string;
}

export interface DevelopmentSummary {
  Environment: DevelopmentEnvironment;
  SampleItems: number;
  SampleProductionLines: number;
  SampleProcesses: number;
  SampleEquipment: number;
  SampleSalesOrders: number;
  SampleSalesOrderLines: number;
  SamplePurchaseOrders: number;
  SamplePurchaseOrderLines: number;
  SampleWorkOrders: number;
  SampleWorkOrderProcesses: number;
  E2ERemnantRows: number;
  Status: string;
}

export interface DevelopmentPreview {
  Scope: DevelopmentScope;
  Environment: DevelopmentEnvironment;
  ExistingRows: number;
  NewRows: number;
  ConflictRows: number;
  Conflicts: string[];
  AffectedTables: string[];
  DeletesData: boolean;
}

export interface DevelopmentOperation {
  Operation: string;
  Scope: DevelopmentScope;
  Status: string;
  CreatedRows: number;
  DeletedRows: number;
  SkippedRows: number;
  ConflictRows: number;
  Message: string;
  ExecutedAt: string;
}

export interface DevelopmentE2ERemnants {
  TotalRows: number;
  Rows: { Table: string; Key: string; Prefix: string }[];
}

const now = () => new Date().toISOString();
const localEnvironment = (): DevelopmentEnvironment => ({
  Environment: "Development",
  RepositoryMode: "Mock",
  Server: "Browser mock",
  Database: "Not connected",
  IsLocal: true,
  IsAllowed: true,
  SafetyStatus: "Allowed",
  Message: "Mock mode uses browser-only data and does not access a database.",
  GeneratedAt: now()
});

let mockCounts = {
  SampleItems: 0, SampleProductionLines: 0, SampleProcesses: 0, SampleEquipment: 0,
  SampleSalesOrders: 0, SampleSalesOrderLines: 0, SamplePurchaseOrders: 0,
  SamplePurchaseOrderLines: 0, SampleWorkOrders: 0, SampleWorkOrderProcesses: 0
};

const plannedCounts = {
  SampleItems: 6, SampleProductionLines: 3, SampleProcesses: 8, SampleEquipment: 8,
  SampleSalesOrders: 6, SampleSalesOrderLines: 13, SamplePurchaseOrders: 6,
  SamplePurchaseOrderLines: 13, SampleWorkOrders: 6, SampleWorkOrderProcesses: 18
};

function scopes(scope: DevelopmentScope) {
  if (scope === "all") return Object.keys(plannedCounts) as (keyof typeof plannedCounts)[];
  if (scope === "production-masters") return ["SampleItems", "SampleProductionLines", "SampleProcesses", "SampleEquipment"] as const;
  if (scope === "sales-orders") return ["SampleSalesOrders", "SampleSalesOrderLines"] as const;
  if (scope === "purchase-orders") return ["SamplePurchaseOrders", "SamplePurchaseOrderLines"] as const;
  return ["SampleWorkOrders", "SampleWorkOrderProcesses"] as const;
}

function mockSummary(): DevelopmentSummary {
  return { Environment: localEnvironment(), ...mockCounts, E2ERemnantRows: 0, Status: "Healthy" };
}

async function post<T>(path: string, body?: unknown) {
  return apiClient<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
}

export const developmentDataApi = {
  async status(): Promise<DevelopmentEnvironment> {
    return isApiMode() ? apiClient<DevelopmentEnvironment>("/api/development-data/status") : localEnvironment();
  },
  async summary(): Promise<DevelopmentSummary> {
    return isApiMode() ? apiClient<DevelopmentSummary>("/api/development-data/summary") : mockSummary();
  },
  async preview(scope: DevelopmentScope): Promise<DevelopmentPreview> {
    if (isApiMode()) return post<DevelopmentPreview>("/api/development-data/preview", { Scope: scope });
    const keys = scopes(scope);
    const existing = keys.reduce((total, key) => total + mockCounts[key], 0);
    const next = keys.reduce((total, key) => total + (plannedCounts[key] - mockCounts[key]), 0);
    return { Scope: scope, Environment: localEnvironment(), ExistingRows: existing, NewRows: next, ConflictRows: 0, Conflicts: [], AffectedTables: ["Browser mock data"], DeletesData: false };
  },
  async seed(scope: DevelopmentScope): Promise<DevelopmentOperation> {
    if (isApiMode()) return post<DevelopmentOperation>(`/api/development-data/seed/${scope}`);
    const keys = scopes(scope); const created = keys.reduce((total, key) => total + (plannedCounts[key] - mockCounts[key]), 0);
    keys.forEach((key) => { mockCounts[key] = plannedCounts[key]; });
    return { Operation: "seed", Scope: scope, Status: "Success", CreatedRows: created, DeletedRows: 0, SkippedRows: 0, ConflictRows: 0, Message: created ? "Mock Sample data created." : "Matching Mock Sample data already exists.", ExecutedAt: now() };
  },
  async cleanup(scope: DevelopmentScope, confirmationText: string): Promise<DevelopmentOperation> {
    if (isApiMode()) return post<DevelopmentOperation>("/api/development-data/cleanup/samples", { Scope: scope, ConfirmationText: confirmationText });
    if (confirmationText !== "SAMPLE DELETE") return { Operation: "cleanup", Scope: scope, Status: "Blocked", CreatedRows: 0, DeletedRows: 0, SkippedRows: 0, ConflictRows: 0, Message: "Enter SAMPLE DELETE exactly to run cleanup.", ExecutedAt: now() };
    const keys = scopes(scope); const deleted = keys.reduce((total, key) => total + mockCounts[key], 0);
    keys.forEach((key) => { mockCounts[key] = 0; });
    return { Operation: "cleanup", Scope: scope, Status: "Success", CreatedRows: 0, DeletedRows: deleted, SkippedRows: 0, ConflictRows: 0, Message: "Mock Sample data was cleared.", ExecutedAt: now() };
  },
  async e2eRemnants(): Promise<DevelopmentE2ERemnants> {
    return isApiMode() ? apiClient<DevelopmentE2ERemnants>("/api/development-data/e2e-remnants") : { TotalRows: 0, Rows: [] };
  }
};

export function canShowDevelopmentDataManagerClient() {
  return import.meta.env.DEV && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
}
