import assert from "node:assert/strict";
import test from "node:test";
import {
  applyGridViewPreferences,
  GRID_VIEW_PREFERENCES_SCHEMA_VERSION,
  createDefaultGridViewPreferences,
  getGridViewPreferencesStorageKey,
  loadGridViewPreferences,
  moveGridViewColumn,
  normalizeGridViewPreferences,
  resetGridViewPreferences,
  revealGridViewColumn,
  saveGridViewPreferences,
  setGridViewColumnVisibility,
  type GridViewColumnDefinition,
  type GridViewStorage
} from "../../src/components/common/gridViewPreferences.ts";

const gridId = "sales-order-lines";
const definitions: readonly GridViewColumnDefinition[] = [
  { id: "lineNumber", label: "라인", locked: true },
  { id: "itemCode", label: "품목코드" },
  { id: "quantity", label: "수량" },
  { id: "remark", label: "비고" }
];

class MemoryStorage implements GridViewStorage {
  readonly values = new Map<string, string>();

  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

test("Grid 보기 설정은 표시·순서만 저장하고 정상 복원한다", () => {
  const storage = new MemoryStorage();
  const defaultPreferences = createDefaultGridViewPreferences(gridId, definitions);
  const hiddenRemark = setGridViewColumnVisibility(defaultPreferences, gridId, definitions, "remark", false);
  const movedQuantity = moveGridViewColumn(hiddenRemark, gridId, definitions, "quantity", "up");
  const saved = saveGridViewPreferences(gridId, definitions, movedQuantity, storage);
  const restored = loadGridViewPreferences(gridId, definitions, storage);

  assert.equal(saved.persisted, true);
  assert.equal(restored.columns.find((column) => column.id === "remark")?.visible, false);
  assert.deepEqual(restored.columns.map((column) => column.id), ["lineNumber", "quantity", "itemCode", "remark"]);
  assert.deepEqual(Object.keys(JSON.parse(storage.getItem(getGridViewPreferencesStorageKey(gridId))!)).sort(), ["columns", "gridId", "schemaVersion"]);
});

test("Grid별 저장 key는 서로 독립이며 초기화는 대상 Grid만 제거한다", () => {
  const storage = new MemoryStorage();
  const purchaseId = "purchase-order-lines";
  saveGridViewPreferences(gridId, definitions, setGridViewColumnVisibility(createDefaultGridViewPreferences(gridId, definitions), gridId, definitions, "remark", false), storage);
  saveGridViewPreferences(purchaseId, definitions, createDefaultGridViewPreferences(purchaseId, definitions), storage);

  const reset = resetGridViewPreferences(gridId, definitions, storage);

  assert.equal(storage.getItem(getGridViewPreferencesStorageKey(gridId)), null);
  assert.notEqual(storage.getItem(getGridViewPreferencesStorageKey(purchaseId)), null);
  assert.equal(reset.preferences.columns.every((column) => column.visible), true);
});

test("손상·알 수 없는 schema·다른 Grid 설정은 안전한 기본값으로 복구한다", () => {
  const storage = new MemoryStorage();
  const key = getGridViewPreferencesStorageKey(gridId);
  storage.setItem(key, "{");
  assert.deepEqual(loadGridViewPreferences(gridId, definitions, storage), createDefaultGridViewPreferences(gridId, definitions));

  storage.setItem(key, JSON.stringify({ schemaVersion: 99, gridId, columns: [] }));
  assert.deepEqual(loadGridViewPreferences(gridId, definitions, storage), createDefaultGridViewPreferences(gridId, definitions));

  storage.setItem(key, JSON.stringify({ schemaVersion: GRID_VIEW_PREFERENCES_SCHEMA_VERSION, gridId: "other-grid", columns: [] }));
  assert.deepEqual(loadGridViewPreferences(gridId, definitions, storage), createDefaultGridViewPreferences(gridId, definitions));
});

test("중복·삭제·신규·비정상 order 저장값을 정규화하고 잠금 열을 보호한다", () => {
  const normalized = normalizeGridViewPreferences({
    schemaVersion: GRID_VIEW_PREFERENCES_SCHEMA_VERSION,
    gridId,
    columns: [
      { id: "quantity", visible: false, order: 0 },
      { id: "quantity", visible: true, order: 1 },
      { id: "removedColumn", visible: true, order: 2 },
      { id: "lineNumber", visible: false, order: 99 },
      { id: "itemCode", visible: false, order: -1 },
      { id: "remark", visible: false, order: "not-a-number" }
    ]
  }, gridId, definitions);

  assert.deepEqual(normalized.columns.map((column) => column.id), ["lineNumber", "quantity", "itemCode", "remark"]);
  assert.equal(normalized.columns.find((column) => column.id === "lineNumber")?.visible, true);
  assert.equal(normalized.columns.find((column) => column.id === "quantity")?.visible, false);
  assert.equal(normalized.columns.find((column) => column.id === "itemCode")?.visible, false);
  assert.equal(normalized.columns.find((column) => column.id === "remark")?.visible, false);
});

test("모든 열 숨김 요청과 잠금 열 이동은 안전하게 거부한다", () => {
  let preferences = createDefaultGridViewPreferences(gridId, definitions);
  for (const id of ["itemCode", "quantity", "remark"]) {
    preferences = setGridViewColumnVisibility(preferences, gridId, definitions, id, false);
  }
  const moved = moveGridViewColumn(preferences, gridId, definitions, "lineNumber", "down");

  assert.equal(preferences.columns.some((column) => column.visible), true);
  assert.equal(preferences.columns.find((column) => column.id === "lineNumber")?.visible, true);
  assert.deepEqual(moved.columns.map((column) => column.id), preferences.columns.map((column) => column.id));
});

test("localStorage 접근 실패는 현재 세션 설정을 유지하고 예외를 던지지 않는다", () => {
  const failingStorage: GridViewStorage = {
    getItem() { throw new Error("storage disabled"); },
    setItem() { throw new Error("quota exceeded"); },
    removeItem() { throw new Error("storage disabled"); }
  };
  const saved = saveGridViewPreferences(gridId, definitions, createDefaultGridViewPreferences(gridId, definitions), failingStorage);
  const reset = resetGridViewPreferences(gridId, definitions, failingStorage);

  assert.equal(saved.persisted, false);
  assert.equal(saved.preferences.gridId, gridId);
  assert.equal(reset.persisted, false);
  assert.equal(loadGridViewPreferences(gridId, definitions, failingStorage).columns.length, definitions.length);
});

test("기본값은 현재 Grid의 안정된 열 ID와 순서를 모두 포함한다", () => {
  const preferences = createDefaultGridViewPreferences(gridId, definitions);

  assert.deepEqual(preferences.columns, [
    { id: "lineNumber", visible: true, order: 0 },
    { id: "itemCode", visible: true, order: 1 },
    { id: "quantity", visible: true, order: 2 },
    { id: "remark", visible: true, order: 3 }
  ]);
});

test("검증 오류 열 공개는 다른 열의 표시와 순서를 보존한다", () => {
  let preferences = createDefaultGridViewPreferences(gridId, definitions);
  preferences = setGridViewColumnVisibility(preferences, gridId, definitions, "remark", false);
  preferences = moveGridViewColumn(preferences, gridId, definitions, "quantity", "up");
  const revealed = revealGridViewColumn(preferences, gridId, definitions, "remark");

  assert.equal(revealed.columns.find((column) => column.id === "remark")?.visible, true);
  assert.deepEqual(revealed.columns.map((column) => column.id), ["lineNumber", "quantity", "itemCode", "remark"]);
});

test("이전 저장값에 없는 신규 열은 기본 표시 상태로 안전하게 추가한다", () => {
  const expandedDefinitions = [...definitions, { id: "deliveryDate", label: "납기일" }] as const;
  const normalized = normalizeGridViewPreferences({
    schemaVersion: GRID_VIEW_PREFERENCES_SCHEMA_VERSION,
    gridId,
    columns: [
      { id: "lineNumber", visible: true, order: 0 },
      { id: "itemCode", visible: false, order: 1 }
    ]
  }, gridId, expandedDefinitions);

  assert.deepEqual(normalized.columns.map((column) => column.id), ["lineNumber", "itemCode", "quantity", "remark", "deliveryDate"]);
  assert.equal(normalized.columns.find((column) => column.id === "deliveryDate")?.visible, true);
});

test("삭제된 저장 열은 무시하고 현재 정의에 없는 UI 열을 만들지 않는다", () => {
  const normalized = normalizeGridViewPreferences({
    schemaVersion: GRID_VIEW_PREFERENCES_SCHEMA_VERSION,
    gridId,
    columns: [
      { id: "removedLegacyColumn", visible: true, order: 0 },
      { id: "quantity", visible: false, order: 1 }
    ]
  }, gridId, definitions);

  assert.equal(normalized.columns.some((column) => column.id === "removedLegacyColumn"), false);
  assert.equal(normalized.columns.find((column) => column.id === "quantity")?.visible, false);
});

test("중복된 현재 열 정의는 하나의 설정 항목으로만 정규화한다", () => {
  const duplicatedDefinitions = [...definitions, { id: "quantity", label: "중복 수량" }];
  const preferences = createDefaultGridViewPreferences(gridId, duplicatedDefinitions);

  assert.deepEqual(preferences.columns.map((column) => column.id), ["lineNumber", "itemCode", "quantity", "remark"]);
});

test("적용 결과는 원본 열의 업무 값 없이 표시 여부와 순서만 반영한다", () => {
  const columns = [
    { id: "lineNumber", field: "lineNumber" as const, hidden: false },
    { id: "itemCode", field: "itemCode" as const, hidden: false },
    { id: "quantity", field: "quantity" as const, hidden: false }
  ];
  const configured = applyGridViewPreferences(columns, {
    schemaVersion: GRID_VIEW_PREFERENCES_SCHEMA_VERSION,
    gridId,
    columns: [
      { id: "lineNumber", visible: true, order: 0 },
      { id: "quantity", visible: true, order: 1 },
      { id: "itemCode", visible: false, order: 2 }
    ]
  });

  assert.deepEqual(configured.map((column) => column.id), ["lineNumber", "quantity", "itemCode"]);
  assert.equal(configured.find((column) => column.id === "itemCode")?.hidden, true);
  assert.equal(Object.keys(configured[0]).includes("value"), false);
});

test("잘못된 visible과 order 타입은 기본 표시와 결정 가능한 순서로 복구한다", () => {
  const normalized = normalizeGridViewPreferences({
    schemaVersion: GRID_VIEW_PREFERENCES_SCHEMA_VERSION,
    gridId,
    columns: [
      { id: "itemCode", visible: "no", order: 1.5 },
      { id: "quantity", visible: null, order: -1 }
    ]
  }, gridId, definitions);

  assert.equal(normalized.columns.find((column) => column.id === "itemCode")?.visible, true);
  assert.equal(normalized.columns.find((column) => column.id === "quantity")?.visible, true);
  assert.deepEqual(normalized.columns.map((column) => column.id), ["lineNumber", "itemCode", "quantity", "remark"]);
});

test("잠금 열은 저장된 숨김과 이동 요청 이후에도 첫 위치와 표시를 유지한다", () => {
  const stored = {
    schemaVersion: GRID_VIEW_PREFERENCES_SCHEMA_VERSION,
    gridId,
    columns: [
      { id: "lineNumber", visible: false, order: 99 },
      { id: "itemCode", visible: true, order: 0 }
    ]
  };
  const normalized = normalizeGridViewPreferences(stored, gridId, definitions);
  const moved = moveGridViewColumn(normalized, gridId, definitions, "itemCode", "up");

  assert.equal(moved.columns[0].id, "lineNumber");
  assert.equal(moved.columns[0].visible, true);
});
