import { apiClient } from "./apiClient";
import type { SalesOrderHeader, SalesOrderLine } from "../features/sales-order/types";

export interface SalesOrderDto {
  Header: SalesOrderHeader;
  Lines: SalesOrderLine[];
}

export interface UpsertSalesOrderRequest {
  Header: SalesOrderHeader;
  Lines: SalesOrderLine[];
}

export function getSalesOrders() {
  return apiClient<SalesOrderDto[]>("/api/sales-orders");
}

export function getSalesOrder(companyCode: string, salesOrderNo: string) {
  return apiClient<SalesOrderDto>(`/api/sales-orders/${encodeURIComponent(companyCode)}/${encodeURIComponent(salesOrderNo)}`);
}

export function createSalesOrder(request: UpsertSalesOrderRequest) {
  return apiClient<SalesOrderDto>("/api/sales-orders", { method: "POST", body: JSON.stringify(request) });
}

export function updateSalesOrder(companyCode: string, salesOrderNo: string, request: UpsertSalesOrderRequest) {
  return apiClient<SalesOrderDto>(`/api/sales-orders/${encodeURIComponent(companyCode)}/${encodeURIComponent(salesOrderNo)}`, {
    method: "PUT",
    body: JSON.stringify(request)
  });
}

export function deleteSalesOrder(companyCode: string, salesOrderNo: string) {
  return apiClient<void>(`/api/sales-orders/${encodeURIComponent(companyCode)}/${encodeURIComponent(salesOrderNo)}`, {
    method: "DELETE"
  });
}
