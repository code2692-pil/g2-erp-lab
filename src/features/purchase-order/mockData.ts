import type { PurchaseOrderHeader, PurchaseOrderLine } from "./types";
import { calculatePurchaseOrderLineAmounts } from "./utils";

const headerRows: Array<Omit<PurchaseOrderHeader, "DC_RMK"> & { DC_RMK?: string }> = [
  { CD_FIRM: "1000", NO_PO: "PO2026070001", DT_PO: "2026-07-01", CD_PARTNER: "P-10021", NM_PARTNER: "G2 Trading", CD_EMP: "E-013", NM_EMP: "Kim ERP", CD_CURRENCY: "KRW", RT_EXCHANGE: 1, ST_PO: "확정" },
  { CD_FIRM: "1000", NO_PO: "PO2026070002", DT_PO: "2026-07-02", CD_PARTNER: "P-10044", NM_PARTNER: "Hanul Industry", CD_EMP: "E-021", NM_EMP: "Lee Buyer", CD_CURRENCY: "KRW", RT_EXCHANGE: 1, ST_PO: "진행" },
  { CD_FIRM: "1000", NO_PO: "PO2026070003", DT_PO: "2026-07-03", CD_PARTNER: "P-10058", NM_PARTNER: "Mirae Parts", CD_EMP: "E-013", NM_EMP: "Kim ERP", CD_CURRENCY: "USD", RT_EXCHANGE: 1350, ST_PO: "승인" },
  { CD_FIRM: "2000", NO_PO: "PO2026070004", DT_PO: "2026-07-04", CD_PARTNER: "P-20012", NM_PARTNER: "Daeyang Distribution", CD_EMP: "E-008", NM_EMP: "Park Buyer", CD_CURRENCY: "KRW", RT_EXCHANGE: 1, ST_PO: "마감" },
  { CD_FIRM: "2000", NO_PO: "PO2026070005", DT_PO: "2026-07-05", CD_PARTNER: "P-20027", NM_PARTNER: "Donghae Materials", CD_EMP: "E-008", NM_EMP: "Park Buyer", CD_CURRENCY: "KRW", RT_EXCHANGE: 1, ST_PO: "미확정" }
  ,...Array.from({ length: 5 }, (_, index) => ({ CD_FIRM: "1000", NO_PO: `POR202608${String(index + 1).padStart(4, "0")}`, DT_PO: `2026-08-${String(index + 2).padStart(2, "0")}`, CD_PARTNER: index % 2 === 0 ? "UAT-SUP-01" : "UAT-SUP-02", NM_PARTNER: index % 2 === 0 ? "세림정밀 테스트 공급사" : "한빛전자 테스트 공급사", CD_EMP: "FINAL-UAT", NM_EMP: "UAT 구매담당", CD_CURRENCY: "KRW", RT_EXCHANGE: 1, ST_PO: index === 3 ? "진행" : "신규", DC_RMK: `FINAL-UAT-202608 · 원본 SOR202608${String(index + 1).padStart(4, "0")}/1` }))
];

export const mockPurchaseOrderHeaders: PurchaseOrderHeader[] = headerRows.map((header) => ({ ...header, DC_RMK: "Purchase order sample" }));

function line(company: string, no: string, lineNo: number, item: string, name: string, standard: string, unit: string, quantity: number, price: number, warehouse: string, warehouseName: string, dueDate = "2026-07-20", remark = ""): PurchaseOrderLine {
  return { CD_FIRM: company, NO_PO: no, NO_LINE: lineNo, CD_ITEM: item, NM_ITEM: name, STND_ITEM: standard, UNIT_ITEM: unit, QT_PO: quantity, UM_PO: price, ...calculatePurchaseOrderLineAmounts(quantity, price), DT_DLV: dueDate, CD_WH: warehouse, NM_WH: warehouseName, DC_RMK: remark };
}

export const mockPurchaseOrderLines: PurchaseOrderLine[] = [
  line("1000", "PO2026070001", 1, "ITM-1001", "Controller A", "CTRL-A / 24V", "EA", 10, 280000, "WH-100", "Central Warehouse"),
  line("1000", "PO2026070001", 2, "ITM-1204", "Sensor Module B", "SENSOR-B / IP67", "EA", 20, 45000, "WH-110", "Parts Warehouse"),
  line("1000", "PO2026070002", 1, "ITM-1308", "Servo Drive", "SD-2K / 3PH", "EA", 4, 520000, "WH-100", "Central Warehouse"),
  line("1000", "PO2026070002", 2, "ITM-1410", "Control Cable", "WIRE-KIT-01", "SET", 8, 90000, "WH-110", "Parts Warehouse"),
  line("1000", "PO2026070003", 1, "ITM-1505", "Touch Panel", "TP-10 / 1280x800", "EA", 3, 780, "WH-120", "Quality Warehouse"),
  line("1000", "PO2026070003", 2, "ITM-2102", "Electrical Enclosure", "400x300x200", "EA", 6, 135000, "WH-100", "Central Warehouse"),
  line("2000", "PO2026070004", 1, "ITM-3100", "Packaging Set", "BOX-L / 10EA", "SET", 50, 8000, "WH-200", "Busan Warehouse"),
  line("2000", "PO2026070005", 1, "ITM-3205", "Packaging Board", "PE-20T", "SHEET", 30, 22000, "WH-210", "Export Warehouse"),
  ...[24, 40, 40, 30, 50].map((quantity, index) => line("1000", `POR202608${String(index + 1).padStart(4, "0")}`, 1, "ITM-1001", "220V 서보드라이브 모듈", "FINAL-UAT-FG", "EA", quantity, 180000, "UAT-WH-01", "FINAL UAT 자재창고", `2026-08-${String(index + 15).padStart(2, "0")}`, `FINAL-UAT-202608 · 원본 SOR202608${String(index + 1).padStart(4, "0")}/1`))
];
