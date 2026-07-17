import type { ProductionLine } from "./types";

export const mockProductionLines: ProductionLine[] = [
  { CD_FIRM: "1000", CD_LINE: "LINE-A", NM_LINE: "조립 1라인", YN_USE: "Y" },
  { CD_FIRM: "1000", CD_LINE: "LINE-B", NM_LINE: "조립 2라인", YN_USE: "Y" },
  { CD_FIRM: "1000", CD_LINE: "LINE-C", NM_LINE: "검사 라인", YN_USE: "Y" },
  { CD_FIRM: "1000", CD_LINE: "LINE-D", NM_LINE: "포장 라인", YN_USE: "Y" },
  { CD_FIRM: "2000", CD_LINE: "LINE-E", NM_LINE: "시제품 라인", YN_USE: "Y" },
  { CD_FIRM: "1000", CD_LINE: "LINE-X", NM_LINE: "중지 라인", YN_USE: "N" }
];
