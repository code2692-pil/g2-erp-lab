import type { YesNo } from "../../work-order/types";

export interface ProductionLine {
  CD_FIRM: string;
  CD_LINE: string;
  NM_LINE: string;
  YN_USE: YesNo;
}
