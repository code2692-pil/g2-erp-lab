export const GRID_VIEW_PREFERENCES_SCHEMA_VERSION = 1;
export const GRID_VIEW_MIN_COLUMN_WIDTH = 48;
export const GRID_VIEW_MAX_COLUMN_WIDTH = 480;
const storageKeyPrefix = "g2-erp.grid-view-preferences";

export interface GridViewColumnDefinition {
  id: string;
  label: string;
  locked?: boolean;
  /** Existing Grid width used when the user has not chosen a different width. */
  defaultWidth?: number;
}

export interface GridViewPreferenceColumn {
  id: string;
  visible: boolean;
  order: number;
  /** Local display preference only. It never contains document data. */
  width?: number;
}

export interface GridViewPreferences {
  schemaVersion: number;
  gridId: string;
  columns: GridViewPreferenceColumn[];
}

export interface GridViewStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface GridViewStorageResult {
  preferences: GridViewPreferences;
  persisted: boolean;
}

interface GridColumnLike {
  id?: string;
  field: PropertyKey;
  headerName?: unknown;
  header?: unknown;
  locked?: boolean;
  hidden?: boolean;
  width?: number | string;
}

function browserStorage(): GridViewStorage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeOrder(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function defaultColumnWidth(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : undefined;
}

function normalizeColumnWidth(value: unknown, fallback: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return defaultColumnWidth(fallback);
  return Math.min(GRID_VIEW_MAX_COLUMN_WIDTH, Math.max(GRID_VIEW_MIN_COLUMN_WIDTH, Math.round(value)));
}

function withColumnWidth<T extends object>(column: T, width: number | undefined): T & { width?: number } {
  return (width === undefined ? column : { ...column, width }) as T & { width?: number };
}

function uniqueDefinitions(definitions: readonly GridViewColumnDefinition[]) {
  const ids = new Set<string>();
  return definitions.filter((definition) => {
    if (!definition.id || ids.has(definition.id)) return false;
    ids.add(definition.id);
    return true;
  });
}

export function getGridViewPreferencesStorageKey(gridId: string) {
  return `${storageKeyPrefix}.v${GRID_VIEW_PREFERENCES_SCHEMA_VERSION}.${gridId}`;
}

export function createDefaultGridViewPreferences(
  gridId: string,
  definitions: readonly GridViewColumnDefinition[]
): GridViewPreferences {
  return {
    schemaVersion: GRID_VIEW_PREFERENCES_SCHEMA_VERSION,
    gridId,
    columns: uniqueDefinitions(definitions).map((definition, order) => withColumnWidth({
      id: definition.id,
      visible: true,
      order
    }, defaultColumnWidth(definition.defaultWidth)))
  };
}

export function normalizeGridViewPreferences(
  value: unknown,
  gridId: string,
  definitions: readonly GridViewColumnDefinition[]
): GridViewPreferences {
  const safeDefinitions = uniqueDefinitions(definitions);
  const defaults = createDefaultGridViewPreferences(gridId, safeDefinitions);
  if (!isRecord(value) || value.schemaVersion !== GRID_VIEW_PREFERENCES_SCHEMA_VERSION || value.gridId !== gridId || !Array.isArray(value.columns)) {
    return defaults;
  }

  const currentIds = new Set(safeDefinitions.map((definition) => definition.id));
  const definitionsById = new Map(safeDefinitions.map((definition) => [definition.id, definition]));
  const saved = new Map<string, Pick<GridViewPreferenceColumn, "id" | "visible" | "width"> & { order?: number }>();
  for (const candidate of value.columns) {
    if (!isRecord(candidate) || typeof candidate.id !== "string" || !currentIds.has(candidate.id) || saved.has(candidate.id)) continue;
    const definition = definitionsById.get(candidate.id);
    saved.set(candidate.id, {
      id: candidate.id,
      visible: typeof candidate.visible === "boolean" ? candidate.visible : true,
      order: isSafeOrder(candidate.order) ? candidate.order : undefined,
      width: normalizeColumnWidth(candidate.width, definition?.defaultWidth)
    });
  }

  const normalized = safeDefinitions
    .map((definition, defaultOrder) => {
      const current = saved.get(definition.id);
      const width = normalizeColumnWidth(current?.width, definition.defaultWidth);
      return {
        id: definition.id,
        visible: definition.locked ? true : current?.visible ?? true,
        order: definition.locked ? -safeDefinitions.length + defaultOrder : current?.order ?? safeDefinitions.length + defaultOrder,
        defaultOrder,
        width
      };
    })
    .sort((left, right) => left.order - right.order || left.defaultOrder - right.defaultOrder)
    .map(({ id, visible, width }, order) => withColumnWidth({ id, visible, order }, width));

  if (!normalized.some((column) => column.visible) && normalized[0]) normalized[0].visible = true;
  return { schemaVersion: GRID_VIEW_PREFERENCES_SCHEMA_VERSION, gridId, columns: normalized };
}

export function loadGridViewPreferences(
  gridId: string,
  definitions: readonly GridViewColumnDefinition[],
  storage: GridViewStorage | undefined = browserStorage()
) {
  if (!storage) return createDefaultGridViewPreferences(gridId, definitions);
  try {
    const stored = storage.getItem(getGridViewPreferencesStorageKey(gridId));
    return stored === null
      ? createDefaultGridViewPreferences(gridId, definitions)
      : normalizeGridViewPreferences(JSON.parse(stored), gridId, definitions);
  } catch {
    return createDefaultGridViewPreferences(gridId, definitions);
  }
}

export function saveGridViewPreferences(
  gridId: string,
  definitions: readonly GridViewColumnDefinition[],
  preferences: unknown,
  storage: GridViewStorage | undefined = browserStorage()
): GridViewStorageResult {
  const normalized = normalizeGridViewPreferences(preferences, gridId, definitions);
  if (!storage) return { preferences: normalized, persisted: false };
  try {
    storage.setItem(getGridViewPreferencesStorageKey(gridId), JSON.stringify(normalized));
    return { preferences: normalized, persisted: true };
  } catch {
    return { preferences: normalized, persisted: false };
  }
}

export function resetGridViewPreferences(
  gridId: string,
  definitions: readonly GridViewColumnDefinition[],
  storage: GridViewStorage | undefined = browserStorage()
): GridViewStorageResult {
  const preferences = createDefaultGridViewPreferences(gridId, definitions);
  if (!storage) return { preferences, persisted: false };
  try {
    storage.removeItem(getGridViewPreferencesStorageKey(gridId));
    return { preferences, persisted: true };
  } catch {
    return { preferences, persisted: false };
  }
}

export function setGridViewColumnVisibility(
  preferences: unknown,
  gridId: string,
  definitions: readonly GridViewColumnDefinition[],
  id: string,
  visible: boolean
) {
  const normalized = normalizeGridViewPreferences(preferences, gridId, definitions);
  const locked = definitions.find((definition) => definition.id === id)?.locked;
  const next = normalized.columns.map((column) => column.id === id && !locked ? { ...column, visible } : column);
  return normalizeGridViewPreferences({ ...normalized, columns: next }, gridId, definitions);
}

export function moveGridViewColumn(
  preferences: unknown,
  gridId: string,
  definitions: readonly GridViewColumnDefinition[],
  id: string,
  direction: "up" | "down"
) {
  const normalized = normalizeGridViewPreferences(preferences, gridId, definitions);
  if (definitions.find((definition) => definition.id === id)?.locked) return normalized;
  const currentIndex = normalized.columns.findIndex((column) => column.id === id);
  const nextIndex = currentIndex + (direction === "up" ? -1 : 1);
  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= normalized.columns.length) return normalized;
  if (definitions.find((definition) => definition.id === normalized.columns[nextIndex].id)?.locked) return normalized;
  const columns = [...normalized.columns];
  [columns[currentIndex], columns[nextIndex]] = [columns[nextIndex], columns[currentIndex]];
  return normalizeGridViewPreferences(
    { ...normalized, columns: columns.map((column, order) => ({ ...column, order })) },
    gridId,
    definitions
  );
}

