import { isApiMode } from "../../api/apiClient";
import {
  createPurchaseFromSales,
  createWorkOrderFromSales,
  getWorkOrderConversionPreview,
  type PurchaseConversionRequest,
  type PurchaseConversionResult,
  type SalesConversionMasterPreview,
  type WorkOrderConversionRequest,
  type WorkOrderConversionResult
} from "../../api/salesConversionApi";
import { allocateMockDocumentNumber } from "../../utils/documentNumber";
import { mockPartners } from "../common-code/partner/mockData";
import { mockWarehouses } from "../common-code/warehouse/mockData";
import { mockPurchaseOrderHeaders } from "../purchase-order/mockData";
import { mockWorkOrderHeaders } from "../work-order/mockData";
import type { SalesOrderLine } from "./types";

const purchaseRequests = new Map<string, PurchaseConversionResult>();
const workOrderRequests = new Map<string, WorkOrderConversionResult>();
const convertedQuantities = new Map<string, number>();
const generatedPurchaseNumbers: string[] = [];
const generatedWorkOrderNumbers: string[] = [];

const mockPreview: SalesConversionMasterPreview = {
  ItemCode: "ITM-1001",
  BomVersion: "FINAL-UAT-1",
  RoutingVersion: "FINAL-UAT-1",
  Bills: [
    { LineNo: 10, ComponentCode: "ITM-2102", ComponentName: "알루미늄 하우징", Unit: "EA", BaseQuantity: 1 },
    { LineNo: 20, ComponentCode: "ITM-1204", ComponentName: "모터 드라이브 PCB", Unit: "EA", BaseQuantity: 1 },
    { LineNo: 30, ComponentCode: "ITM-1410", ComponentName: "정밀 베어링", Unit: "EA", BaseQuantity: 1 },
    { LineNo: 40, ComponentCode: "ITM-1600", ComponentName: "체결부품 세트", Unit: "SET", BaseQuantity: 1 },
    { LineNo: 50, ComponentCode: "ITM-3100", ComponentName: "포장재", Unit: "SET", BaseQuantity: 1 }
  ],
  Operations: [
    { Sequence: 10, ProcessCode: "PROC-010", ProcessName: "가공", WorkCenterCode: "LINE-A", WorkCenterName: "가공 작업장", BaseMinutes: 10 },
    { Sequence: 20, ProcessCode: "PROC-020", ProcessName: "조립", WorkCenterCode: "LINE-A", WorkCenterName: "조립 작업장", BaseMinutes: 30 },
    { Sequence: 30, ProcessCode: "PROC-030", ProcessName: "전기검사", WorkCenterCode: "LINE-C", WorkCenterName: "검사 작업장", BaseMinutes: 15 },
    { Sequence: 40, ProcessCode: "PROC-040", ProcessName: "최종검사", WorkCenterCode: "LINE-C", WorkCenterName: "검사 작업장", BaseMinutes: 15 },
    { Sequence: 50, ProcessCode: "PROC-050", ProcessName: "포장", WorkCenterCode: "LINE-D", WorkCenterName: "포장 작업장", BaseMinutes: 10 }
  ]
};

function requestIdentity(type: "POR" | "WMO", companyCode: string, requestKey: string) {
  return `${type}:${companyCode}:${requestKey}`;
}

