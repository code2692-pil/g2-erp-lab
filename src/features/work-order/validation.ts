import {
  isValidDate,
  validateFields,
  type FieldValidationRule,
  type ValidationIssue
} from "../../components/common/validation/validation";
import type { WorkOrderHeader, WorkOrderProcess } from "./types";
import { createWorkOrderHeaderKey, createWorkOrderProcessKey } from "./utils";

const headerRules: readonly FieldValidationRule<WorkOrderHeader>[] = [
  { field: "CD_FIRM", label: "회사코드", required: true },
  { field: "DT_WO", label: "지시일자", required: true, validate: (value) => isValidDate(String(value)) ? undefined : "지시일자는 유효한 날짜여야 합니다." },
  { field: "CD_ITEM", label: "생산품목코드", required: true, validate: (value, row) => !String(value).trim() || (row.NM_ITEM.trim() && row.STND_ITEM.trim() && row.UNIT_ITEM.trim()) ? undefined : "생산품목코드에 해당하는 품목명, 규격, 단위가 필요합니다." },
  { field: "QT_WO", label: "지시수량", required: true, validate: (value) => Number(value) > 0 ? undefined : "지시수량은 0보다 커야 합니다." },
  { field: "QT_RESULT", label: "실적수량", required: true, min: 0 },
  { field: "DT_PLAN_START", label: "계획시작일", required: true, validate: (value) => isValidDate(String(value)) ? undefined : "계획시작일은 유효한 날짜여야 합니다." },
  { field: "DT_PLAN_END", label: "계획종료일", required: true, validate: (value) => isValidDate(String(value)) ? undefined : "계획종료일은 유효한 날짜여야 합니다." },
  { field: "CD_LINE", label: "생산라인코드", required: true, validate: (value, row) => !String(value).trim() || row.NM_LINE.trim() ? undefined : "생산라인코드에 해당하는 생산라인명이 필요합니다." }
];

const processRules: readonly FieldValidationRule<WorkOrderProcess>[] = [
  { field: "CD_PROC", label: "공정코드", required: true, validate: (value, row) => !String(value).trim() || row.NM_PROC.trim() ? undefined : "공정코드에 해당하는 공정명이 필요합니다." },
  { field: "QT_PLAN", label: "계획수량", required: true, validate: (value) => Number(value) > 0 ? undefined : "계획수량은 0보다 커야 합니다." },
  { field: "QT_RESULT", label: "공정 실적수량", required: true, min: 0 },
  { field: "TM_PLAN_START", label: "공정 계획시작일시", required: true },
  { field: "TM_PLAN_END", label: "공정 계획종료일시", required: true }
];

function addDuplicateIssues<T>(
  rows: readonly T[],
  keyOf: (row: T) => string,
  toIssue: (row: T) => ValidationIssue
) {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(keyOf(row), (counts.get(keyOf(row)) ?? 0) + 1);
  return rows.flatMap((row) => (counts.get(keyOf(row)) ?? 0) > 1 ? [toIssue(row)] : []);
}

export function validateWorkOrders(
  headers: readonly WorkOrderHeader[],
  processes: readonly WorkOrderProcess[]
) {
  const headerIssues = headers.flatMap((header) => {
    const rowKey = createWorkOrderHeaderKey(header.CD_FIRM, header.NO_WO);
    const issues = validateFields(header, headerRules, { scope: "header", rowKey });
    if (header.DT_PLAN_START && header.DT_PLAN_END && header.DT_PLAN_START > header.DT_PLAN_END) {
      issues.push({ scope: "header", rowKey, field: "DT_PLAN_END", message: "계획시작일은 계획종료일보다 늦을 수 없습니다." });
    }
    if (!processes.some((process) => process.CD_FIRM === header.CD_FIRM && process.NO_WO === header.NO_WO)) {
      issues.push({ scope: "header", rowKey, field: "NO_WO", message: "작업지시는 공정상세를 최소 1건 등록해야 합니다." });
    }
    return issues;
  });

  const processIssues = processes.flatMap((process) => {
    const rowKey = createWorkOrderProcessKey(process.CD_FIRM, process.NO_WO, process.NO_PROC);
    const issues = validateFields(process, processRules, { scope: "line", rowKey });
    if (process.CD_EQUIP.trim() && !process.NM_EQUIP.trim()) {
      issues.push({ scope: "line", rowKey, field: "CD_EQUIP", message: "설비코드에 해당하는 설비명이 필요합니다." });
    }
    if (process.TM_PLAN_START && process.TM_PLAN_END && process.TM_PLAN_START > process.TM_PLAN_END) {
      issues.push({ scope: "line", rowKey, field: "TM_PLAN_END", message: "공정 계획시작일시는 계획종료일시보다 늦을 수 없습니다." });
    }
    return issues;
  });

  return [
    ...headerIssues,
    ...processIssues,
    ...addDuplicateIssues(
      headers,
      (header) => createWorkOrderHeaderKey(header.CD_FIRM, header.NO_WO),
      (header) => ({ scope: "header", rowKey: createWorkOrderHeaderKey(header.CD_FIRM, header.NO_WO), field: "NO_WO", message: "작업지시 Header rowKey는 중복될 수 없습니다." })
    ),
    ...addDuplicateIssues(
      processes,
      (process) => `${process.CD_FIRM}::${process.NO_WO}::${process.NO_PROC}`,
      (process) => ({ scope: "line", rowKey: createWorkOrderProcessKey(process.CD_FIRM, process.NO_WO, process.NO_PROC), field: "NO_PROC", message: "동일 작업지시 내 공정순번(NO_PROC)은 중복될 수 없습니다." })
    ),
    ...addDuplicateIssues(
      processes,
      (process) => createWorkOrderProcessKey(process.CD_FIRM, process.NO_WO, process.NO_PROC),
      (process) => ({ scope: "line", rowKey: createWorkOrderProcessKey(process.CD_FIRM, process.NO_WO, process.NO_PROC), field: "NO_PROC", message: "공정상세 rowKey는 중복될 수 없습니다." })
    )
  ];
}

export function getWorkOrderWarnings(headers: readonly WorkOrderHeader[]) {
  return headers
    .filter((header) => header.QT_WO > 0 && header.QT_RESULT > header.QT_WO)
    .map((header) => `${header.NO_WO}: 실적수량이 지시수량보다 큽니다.`);
}
