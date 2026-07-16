import {
  isValidDate,
  validateFields,
  type FieldValidationRule,
  type ValidationIssue
} from "../../components/common/validation/validation";
import type { SalesOrderHeader, SalesOrderLine } from "./types";
import { createSalesOrderHeaderKey, createSalesOrderLineKey } from "./utils";

const headerRules: readonly FieldValidationRule<SalesOrderHeader>[] = [
  { field: "CD_FIRM", label: "회사코드", required: true },
  {
    field: "DT_SO",
    label: "수주일자",
    required: true,
    validate: (value) => (isValidDate(String(value)) ? undefined : "수주일자는 유효한 날짜여야 합니다.")
  },
  {
    field: "CD_PARTNER",
    label: "거래처코드",
    required: true,
    validate: (value, header) => {
      if (!String(value).trim()) return undefined;
      return header.NM_PARTNER.trim() ? undefined : "거래처코드에 해당하는 거래처명이 필요합니다.";
    }
  }
];

const lineRules: readonly FieldValidationRule<SalesOrderLine>[] = [
  {
    field: "CD_ITEM",
    label: "품목코드",
    required: true,
    validate: (value, line) => {
      if (!String(value).trim()) return undefined;
      return line.NM_ITEM.trim() && line.STND_ITEM.trim() && line.UNIT_ITEM.trim()
        ? undefined
        : "품목코드를 선택하면 품목명, 규격, 단위가 모두 필요합니다.";
    }
  },
  {
    field: "QT_SO",
    label: "수량",
    required: true,
    min: 0,
    validate: (value) => (Number(value) > 0 ? undefined : "수량은 0보다 커야 합니다.")
  },
  { field: "UM_SO", label: "단가", required: true, min: 0 },
  {
    field: "DT_DLV",
    label: "납기일자",
    required: true,
    validate: (value) => (isValidDate(String(value)) ? undefined : "납기일자는 유효한 날짜여야 합니다.")
  }
];

function addDuplicateIssues(
  lines: readonly SalesOrderLine[],
  keyOf: (line: SalesOrderLine) => string,
  field: string,
  message: string
) {
  const groupedLines = new Map<string, SalesOrderLine[]>();
  for (const line of lines) {
    const key = keyOf(line);
    const group = groupedLines.get(key) ?? [];
    group.push(line);
    groupedLines.set(key, group);
  }

  const issues: ValidationIssue[] = [];
  for (const group of groupedLines.values()) {
    if (group.length < 2) continue;
    for (const line of group) {
      issues.push({
        scope: "line",
        rowKey: createSalesOrderLineKey(line.CD_FIRM, line.NO_SO, line.NO_LINE),
        field,
        message
      });
    }
  }
  return issues;
}

export function validateSalesOrders(
  headers: readonly SalesOrderHeader[],
  lines: readonly SalesOrderLine[]
) {
  const headerIssues = headers.flatMap((header) => {
    const rowKey = createSalesOrderHeaderKey(header.CD_FIRM, header.NO_SO);
    const issues = validateFields(header, headerRules, { scope: "header", rowKey });

    if (header.NO_SO.startsWith("TEMP_SO_") && !lines.some((line) => line.NO_SO === header.NO_SO)) {
      issues.push({
        scope: "header",
        rowKey,
        field: "NO_SO",
        message: "신규 수주는 상세행을 최소 1건 등록해야 합니다."
      });
    }
    return issues;
  });

  const lineIssues = lines.flatMap((line) =>
    validateFields(line, lineRules, {
      scope: "line",
      rowKey: createSalesOrderLineKey(line.CD_FIRM, line.NO_SO, line.NO_LINE)
    })
  );

  return [
    ...headerIssues,
    ...lineIssues,
    ...addDuplicateIssues(
      lines,
      (line) => `${line.CD_FIRM}::${line.NO_SO}::${line.NO_LINE}`,
      "NO_LINE",
      "동일 수주 내 행번호(NO_LINE)는 중복될 수 없습니다."
    ),
    ...addDuplicateIssues(
      lines,
      (line) => createSalesOrderLineKey(line.CD_FIRM, line.NO_SO, line.NO_LINE),
      "CD_ITEM",
      "동일 회사코드와 수주번호 안에서 행 키(rowKey)가 중복될 수 없습니다."
    )
  ];
}
