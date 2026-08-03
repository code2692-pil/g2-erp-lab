import type { WorkOrderHeader, WorkOrderProcess } from "./types";

export const mockWorkOrderHeaders: WorkOrderHeader[] = [
  { CD_FIRM: "1000", NO_WO: "WO2026070001", DT_WO: "2026-07-01", CD_ITEM: "ITM-1001", NM_ITEM: "제어 모듈 조립품", STND_ITEM: "CTRL-A / 24V", UNIT_ITEM: "EA", QT_WO: 100, QT_RESULT: 0, DT_PLAN_START: "2026-07-03", DT_PLAN_END: "2026-07-04", CD_LINE: "LINE-A", NM_LINE: "조립 1라인", ST_WO: "미확정", YN_URGENT: "N", DC_RMK: "초도 작업지시" },
  { CD_FIRM: "1000", NO_WO: "WO2026070002", DT_WO: "2026-07-02", CD_ITEM: "ITM-1204", NM_ITEM: "센서 모듈 조립품", STND_ITEM: "SENSOR-B / IP67", UNIT_ITEM: "EA", QT_WO: 240, QT_RESULT: 0, DT_PLAN_START: "2026-07-05", DT_PLAN_END: "2026-07-07", CD_LINE: "LINE-B", NM_LINE: "조립 2라인", ST_WO: "확정", YN_URGENT: "N", DC_RMK: "일반 생산" },
  { CD_FIRM: "1000", NO_WO: "WO2026070003", DT_WO: "2026-07-04", CD_ITEM: "ITM-1308", NM_ITEM: "구동 모듈 조립품", STND_ITEM: "SD-2K / 3상", UNIT_ITEM: "EA", QT_WO: 80, QT_RESULT: 32, DT_PLAN_START: "2026-07-06", DT_PLAN_END: "2026-07-08", CD_LINE: "LINE-A", NM_LINE: "조립 1라인", ST_WO: "진행", YN_URGENT: "N", DC_RMK: "중간 실적 반영" },
  { CD_FIRM: "1000", NO_WO: "WO2026070004", DT_WO: "2026-07-05", CD_ITEM: "ITM-1410", NM_ITEM: "배선 키트 조립품", STND_ITEM: "WIRE-KIT-01", UNIT_ITEM: "SET", QT_WO: 50, QT_RESULT: 50, DT_PLAN_START: "2026-07-06", DT_PLAN_END: "2026-07-06", CD_LINE: "LINE-C", NM_LINE: "검사 라인", ST_WO: "완료", YN_URGENT: "N", DC_RMK: "검사 완료" },
  { CD_FIRM: "1000", NO_WO: "WO2026070005", DT_WO: "2026-07-07", CD_ITEM: "ITM-1505", NM_ITEM: "표시 장치 조립품", STND_ITEM: "TP-10 / 1280×800", UNIT_ITEM: "EA", QT_WO: 30, QT_RESULT: 0, DT_PLAN_START: "2026-07-07", DT_PLAN_END: "2026-07-08", CD_LINE: "LINE-B", NM_LINE: "조립 2라인", ST_WO: "확정", YN_URGENT: "Y", DC_RMK: "긴급 납품 대응" },
  { CD_FIRM: "2000", NO_WO: "WO2026070006", DT_WO: "2026-07-09", CD_ITEM: "ITM-3205", NM_ITEM: "완충 부품 가공품", STND_ITEM: "PE-20T / 500×500", UNIT_ITEM: "SHEET", QT_WO: 120, QT_RESULT: 90, DT_PLAN_START: "2026-07-10", DT_PLAN_END: "2026-07-11", CD_LINE: "LINE-E", NM_LINE: "시제품 라인", ST_WO: "진행", YN_URGENT: "N", DC_RMK: "일부 실적 등록" },
  ...[20, 10, 40, 25, 35].map((quantity, index): WorkOrderHeader => ({ CD_FIRM: "1000", NO_WO: `WMO202608${String(index + 1).padStart(4, "0")}`, DT_WO: `2026-08-${String(index + 2).padStart(2, "0")}`, CD_ITEM: "ITM-1001", NM_ITEM: "220V 서보드라이브 모듈", STND_ITEM: "SV-220V", UNIT_ITEM: "EA", QT_WO: quantity, QT_RESULT: 0, DT_PLAN_START: `2026-08-${String(index + 3).padStart(2, "0")}`, DT_PLAN_END: `2026-08-${String(index + 5).padStart(2, "0")}`, CD_LINE: "LINE-A", NM_LINE: "조립 작업장", ST_WO: index === 3 ? "진행" : "미확정", YN_URGENT: "N", DC_RMK: `원본 SOR202608${String(index + 1).padStart(4, "0")}/1` }))
];

