import type { SalesOrderHeader, SalesOrderLine } from "./types";

export const mockSalesOrderHeaders: SalesOrderHeader[] = [
  {
    CD_FIRM: "1000",
    NO_SO: "SO2026070001",
    DT_SO: "2026-07-01",
    CD_PARTNER: "P-10021",
    NM_PARTNER: "세명테크",
    CD_EMP: "E-013",
    ST_SO: "확정",
    DC_RMK: "7월 정기 발주"
  },
  {
    CD_FIRM: "1000",
    NO_SO: "SO2026070002",
    DT_SO: "2026-07-02",
    CD_PARTNER: "P-10044",
    NM_PARTNER: "한빛산업",
    CD_EMP: "E-021",
    ST_SO: "진행",
    DC_RMK: "납기 분할 협의"
  },
  {
    CD_FIRM: "2000",
    NO_SO: "SO2026070003",
    DT_SO: "2026-07-04",
    CD_PARTNER: "P-20012",
    NM_PARTNER: "대원유통",
    CD_EMP: "E-008",
    ST_SO: "마감",
    DC_RMK: "출고 완료"
  }
];

export const mockSalesOrderLines: SalesOrderLine[] = [
  {
    CD_FIRM: "1000",
    NO_SO: "SO2026070001",
    NO_LINE: 1,
    CD_ITEM: "ITM-1001",
    NM_ITEM: "산업용 컨트롤러 A",
    QT_SO: 12,
    UM_SO: 280000,
    AM_SUPPLY: 3360000,
    AM_VAT: 336000,
    AM_TOTAL: 3696000,
    DT_DLV: "2026-07-15",
    DC_RMK: "우선 납품"
  },
  {
    CD_FIRM: "1000",
    NO_SO: "SO2026070001",
    NO_LINE: 2,
    CD_ITEM: "ITM-1204",
    NM_ITEM: "센서 모듈 B",
    QT_SO: 40,
    UM_SO: 45000,
    AM_SUPPLY: 1800000,
    AM_VAT: 180000,
    AM_TOTAL: 1980000,
    DT_DLV: "2026-07-20",
    DC_RMK: ""
  },
  {
    CD_FIRM: "1000",
    NO_SO: "SO2026070002",
    NO_LINE: 1,
    CD_ITEM: "ITM-2102",
    NM_ITEM: "전장 하우징",
    QT_SO: 25,
    UM_SO: 135000,
    AM_SUPPLY: 3375000,
    AM_VAT: 337500,
    AM_TOTAL: 3712500,
    DT_DLV: "2026-07-25",
    DC_RMK: "검사성적서 포함"
  },
  {
    CD_FIRM: "2000",
    NO_SO: "SO2026070003",
    NO_LINE: 1,
    CD_ITEM: "ITM-3100",
    NM_ITEM: "포장재 세트",
    QT_SO: 100,
    UM_SO: 8000,
    AM_SUPPLY: 800000,
    AM_VAT: 80000,
    AM_TOTAL: 880000,
    DT_DLV: "2026-07-08",
    DC_RMK: ""
  }
];