function sourceIdentity(type: "POR" | "WMO", companyCode: string, salesOrderNo: string, lineNo: number) {
  return `${type}:${companyCode}:${salesOrderNo}:${lineNo}`;
}

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function convertSalesToPurchase(
  request: PurchaseConversionRequest,
  sourceLines: readonly SalesOrderLine[],
  customerCode: string
) {
  if (isApiMode()) return createPurchaseFromSales(request);

  const identity = requestIdentity("POR", request.CompanyCode, request.RequestKey);
  const replay = purchaseRequests.get(identity);
  if (replay) return { ...replay, IdempotentReplay: true };
  if (request.SupplierCode === customerCode) throw new Error("고객을 공급처로 사용할 수 없습니다. 공급처를 다시 선택해 주세요.");
  if (!mockPartners.some((partner) => partner.CD_FIRM === request.CompanyCode && partner.CD_PARTNER === request.SupplierCode && partner.YN_USE === "Y")) throw new Error("선택한 공급처를 찾을 수 없습니다.");
  if (!mockWarehouses.some((warehouse) => warehouse.CD_FIRM === request.CompanyCode && warehouse.CD_WH === request.WarehouseCode && warehouse.YN_USE === "Y")) throw new Error("선택한 창고를 찾을 수 없습니다.");

  const results = request.Lines.map((requested) => {
    const source = sourceLines.find((line) => line.NO_LINE === requested.SourceLineNo);
    if (!source) throw new Error(`수주상세 ${requested.SourceLineNo}행을 찾을 수 없습니다.`);
    const sourceKey = sourceIdentity("POR", request.CompanyCode, request.SalesOrderNo, requested.SourceLineNo);
    const alreadyConverted = convertedQuantities.get(sourceKey) ?? 0;
    const remaining = source.QT_SO - alreadyConverted;
    if (requested.Quantity <= 0 || requested.Quantity > remaining) throw new Error(`수주상세 ${requested.SourceLineNo}행의 발주 가능 잔량은 ${remaining}입니다.`);
    return {
      SourceHeaderId: newId(),
      SourceLineId: newId(),
      SourceLineNo: requested.SourceLineNo,
      ConvertedQuantity: requested.Quantity,
      RemainingQuantity: remaining - requested.Quantity,
      sourceKey
    };
  });
  const number = allocateMockDocumentNumber(
    "POR",
    request.CompanyCode,
    request.PurchaseOrderDate,
    [...mockPurchaseOrderHeaders.map((header) => header.NO_PO), ...generatedPurchaseNumbers]
  );
  generatedPurchaseNumbers.push(number);
  results.forEach((line) => convertedQuantities.set(line.sourceKey, (convertedQuantities.get(line.sourceKey) ?? 0) + line.ConvertedQuantity));
  const result: PurchaseConversionResult = {
    RequestId: newId(),
    PurchaseOrderId: newId(),
    PurchaseOrderNo: number,
    Lines: results.map(({ sourceKey: _sourceKey, ...line }) => line),
    IdempotentReplay: false
  };
  purchaseRequests.set(identity, result);
  return result;
}

export async function loadWorkOrderConversionPreview(
  companyCode: string,
  salesOrderNo: string,
  sourceLineNo: number,
  itemCode: string,
  bomVersion: string,
  routingVersion: string
) {
  if (isApiMode()) return getWorkOrderConversionPreview(companyCode, salesOrderNo, sourceLineNo, bomVersion, routingVersion);
  if (itemCode !== mockPreview.ItemCode || bomVersion !== mockPreview.BomVersion) throw new Error(`품목 ${itemCode}의 승인된 BOM 버전 ${bomVersion}을 찾을 수 없습니다.`);
  if (routingVersion !== mockPreview.RoutingVersion) throw new Error(`품목 ${itemCode}의 승인된 공정경로 버전 ${routingVersion}을 찾을 수 없습니다.`);
  return mockPreview;
}

export async function convertSalesToWorkOrder(
  request: WorkOrderConversionRequest,
  sourceLine: SalesOrderLine
) {
  if (isApiMode()) return createWorkOrderFromSales(request);

  const identity = requestIdentity("WMO", request.CompanyCode, request.RequestKey);
  const replay = workOrderRequests.get(identity);
  if (replay) return { ...replay, IdempotentReplay: true };
  const preview = await loadWorkOrderConversionPreview(request.CompanyCode, request.SalesOrderNo, request.SourceLineNo, sourceLine.CD_ITEM, request.BomVersion, request.RoutingVersion);
  const sourceKey = sourceIdentity("WMO", request.CompanyCode, request.SalesOrderNo, request.SourceLineNo);
  const alreadyConverted = convertedQuantities.get(sourceKey) ?? 0;
  const remaining = sourceLine.QT_SO - alreadyConverted;
  if (request.Quantity <= 0 || request.Quantity > remaining) throw new Error(`수주상세 ${request.SourceLineNo}행의 작업지시 가능 잔량은 ${remaining}입니다.`);
  const number = allocateMockDocumentNumber(
    "WMO",
    request.CompanyCode,
    request.WorkOrderDate,
    [...mockWorkOrderHeaders.map((header) => header.NO_WO), ...generatedWorkOrderNumbers]
  );
  generatedWorkOrderNumbers.push(number);
  convertedQuantities.set(sourceKey, alreadyConverted + request.Quantity);
  const result: WorkOrderConversionResult = {
    RequestId: newId(),
    WorkOrderId: newId(),
    WorkOrderNo: number,
    Source: { SourceHeaderId: newId(), SourceLineId: newId(), SourceLineNo: request.SourceLineNo, ConvertedQuantity: request.Quantity, RemainingQuantity: remaining - request.Quantity },
    Operations: preview.Operations.map((operation) => ({ OperationId: newId(), ...operation, PlannedQuantity: request.Quantity })),
    Bills: preview.Bills.map((bill) => ({ BillLineId: newId(), BomLineNo: bill.LineNo, ComponentCode: bill.ComponentCode, ComponentName: bill.ComponentName, Unit: bill.Unit, BaseQuantity: bill.BaseQuantity, RequiredQuantity: bill.BaseQuantity * request.Quantity })),
    IdempotentReplay: false
  };
  workOrderRequests.set(identity, result);
  return result;
}
