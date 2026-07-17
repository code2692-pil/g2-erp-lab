import { apiClient } from "./apiClient";
import type { WorkOrderHeader, WorkOrderProcess } from "../features/work-order/types";
import type { Equipment } from "../features/common-code/equipment/types";
import type { ProductionLine } from "../features/common-code/production-line/types";
import type { ProductionProcess } from "../features/common-code/process/types";

export interface WorkOrderDetailDto {
  Header: WorkOrderHeader;
  Processes: WorkOrderProcess[];
  Warnings: string[];
}

export interface WorkOrderSearchParams {
  companyCode?: string;
  dateFrom?: string;
  dateTo?: string;
  workOrderNo?: string;
  item?: string;
  productionLine?: string;
  status?: string;
  urgent?: string;
}

function toQuery(filters: object) {
  const query = new URLSearchParams(Object.entries(filters).filter((entry): entry is [string, string] => typeof entry[1] === "string" && Boolean(entry[1])));
  return query.toString();
}

export function searchWorkOrders(filters: WorkOrderSearchParams) {
  const query = toQuery(filters);
  return apiClient<WorkOrderDetailDto[]>(`/api/work-orders${query ? `?${query}` : ""}`);
}

export function getWorkOrder(companyCode: string, workOrderNo: string) {
  return apiClient<WorkOrderDetailDto>(`/api/work-orders/${encodeURIComponent(companyCode)}/${encodeURIComponent(workOrderNo)}`);
}

export function createWorkOrder(request: Pick<WorkOrderDetailDto, "Header" | "Processes">) {
  return apiClient<WorkOrderDetailDto>("/api/work-orders", { method: "POST", body: JSON.stringify(request) });
}

export function updateWorkOrder(companyCode: string, workOrderNo: string, request: Pick<WorkOrderDetailDto, "Header" | "Processes">) {
  return apiClient<WorkOrderDetailDto>(`/api/work-orders/${encodeURIComponent(companyCode)}/${encodeURIComponent(workOrderNo)}`, { method: "PUT", body: JSON.stringify(request) });
}

export function deleteWorkOrder(companyCode: string, workOrderNo: string) {
  return apiClient<void>(`/api/work-orders/${encodeURIComponent(companyCode)}/${encodeURIComponent(workOrderNo)}`, { method: "DELETE" });
}

export function getProductionLines(filters: { companyCode?: string; useYn?: string; keyword?: string } = {}) {
  const query = toQuery(filters);
  return apiClient<ProductionLine[]>(`/api/production-lines${query ? `?${query}` : ""}`);
}

export function getProcesses(filters: { companyCode?: string; useYn?: string; keyword?: string } = {}) {
  const query = toQuery(filters);
  return apiClient<ProductionProcess[]>(`/api/processes${query ? `?${query}` : ""}`);
}

export function getEquipment(filters: { companyCode?: string; lineCode?: string; useYn?: string; keyword?: string } = {}) {
  const query = toQuery(filters);
  return apiClient<Equipment[]>(`/api/equipment${query ? `?${query}` : ""}`);
}
