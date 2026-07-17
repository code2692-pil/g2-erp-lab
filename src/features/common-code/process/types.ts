import type { YesNo } from "../../work-order/types";

export interface ProductionProcess {
  CD_FIRM: string;
  CD_PROC: string;
  NM_PROC: string;
  NO_SEQ: number;
  YN_USE: YesNo;
}
