import type { ProductionProcess } from "./types";

export const mockProductionProcesses: ProductionProcess[] = [
  { CD_FIRM: "1000", CD_PROC: "PROC-010", NM_PROC: "자재 준비", NO_SEQ: 10, YN_USE: "Y" },
  { CD_FIRM: "1000", CD_PROC: "PROC-020", NM_PROC: "부품 조립", NO_SEQ: 20, YN_USE: "Y" },
  { CD_FIRM: "1000", CD_PROC: "PROC-030", NM_PROC: "기능 검사", NO_SEQ: 30, YN_USE: "Y" },
  { CD_FIRM: "1000", CD_PROC: "PROC-040", NM_PROC: "품질 확인", NO_SEQ: 40, YN_USE: "Y" },
  { CD_FIRM: "1000", CD_PROC: "PROC-050", NM_PROC: "포장", NO_SEQ: 50, YN_USE: "Y" },
  { CD_FIRM: "1000", CD_PROC: "PROC-060", NM_PROC: "출하 준비", NO_SEQ: 60, YN_USE: "Y" },
  { CD_FIRM: "2000", CD_PROC: "PROC-070", NM_PROC: "시제품 가공", NO_SEQ: 70, YN_USE: "Y" },
  { CD_FIRM: "2000", CD_PROC: "PROC-080", NM_PROC: "시제품 검증", NO_SEQ: 80, YN_USE: "Y" },
  { CD_FIRM: "1000", CD_PROC: "PROC-090", NM_PROC: "중지 공정", NO_SEQ: 90, YN_USE: "N" }
];
