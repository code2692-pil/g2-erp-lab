import { isApiMode } from "../../api/apiClient";
import {
  createSalesOrder,
  deleteSalesOrder,
  getSalesOrders,
  updateSalesOrder,
  type SalesOrderDto
} from "../../api/salesOrderApi";
import { mockSalesOrderHeaders, mockSalesOrderLines } from "./mockData";
import type { SalesOrderHeader, SalesOrderLine } from "./types";
import { allocateMockDocumentNumber } from "../../utils/documentNumber";

let mockSalesOrderRecords: SalesOrderDto[] = mockSalesOrderHeaders.map((header) => ({
  Header: { ...header },
  Lines: mockSalesOrderLines
    .filter((line) => line.CD_FIRM === header.CD_FIRM && line.NO_SO === header.NO_SO)
    .map((line) => ({ ...line }))
}));

function cloneRecord(record: SalesOrderDto): SalesOrderDto {
  return {
    Header: { ...record.Header },
    Lines: record.Lines.map((line) => ({ ...line }))
  };
}

export async function loadSalesOrderRecords(signal?: AbortSignal) {
  const records = isApiMode() ? await getSalesOrders(signal) : mockSalesOrderRecords;
  return records.map(cloneRecord);
}

export async function saveSalesOrderRecord(
  record: SalesOrderDto,
  previousSalesOrderNo: string | null
) {
  if (isApiMode()) {
    return previousSalesOrderNo === null
      ? createSalesOrder(record)
      : updateSalesOrder(record.Header.CD_FIRM, previousSalesOrderNo, record);
  }

  const saved = cloneRecord(record);
  if (previousSalesOrderNo === null && saved.Header.NO_SO.startsWith("TEMP_SO_")) {
    const savedNumber = allocateMockDocumentNumber(
      "SOR",
      saved.Header.CD_FIRM,
      saved.Header.DT_SO,
      mockSalesOrderRecords.map((current) => current.Header.NO_SO)
    );
    saved.Header.NO_SO = savedNumber;
    saved.Lines = saved.Lines.map((line) => ({ ...line, NO_SO: savedNumber }));
  }
  const targetNo = previousSalesOrderNo ?? saved.Header.NO_SO;
  mockSalesOrderRecords = [
    saved,
    ...mockSalesOrderRecords.filter(
      (current) =>
        current.Header.CD_FIRM !== saved.Header.CD_FIRM ||
        current.Header.NO_SO !== targetNo
    )
  ];
  return cloneRecord(saved);
}

export async function deleteSalesOrderRecord(companyCode: string, salesOrderNo: string) {
  if (isApiMode()) {
    await deleteSalesOrder(companyCode, salesOrderNo);
    return;
  }
  mockSalesOrderRecords = mockSalesOrderRecords.filter(
    (record) =>
      record.Header.CD_FIRM !== companyCode || record.Header.NO_SO !== salesOrderNo
  );
}

export function replaceMockSalesOrderRecords(
  headers: readonly SalesOrderHeader[],
  lines: readonly SalesOrderLine[]
) {
  if (isApiMode()) return;
  mockSalesOrderRecords = headers.map((header) => ({
    Header: { ...header },
    Lines: lines
      .filter((line) => line.CD_FIRM === header.CD_FIRM && line.NO_SO === header.NO_SO)
      .map((line) => ({ ...line }))
  }));
}
