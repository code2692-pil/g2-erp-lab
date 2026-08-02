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
  },
  ...Array.from({ length: 7 }, (_, index): SalesOrderHeader => ({
    CD_FIRM: "1000",
    NO_SO: `SOR202608${String(index + 1).padStart(4, "0")}`,
    DT_SO: `2026-08-${String(index + 1).padStart(2, "0")}`,
    CD_PARTNER: index % 2 === 0 ? "P-10021" : "P-10044",
    NM_PARTNER: index % 2 === 0 ? "가온모션 테스트 고객사" : "한빛산업 테스트 고객사",
    CD_EMP: "FINAL-UAT",
    ST_SO: index < 5 ? "확정" : "진행",
    DC_RMK: `FINAL-UAT-202608 수주 Sample ${index + 1}`
  }))
];

const finalUatSalesLines: SalesOrderLine[] = Array.from({ length: 7 }, (_, index) => ({
  CD_FIRM: "1000",
  NO_SO: `SOR202608${String(index + 1).padStart(4, "0")}`,
  NO_LINE: 1,
  CD_ITEM: "ITM-1001",
  NM_ITEM: "220V 서보드라이브 모듈",
  STND_ITEM: "FINAL-UAT-FG",
  UNIT_ITEM: "EA",
  QT_SO: [24, 60, 100, 80, 20, 60, 40][index],
  UM_SO: 280000,
  AM_SUPPLY: [24, 60, 100, 80, 20, 60, 40][index] * 280000,
  AM_VAT: [24, 60, 100, 80, 20, 60, 40][index] * 28000,
  AM_TOTAL: [24, 60, 100, 80, 20, 60, 40][index] * 308000,
  DT_DLV: `2026-08-${String(index + 15).padStart(2, "0")}`,
  DC_RMK: `FINAL-UAT-202608 원본 행 ${index + 1}`
}));

export const mockSalesOrderLines: SalesOrderLine[] = [
  {
    CD_FIRM: "1000",
    NO_SO: "SO2026070001",
    NO_LINE: 1,
    CD_ITEM: "ITM-1001",
    NM_ITEM: "산업용 컨트롤러 A",
    STND_ITEM: "CTRL-A / 24V",
    UNIT_ITEM: "EA",
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
    STND_ITEM: "SENSOR-B / IP67",
    UNIT_ITEM: "EA",
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
    STND_ITEM: "400×300×200",
    UNIT_ITEM: "EA",
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
    STND_ITEM: "BOX-L / 10EA",
    UNIT_ITEM: "SET",
    QT_SO: 100,
    UM_SO: 8000,
    AM_SUPPLY: 800000,
    AM_VAT: 80000,
    AM_TOTAL: 880000,
    DT_DLV: "2026-07-08",
    DC_RMK: ""
  },
  ...finalUatSalesLines
];
