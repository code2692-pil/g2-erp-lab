import type { SalesOrderLine } from "./types";

export interface SalesOrderLineAmounts {
  AM_SUPPLY: number;
  AM_VAT: number;
  AM_TOTAL: number;
}

export interface SalesOrderLineTotals extends SalesOrderLineAmounts {
  QT_SO: number;
}

export function roundCurrency(amount: number) {
  return Math.round(amount);
}

export function calculateSalesOrderLineAmounts(
  quantity: number,
  unitPrice: number
): SalesOrderLineAmounts {
  const supply = roundCurrency(quantity * unitPrice);
  const vat = roundCurrency(supply * 0.1);

  return {
    AM_SUPPLY: supply,
    AM_VAT: vat,
    AM_TOTAL: supply + vat
  };
}

export function calculateSalesOrderLineTotals(
  lines: readonly Pick<SalesOrderLine, "QT_SO" | "AM_SUPPLY" | "AM_VAT" | "AM_TOTAL">[]
): SalesOrderLineTotals {
  return lines.reduce(
    (totals, line) => ({
      QT_SO: totals.QT_SO + line.QT_SO,
      AM_SUPPLY: totals.AM_SUPPLY + line.AM_SUPPLY,
      AM_VAT: totals.AM_VAT + line.AM_VAT,
      AM_TOTAL: totals.AM_TOTAL + line.AM_TOTAL
    }),
    { QT_SO: 0, AM_SUPPLY: 0, AM_VAT: 0, AM_TOTAL: 0 }
  );
}

export function createSalesOrderHeaderKey(cdFirm: string, noSo: string) {
  return `${cdFirm}::${noSo}`;
}

export function createSalesOrderLineKey(cdFirm: string, noSo: string, noLine: number) {
  return `${cdFirm}::${noSo}::${noLine}`;
}
