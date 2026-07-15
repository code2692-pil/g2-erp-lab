import type { PurchaseOrderLine } from "./types";

export interface PurchaseOrderAmounts {
  AM_SUPPLY: number;
  AM_VAT: number;
  AM_TOTAL: number;
}

export function calculatePurchaseOrderLineAmounts(quantity: number, unitPrice: number): PurchaseOrderAmounts {
  const supply = Math.round(quantity * unitPrice);
  const vat = Math.round(supply * 0.1);
  return { AM_SUPPLY: supply, AM_VAT: vat, AM_TOTAL: supply + vat };
}

export function calculatePurchaseOrderTotals(lines: readonly PurchaseOrderLine[]) {
  return lines.reduce(
    (totals, line) => ({
      QT_PO: totals.QT_PO + line.QT_PO,
      AM_SUPPLY: totals.AM_SUPPLY + line.AM_SUPPLY,
      AM_VAT: totals.AM_VAT + line.AM_VAT,
      AM_TOTAL: totals.AM_TOTAL + line.AM_TOTAL
    }),
    { QT_PO: 0, AM_SUPPLY: 0, AM_VAT: 0, AM_TOTAL: 0 }
  );
}

export function createPurchaseOrderHeaderKey(companyCode: string, purchaseOrderNo: string) {
  return `${companyCode}::${purchaseOrderNo}`;
}

export function createPurchaseOrderLineKey(companyCode: string, purchaseOrderNo: string, lineNo: number) {
  return `${companyCode}::${purchaseOrderNo}::${lineNo}`;
}
