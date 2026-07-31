export const ERP_GRID_PASTE_MAX_ROWS = 1_000;
export const ERP_GRID_PASTE_MAX_CELLS = 20_000;

export interface ErpGridPasteMatrix {
  rows: string[][];
  rowCount: number;
  columnCount: number;
}

export function parseErpGridPasteMatrix(text: string): ErpGridPasteMatrix {
  const normalized = text.replace(/\r\n?/g, "\n");
  if (!normalized.trim()) {
    throw new Error("붙여넣을 데이터가 없습니다.");
  }

  const rows = normalized.split("\n");
  if (rows.at(-1) === "") rows.pop();
  if (rows.length === 0) {
    throw new Error("빈 행만 있는 데이터는 붙여넣을 수 없습니다.");
  }

  const columnCount = rows[0]?.split("\t").length ?? 0;
  const matrix = rows.map((row) => (row === "" ? Array.from({ length: columnCount }, () => "") : row.split("\t")));
  if (matrix.every((row) => row.every((value) => value.trim() === ""))) {
    throw new Error("빈 행만 있는 데이터는 붙여넣을 수 없습니다.");
  }
  if (columnCount === 0 || matrix.some((row) => row.length !== columnCount)) {
    throw new Error("붙여넣기 행의 열 개수가 서로 다릅니다.");
  }
  if (matrix.length > ERP_GRID_PASTE_MAX_ROWS) {
    throw new Error(`붙여넣기는 최대 ${ERP_GRID_PASTE_MAX_ROWS.toLocaleString("ko-KR")}행까지 가능합니다.`);
  }
  if (matrix.length * columnCount > ERP_GRID_PASTE_MAX_CELLS) {
    throw new Error(`붙여넣기는 최대 ${ERP_GRID_PASTE_MAX_CELLS.toLocaleString("ko-KR")}셀까지 가능합니다.`);
  }

  return { rows: matrix, rowCount: matrix.length, columnCount };
}

export function parseErpGridPasteNumber(value: string) {
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized) throw new Error("숫자 값이 비어 있습니다.");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) throw new Error("숫자 형식이 올바르지 않습니다.");
  return parsed;
}

export function parseErpGridPasteDate(value: string) {
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error("날짜는 YYYY-MM-DD 형식이어야 합니다.");
  }
  const date = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) {
    throw new Error("날짜가 올바르지 않습니다.");
  }
  return normalized;
}
