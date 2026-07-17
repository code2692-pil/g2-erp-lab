import type { YesNo } from "../../work-order/types";

export interface Equipment {
  CD_FIRM: string;
  CD_EQUIP: string;
  NM_EQUIP: string;
  CD_LINE: string;
  YN_USE: YesNo;
}
