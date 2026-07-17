import type { WorkOrderHeader, WorkOrderProcess } from "./types";

export interface WorkOrderProcessTotals {
  QT_PLAN: number;
  QT_RESULT: number;
}

export function createWorkOrderHeaderKey(cdFirm: string, noWo: string) {
  return `${cdFirm}::${noWo}`;
}

export function createWorkOrderProcessKey(cdFirm: string, noWo: string, noProc: number) {
  return `${cdFirm}::${noWo}::${noProc}`;
}

export function calculateWorkOrderProgress(header: Pick<WorkOrderHeader, "QT_WO" | "QT_RESULT">) {
  if (header.QT_WO <= 0) return 0;
  return (header.QT_RESULT / header.QT_WO) * 100;
}

export function formatWorkOrderProgress(header: Pick<WorkOrderHeader, "QT_WO" | "QT_RESULT">) {
  return `${calculateWorkOrderProgress(header).toFixed(1)}%`;
}

export function calculateWorkOrderProcessTotals(
  processes: readonly Pick<WorkOrderProcess, "QT_PLAN" | "QT_RESULT">[]
): WorkOrderProcessTotals {
  return processes.reduce(
    (totals, process) => ({
      QT_PLAN: totals.QT_PLAN + process.QT_PLAN,
      QT_RESULT: totals.QT_RESULT + process.QT_RESULT
    }),
    { QT_PLAN: 0, QT_RESULT: 0 }
  );
}
