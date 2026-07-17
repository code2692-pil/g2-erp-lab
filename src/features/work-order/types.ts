export type WorkOrderStatus = "미확정" | "확정" | "진행" | "완료" | "마감" | "취소";
export type ProcessStatus = "대기" | "진행" | "완료" | "보류";
export type YesNo = "Y" | "N";

/** PRT_WO 개념에 대응하는 작업지시 Header의 화면 전용 타입입니다. */
export interface WorkOrderHeader {
  CD_FIRM: string;
  NO_WO: string;
  DT_WO: string;
  CD_ITEM: string;
  NM_ITEM: string;
  STND_ITEM: string;
  UNIT_ITEM: string;
  QT_WO: number;
  QT_RESULT: number;
  DT_PLAN_START: string;
  DT_PLAN_END: string;
  CD_LINE: string;
  NM_LINE: string;
  ST_WO: WorkOrderStatus;
  YN_URGENT: YesNo;
  DC_RMK: string;
  /** 화면 표시용 계산값이며 저장 대상은 아닙니다. */
  PROGRESS?: number;
}

/** PRT_WOPROC 개념에 대응하는 작업지시 공정상세의 화면 전용 타입입니다. */
export interface WorkOrderProcess {
  CD_FIRM: string;
  NO_WO: string;
  NO_PROC: number;
  CD_PROC: string;
  NM_PROC: string;
  CD_EQUIP: string;
  NM_EQUIP: string;
  QT_PLAN: number;
  QT_RESULT: number;
  TM_PLAN_START: string;
  TM_PLAN_END: string;
  ST_PROC: ProcessStatus;
  DC_RMK: string;
}