export function setGridViewColumnWidth(
  preferences: unknown,
  gridId: string,
  definitions: readonly GridViewColumnDefinition[],
  id: string,
  width: unknown
) {
  const normalized = normalizeGridViewPreferences(preferences, gridId, definitions);
  const definition = definitions.find((candidate) => candidate.id === id);
  if (!definition || defaultColumnWidth(definition.defaultWidth) === undefined) return normalized;
  const normalizedWidth = normalizeColumnWidth(width, definition.defaultWidth);
  const next = normalized.columns.map((column) =>
    column.id === id ? withColumnWidth(column, normalizedWidth) : column
  );
  return normalizeGridViewPreferences({ ...normalized, columns: next }, gridId, definitions);
}

export function revealGridViewColumn(
  preferences: unknown,
  gridId: string,
  definitions: readonly GridViewColumnDefinition[],
  id: string
) {
  return setGridViewColumnVisibility(preferences, gridId, definitions, id, true);
}

export function toGridViewColumnDefinitions(columns: readonly GridColumnLike[]): GridViewColumnDefinition[] {
  return uniqueDefinitions(columns.map((column) => {
    const width = defaultColumnWidth(column.width);
    return {
      id: column.id ?? String(column.field),
      label: typeof column.headerName === "string"
        ? column.headerName
        : typeof column.header === "string"
          ? column.header
          : String(column.field),
      locked: column.locked,
      ...(width === undefined ? {} : { defaultWidth: width })
    };
  }));
}

export function applyGridViewPreferences<T extends GridColumnLike>(
  columns: readonly T[],
  preferences: GridViewPreferences
): T[] {
  const saved = new Map(preferences.columns.map((column) => [column.id, column]));
  return columns
    .map((column, defaultOrder) => {
      const savedColumn = saved.get(column.id ?? String(column.field));
      return {
        column: {
          ...column,
          hidden: Boolean(column.hidden) || savedColumn?.visible === false,
          ...(savedColumn?.width === undefined ? {} : { width: savedColumn.width })
        },
        order: savedColumn?.order ?? Number.MAX_SAFE_INTEGER,
        defaultOrder
      };
    })
    .sort((left, right) => left.order - right.order || left.defaultOrder - right.defaultOrder)
    .map(({ column }) => column);
}
