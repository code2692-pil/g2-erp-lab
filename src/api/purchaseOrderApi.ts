import { apiClient } from "./apiClient";
import type { PurchaseOrderHeader, PurchaseOrderLine } from "../features/purchase-order/types";

export interface PurchaseOrderDto { Header: PurchaseOrderHeader; Lines: PurchaseOrderLine[]; }
export interface UpsertPurchaseOrderRequest { Header: PurchaseOrderHeader; Lines: PurchaseOrderLine[]; }

export function getPurchaseOrders() { return apiClient<PurchaseOrderDto[]>("/api/purchase-orders"); }
export function getPurchaseOrder(companyCode: string, purchaseOrderNo: string) {
  return apiClient<PurchaseOrderDto>(`/api/purchase-orders/${encodeURIComponent(companyCode)}/${encodeURIComponent(purchaseOrderNo)}`);
}
export function createPurchaseOrder(request: UpsertPurchaseOrderRequest) {
  return apiClient<PurchaseOrderDto>("/api/purchase-orders", { method: "POST", body: JSON.stringify(request) });
}
export function updatePurchaseOrder(companyCode: string, purchaseOrderNo: string, request: UpsertPurchaseOrderRequest) {
  return apiClient<PurchaseOrderDto>(`/api/purchase-orders/${encodeURIComponent(companyCode)}/${encodeURIComponent(purchaseOrderNo)}`, { method: "PUT", body: JSON.stringify(request) });
}
export function deletePurchaseOrder(companyCode: string, purchaseOrderNo: string) {
  return apiClient<void>(`/api/purchase-orders/${encodeURIComponent(companyCode)}/${encodeURIComponent(purchaseOrderNo)}`, { method: "DELETE" });
}
