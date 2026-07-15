export type PurchaseOrderStatus = "미확정" | "확정" | "승인" | "진행" | "마감" | "취소";

export interface PurchaseOrderHeader {
  CD_FIRM: string;
  NO_PO: string;
  DT_PO: string;
  CD_PARTNER: string;
  NM_PARTNER: string;
  CD_EMP: string;
  NM_EMP: string;
  CD_CURRENCY: string;
  RT_EXCHANGE: number;
  ST_PO: PurchaseOrderStatus;
  DC_RMK: string;
}

export interface PurchaseOrderLine {
  CD_FIRM: string;
  NO_PO: string;
  NO_LINE: number;
  CD_ITEM: string;
  NM_ITEM: string;
  STND_ITEM: string;
  UNIT_ITEM: string;
  QT_PO: number;
  UM_PO: number;
  AM_SUPPLY: number;
  AM_VAT: number;
  AM_TOTAL: number;
  DT_DLV: string;
  CD_WH: string;
  NM_WH: string;
  DC_RMK: string;
}
