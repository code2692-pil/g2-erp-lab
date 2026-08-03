import { apiClient } from "./apiClient";

export interface PurchaseConversionLineRequest {
  SourceLineNo: number;
  Quantity: number;
  UnitPrice: number;
  DueDate: string;
}

export interface PurchaseConversionRequest {
  RequestKey: string;
  CompanyCode: string;
  SalesOrderNo: string;
  PurchaseOrderDate: string;
  SupplierCode: string;
  WarehouseCode: string;
  CurrencyCode: string;
  EmployeeCode: string;
  Lines: PurchaseConversionLineRequest[];
}

export interface WorkOrderConversionRequest {
  RequestKey: string;
  CompanyCode: string;
  SalesOrderNo: string;
  SourceLineNo: number;
  Quantity: number;
  WorkOrderDate: string;
  PlannedStart: string;
  PlannedEnd: string;
  ProductionLineCode: string;
  BomVersion: string;
  RoutingVersion: string;
}

export interface ConversionLineResult {
  SourceHeaderId: string;
  SourceLineId: string;
  SourceLineNo: number;
  ConvertedQuantity: number;
  RemainingQuantity: number;
}

export interface PurchaseConversionResult {
  RequestId: string;
  PurchaseOrderId: string;
  PurchaseOrderNo: string;
  Lines: ConversionLineResult[];
  IdempotentReplay: boolean;
}

export interface WorkOrderOperationResult {
  OperationId: string;
  Sequence: number;
  ProcessCode: string;
  ProcessName: string;
  WorkCenterCode: string;
  WorkCenterName: string;
  PlannedQuantity: number;
}

export interface WorkOrderBillResult {
  BillLineId: string;
  BomLineNo: number;
  ComponentCode: string;
  ComponentName: string;
  Unit: string;
  BaseQuantity: number;
  RequiredQuantity: number;
}

export interface WorkOrderConversionResult {
  RequestId: string;
  WorkOrderId: string;
  WorkOrderNo: string;
  Source: ConversionLineResult;
  Operations: WorkOrderOperationResult[];
  Bills: WorkOrderBillResult[];
  IdempotentReplay: boolean;
}

export interface SalesConversionMasterPreview {
  ItemCode: string;
  BomVersion: string;
  RoutingVersion: string;
  Bills: Array<{
    LineNo: number;
    ComponentCode: string;
    ComponentName: string;
    Unit: string;
    BaseQuantity: number;
  }>;
  Operations: Array<{
    Sequence: number;
    ProcessCode: string;
    ProcessName: string;
    WorkCenterCode: string;
    WorkCenterName: string;
    BaseMinutes: number;
  }>;
}

export function createPurchaseFromSales(request: PurchaseConversionRequest) {
  return apiClient<PurchaseConversionResult>("/api/sales-conversions/purchase-orders", {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function createWorkOrderFromSales(request: WorkOrderConversionRequest) {
  return apiClient<WorkOrderConversionResult>("/api/sales-conversions/work-orders", {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function getWorkOrderConversionPreview(
  companyCode: string,
  salesOrderNo: string,
  sourceLineNo: number,
  bomVersion: string,
  routingVersion: string
) {
  const query = new URLSearchParams({
    companyCode,
    salesOrderNo,
    sourceLineNo: String(sourceLineNo),
    bomVersion,
    routingVersion
  });
  return apiClient<SalesConversionMasterPreview>(`/api/sales-conversions/work-order-preview?${query}`);
}
