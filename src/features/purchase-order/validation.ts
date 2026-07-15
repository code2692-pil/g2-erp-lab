import { isValidDate, validateFields, type FieldValidationRule, type ValidationIssue } from "../../components/common/validation/validation";
import type { PurchaseOrderHeader, PurchaseOrderLine } from "./types";
import { createPurchaseOrderHeaderKey, createPurchaseOrderLineKey } from "./utils";

const headerRules: readonly FieldValidationRule<PurchaseOrderHeader>[] = [
  { field: "CD_FIRM", label: "회사코드", required: true },
  { field: "DT_PO", label: "발주일자", required: true, validate: (value) => isValidDate(String(value)) ? undefined : "발주일자가 올바르지 않습니다." },
  { field: "CD_PARTNER", label: "거래처코드", required: true }
];

const lineRules: readonly FieldValidationRule<PurchaseOrderLine>[] = [
  { field: "CD_ITEM", label: "품목코드", required: true, validate: (value, row) => !String(value).trim() || (row.NM_ITEM && row.STND_ITEM && row.UNIT_ITEM) ? undefined : "품목 정보가 일치하지 않습니다." },
  { field: "QT_PO", label: "수량", required: true, validate: (value) => Number(value) > 0 ? undefined : "수량은 0보다 커야 합니다." },
  { field: "UM_PO", label: "단가", required: true, validate: (value) => Number(value) >= 0 ? undefined : "단가는 0 이상이어야 합니다." },
  { field: "DT_DLV", label: "납기일자", required: true, validate: (value) => isValidDate(String(value)) ? undefined : "납기일자가 올바르지 않습니다." },
  { field: "CD_WH", label: "창고코드", required: true, validate: (value, row) => !String(value).trim() || row.NM_WH.trim() ? undefined : "창고 정보가 일치하지 않습니다." }
];

export function validatePurchaseOrders(headers: readonly PurchaseOrderHeader[], lines: readonly PurchaseOrderLine[]) {
  const issues: ValidationIssue[] = [];
  for (const header of headers) {
    issues.push(...validateFields(header, headerRules, { scope: "header", rowKey: createPurchaseOrderHeaderKey(header.CD_FIRM, header.NO_PO) }));
    if (!lines.some((line) => line.NO_PO === header.NO_PO)) issues.push({ scope: "header", rowKey: createPurchaseOrderHeaderKey(header.CD_FIRM, header.NO_PO), field: "NO_PO", message: "발주 상세는 최소 1건 필요합니다." });
  }
  const lineKeys = new Set<string>();
  for (const line of lines) {
    const rowKey = createPurchaseOrderLineKey(line.CD_FIRM, line.NO_PO, line.NO_LINE);
    issues.push(...validateFields(line, lineRules, { scope: "line", rowKey }));
    if (!lineKeys.add(rowKey)) issues.push({ scope: "line", rowKey, field: "NO_LINE", message: "상세행 번호가 중복되었습니다." });
    if (!headers.some((header) => header.CD_FIRM === line.CD_FIRM && header.NO_PO === line.NO_PO)) issues.push({ scope: "line", rowKey, field: "NO_PO", message: "Header와 Line 키가 일치하지 않습니다." });
  }
  return issues;
}