export const mockWorkOrderProcesses: WorkOrderProcess[] = [
  { CD_FIRM: "1000", NO_WO: "WO2026070001", NO_PROC: 10, CD_PROC: "PROC-010", NM_PROC: "자재 준비", CD_EQUIP: "EQ-A01", NM_EQUIP: "조립 스테이션 1", QT_PLAN: 100, QT_RESULT: 0, TM_PLAN_START: "2026-07-03T08:00", TM_PLAN_END: "2026-07-03T10:00", ST_PROC: "대기", DC_RMK: "" },
  { CD_FIRM: "1000", NO_WO: "WO2026070001", NO_PROC: 20, CD_PROC: "PROC-020", NM_PROC: "부품 조립", CD_EQUIP: "EQ-A02", NM_EQUIP: "조립 스테이션 2", QT_PLAN: 100, QT_RESULT: 0, TM_PLAN_START: "2026-07-03T10:30", TM_PLAN_END: "2026-07-04T15:00", ST_PROC: "대기", DC_RMK: "" },
  { CD_FIRM: "1000", NO_WO: "WO2026070002", NO_PROC: 10, CD_PROC: "PROC-010", NM_PROC: "자재 준비", CD_EQUIP: "EQ-B01", NM_EQUIP: "정밀 체결기", QT_PLAN: 240, QT_RESULT: 0, TM_PLAN_START: "2026-07-05T08:00", TM_PLAN_END: "2026-07-05T11:00", ST_PROC: "대기", DC_RMK: "" },
  { CD_FIRM: "1000", NO_WO: "WO2026070002", NO_PROC: 20, CD_PROC: "PROC-020", NM_PROC: "부품 조립", CD_EQUIP: "EQ-B01", NM_EQUIP: "정밀 체결기", QT_PLAN: 240, QT_RESULT: 0, TM_PLAN_START: "2026-07-05T13:00", TM_PLAN_END: "2026-07-06T16:00", ST_PROC: "대기", DC_RMK: "" },
  { CD_FIRM: "1000", NO_WO: "WO2026070002", NO_PROC: 30, CD_PROC: "PROC-030", NM_PROC: "기능 검사", CD_EQUIP: "EQ-C01", NM_EQUIP: "기능 검사기", QT_PLAN: 240, QT_RESULT: 0, TM_PLAN_START: "2026-07-07T09:00", TM_PLAN_END: "2026-07-07T17:00", ST_PROC: "대기", DC_RMK: "" },
  { CD_FIRM: "1000", NO_WO: "WO2026070003", NO_PROC: 10, CD_PROC: "PROC-020", NM_PROC: "부품 조립", CD_EQUIP: "EQ-A01", NM_EQUIP: "조립 스테이션 1", QT_PLAN: 80, QT_RESULT: 40, TM_PLAN_START: "2026-07-06T08:00", TM_PLAN_END: "2026-07-07T12:00", ST_PROC: "진행", DC_RMK: "" },
  { CD_FIRM: "1000", NO_WO: "WO2026070003", NO_PROC: 20, CD_PROC: "PROC-030", NM_PROC: "기능 검사", CD_EQUIP: "EQ-C01", NM_EQUIP: "기능 검사기", QT_PLAN: 80, QT_RESULT: 24, TM_PLAN_START: "2026-07-07T13:00", TM_PLAN_END: "2026-07-08T16:00", ST_PROC: "진행", DC_RMK: "" },
  { CD_FIRM: "1000", NO_WO: "WO2026070004", NO_PROC: 10, CD_PROC: "PROC-040", NM_PROC: "품질 확인", CD_EQUIP: "EQ-C02", NM_EQUIP: "외관 검사대", QT_PLAN: 50, QT_RESULT: 50, TM_PLAN_START: "2026-07-06T08:00", TM_PLAN_END: "2026-07-06T12:00", ST_PROC: "완료", DC_RMK: "" },
  { CD_FIRM: "1000", NO_WO: "WO2026070005", NO_PROC: 10, CD_PROC: "PROC-020", NM_PROC: "부품 조립", CD_EQUIP: "EQ-B02", NM_EQUIP: "토크 측정기", QT_PLAN: 30, QT_RESULT: 0, TM_PLAN_START: "2026-07-07T08:00", TM_PLAN_END: "2026-07-07T14:00", ST_PROC: "대기", DC_RMK: "긴급 우선 배정" },
  { CD_FIRM: "1000", NO_WO: "WO2026070005", NO_PROC: 20, CD_PROC: "PROC-030", NM_PROC: "기능 검사", CD_EQUIP: "EQ-C01", NM_EQUIP: "기능 검사기", QT_PLAN: 30, QT_RESULT: 0, TM_PLAN_START: "2026-07-08T08:00", TM_PLAN_END: "2026-07-08T11:00", ST_PROC: "대기", DC_RMK: "" },
  { CD_FIRM: "2000", NO_WO: "WO2026070006", NO_PROC: 10, CD_PROC: "PROC-070", NM_PROC: "시제품 가공", CD_EQUIP: "EQ-E01", NM_EQUIP: "시제품 가공기", QT_PLAN: 120, QT_RESULT: 100, TM_PLAN_START: "2026-07-10T08:00", TM_PLAN_END: "2026-07-10T16:00", ST_PROC: "완료", DC_RMK: "" },
  { CD_FIRM: "2000", NO_WO: "WO2026070006", NO_PROC: 20, CD_PROC: "PROC-080", NM_PROC: "시제품 검증", CD_EQUIP: "EQ-E01", NM_EQUIP: "시제품 가공기", QT_PLAN: 120, QT_RESULT: 90, TM_PLAN_START: "2026-07-11T08:00", TM_PLAN_END: "2026-07-11T14:00", ST_PROC: "진행", DC_RMK: "" },
  ...[20, 10, 40, 25, 35].flatMap((quantity, workIndex) => [
    [10, "PROC-010", "가공", "LINE-A"],
    [20, "PROC-020", "조립", "LINE-A"],
    [30, "PROC-030", "전기검사", "LINE-C"],
    [40, "PROC-040", "최종검사", "LINE-C"],
    [50, "PROC-050", "포장", "LINE-D"]
  ].map(([sequence, processCode, processName, lineCode], processIndex): WorkOrderProcess => ({ CD_FIRM: "1000", NO_WO: `WMO202608${String(workIndex + 1).padStart(4, "0")}`, NO_PROC: Number(sequence), CD_PROC: String(processCode), NM_PROC: String(processName), CD_EQUIP: String(lineCode), NM_EQUIP: `${String(processName)} 작업장`, QT_PLAN: quantity, QT_RESULT: 0, TM_PLAN_START: `2026-08-${String(workIndex + 3).padStart(2, "0")}T${String(8 + processIndex).padStart(2, "0")}:00`, TM_PLAN_END: `2026-08-${String(workIndex + 3).padStart(2, "0")}T${String(9 + processIndex).padStart(2, "0")}:00`, ST_PROC: "대기", DC_RMK: "정기 생산" })))
];

export interface MockWorkOrderBill {
  NO_WO: string;
  NO_BOM_LINE: number;
  CD_COMPONENT: string;
  NM_COMPONENT: string;
  UNIT_COMPONENT: string;
  QT_BASE: number;
  QT_REQUIRED: number;
}

const finalUatComponents = [
  [10, "ITM-2102", "알루미늄 하우징", "EA"],
  [20, "ITM-1204", "모터 드라이브 PCB", "EA"],
  [30, "ITM-1410", "정밀 베어링", "EA"],
  [40, "ITM-1600", "체결부품 세트", "SET"],
  [50, "ITM-3100", "포장재", "SET"]
] as const;

export const finalUatWorkOrderBills: MockWorkOrderBill[] = [20, 10, 40, 25, 35].flatMap((quantity, workIndex) =>
  finalUatComponents.map(([line, code, name, unit]) => ({
    NO_WO: `WMO202608${String(workIndex + 1).padStart(4, "0")}`,
    NO_BOM_LINE: line,
    CD_COMPONENT: code,
    NM_COMPONENT: name,
    UNIT_COMPONENT: unit,
    QT_BASE: 1,
    QT_REQUIRED: quantity
  }))
);
