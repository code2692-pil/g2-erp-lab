import type { SalesOrderHeader, SalesOrderLine } from "./types";

export function salesOrderToday() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function createTempSalesOrderNo(index: number) {
  return `TEMP_SO_${String(index).padStart(3, "0")}`;
}

export function createSavedSalesOrderNo(yearMonth: string, index: number) {
  return `SO${yearMonth}${String(index).padStart(4, "0")}`;
}

export function getNextSavedSalesOrderIndex(headers: readonly SalesOrderHeader[], yearMonth: string) {
  const numbers = headers
    .map((header) => header.NO_SO.match(new RegExp(`^SO${yearMonth}(\\d{4})$`))?.[1])
    .filter((value): value is string => Boolean(value))
    .map(Number);
  return numbers.length === 0 ? 1 : Math.max(...numbers) + 1;
}

export function createEmptySalesOrderHeader(noSo: string): SalesOrderHeader {
  return {
    CD_FIRM: "1000",
    NO_SO: noSo,
    DT_SO: salesOrderToday(),
    CD_PARTNER: "",
    NM_PARTNER: "",
    CD_EMP: "",
    ST_SO: "신규",
    DC_RMK: ""
  };
}

export function createEmptySalesOrderLine(header: SalesOrderHeader, noLine: number): SalesOrderLine {
  return {
    CD_FIRM: header.CD_FIRM,
    NO_SO: header.NO_SO,
    NO_LINE: noLine,
    CD_ITEM: "",
    NM_ITEM: "",
    STND_ITEM: "",
    UNIT_ITEM: "",
    QT_SO: 0,
    UM_SO: 0,
    AM_SUPPLY: 0,
    AM_VAT: 0,
    AM_TOTAL: 0,
    DT_DLV: salesOrderToday(),
    DC_RMK: ""
  };
}
