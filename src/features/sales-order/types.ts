export type SalesOrderStatus = "신규" | "진행" | "확정" | "마감";

export interface SalesOrderHeader {
  CD_FIRM: string;
  NO_SO: string;
  DT_SO: string;
  CD_PARTNER: string;
  NM_PARTNER: string;
  CD_EMP: string;
  ST_SO: SalesOrderStatus;
  DC_RMK: string;
}

export interface SalesOrderLine {
  CD_FIRM: string;
  NO_SO: string;
  NO_LINE: number;
  CD_ITEM: string;
  NM_ITEM: string;
  STND_ITEM: string;
  UNIT_ITEM: string;
  QT_SO: number;
  UM_SO: number;
  AM_SUPPLY: number;
  AM_VAT: number;
  AM_TOTAL: number;
  DT_DLV: string;
  DC_RMK: string;
}
