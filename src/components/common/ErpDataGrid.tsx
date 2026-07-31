import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ClipboardEvent as ReactClipboardEvent, CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { parseErpGridPasteMatrix } from "./erpGridPaste";
import { GridViewSettingsDialog } from "./GridViewSettingsDialog";
import {
  applyGridViewPreferences,
  loadGridViewPreferences,
  normalizeGridViewPreferences,
  resetGridViewPreferences,
  revealGridViewColumn,
  saveGridViewPreferences,
  toGridViewColumnDefinitions,
  type GridViewPreferences
} from "./gridViewPreferences";
import { useConfirm } from "../../hooks/useConfirm";
import { useNotification } from "../../hooks/useNotification";

export type ErpDataGridAlign = "left" | "center" | "right";
export type ErpDataGridDataType = "text" | "number" | "date" | "code" | "boolean";
export type ErpDataGridSelectionMode = "none" | "single" | "multiple";
export type ErpDataGridCellValue = string | number | boolean | null;
export type ErpDataGridCellErrors = Readonly<Record<string, Readonly<Record<string, string>>>>;

export interface ErpDataGridEditorContext<T extends object> {
  row: T;
  column: ErpDataGridColumn<T>;
  value: T[keyof T];
  onChange: (value: ErpDataGridCellValue) => void;
}

export interface ErpDataGridPasteRequest<T extends object> {
  startRowIndex: number;
  matrix: string[][];
  columns: readonly ErpDataGridColumn<T>[];
}

export interface ErpDataGridFocusRequest {
  rowKey: string;
  /** When omitted, the first editable cell in the requested row receives focus. */
  field?: string;
  requestId: number;
}

type ErpDataGridPasteHandler = (request: ErpDataGridPasteRequest<object>) => { error?: string } | void;
interface ErpDataGridPasteRegistration {
  handler: ErpDataGridPasteHandler;
  onError?: (message: string) => void;
}
const pasteHandlerStore = globalThis as typeof globalThis & {
  __erpDataGridPasteHandlers?: Map<string, ErpDataGridPasteRegistration>;
};
const registeredPasteHandlers = pasteHandlerStore.__erpDataGridPasteHandlers ??= new Map<string, ErpDataGridPasteRegistration>();

interface GridViewSettingsDefinition {
  gridId: string;
  title: string;
  lockedFields: readonly string[];
}

const gridViewSettingsByDataTestId: Record<string, GridViewSettingsDefinition> = {
  "sales-order-line-grid": { gridId: "sales-order-lines", title: "수주상세 Grid 보기 설정", lockedFields: ["NO_LINE"] },
  "purchase-line-grid": { gridId: "purchase-order-lines", title: "발주상세 Grid 보기 설정", lockedFields: ["NO_LINE"] },
  "work-order-process-grid": { gridId: "work-order-lines", title: "공정상세 Grid 보기 설정", lockedFields: ["NO_PROC"] }
};

export function registerErpDataGridPasteHandler<T extends object>(
  dataTestId: string,
  handler: (request: ErpDataGridPasteRequest<T>) => { error?: string } | void,
  onError?: (message: string) => void
) {
  const registration = { handler: handler as unknown as ErpDataGridPasteHandler, onError };
  registeredPasteHandlers.set(dataTestId, registration);
  return () => {
    if (registeredPasteHandlers.get(dataTestId) === registration) registeredPasteHandlers.delete(dataTestId);
  };
}

export interface ErpDataGridColumn<T extends object> {
  /** Stable UI preference identifier. It must not be derived from a display label or position. */
  id?: string;
  field: keyof T;
  headerName?: ReactNode;
  header?: ReactNode;
  width?: number | string;
  align?: ErpDataGridAlign;
  editable?: boolean;
  readOnly?: boolean;
  dataType?: ErpDataGridDataType;
  required?: boolean;
  hidden?: boolean;
  /** A structural column that remains visible and cannot be moved by Grid view preferences. */
  locked?: boolean;
  sum?: boolean;
  formatter?: (value: T[keyof T], row: T) => ReactNode;
  summaryFormatter?: (value: number) => ReactNode;
  validator?: (value: T[keyof T], row: T) => string | undefined;
  render?: (row: T) => ReactNode;
  editor?: (context: ErpDataGridEditorContext<T>) => ReactNode;
  /** Opens the existing lookup dialog when this editable cell is double-clicked. */
  lookup?: {
    instruction: string;
  };
}

export interface ErpDataGridProps<T extends object> {
  columns: readonly ErpDataGridColumn<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  selectedRowKey?: string | null;
  checkedRowKeys?: readonly string[];
  selectionMode?: ErpDataGridSelectionMode;
  showRowNumbers?: boolean;
  showCheckboxes?: boolean;
  showFooter?: boolean;
  onRowClick?: (row: T) => void;
  onRowDoubleClick?: (row: T) => void;
  onLookupCellDoubleClick?: (row: T, column: ErpDataGridColumn<T>) => void;
  lookupDisabled?: boolean;
  onCheckedRowKeysChange?: (rowKeys: string[]) => void;
  onCellValueChange?: (
    row: T,
    field: keyof T,
    value: ErpDataGridCellValue
  ) => void;
  onPaste?: (request: ErpDataGridPasteRequest<T>) => { error?: string } | void;
  onPasteError?: (message: string) => void;
  emptyMessage?: string;
  ariaLabel?: string;
  className?: string;
  dataTestId?: string;
  cellErrors?: ErpDataGridCellErrors;
  /** Opt-in keyboard flow for editable detail grids only. */
  keyboardNavigation?: boolean;
  focusRequest?: ErpDataGridFocusRequest | null;
  /** Lets a parent restore a hidden validation field without changing business data. */
  onHiddenColumnError?: (columnId: string) => void;
}

const numberFormatter = new Intl.NumberFormat("ko-KR");

function renderDefaultValue(value: unknown, dataType: ErpDataGridDataType): ReactNode {
  if (value === null || value === undefined) return "";
  if (dataType === "boolean") return value ? "Y" : "N";
  if (dataType === "number" && typeof value === "number") return numberFormatter.format(value);
  if (typeof value === "string" || typeof value === "number") return value;
  return String(value);
}

function isEmptyRequiredValue(value: unknown) {
  return value === null || value === undefined || (typeof value === "string" && !value.trim());
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function ErpDataGrid<T extends object>({
  columns,
  rows,
  rowKey,
  selectedRowKey = null,
  checkedRowKeys,
  selectionMode = "single",
  showRowNumbers = false,
  showCheckboxes = false,
  showFooter = true,
  onRowClick,
  onRowDoubleClick,
  onLookupCellDoubleClick,
  lookupDisabled = false,
  onCheckedRowKeysChange,
  onCellValueChange,
  onPaste,
  onPasteError,
  emptyMessage = "조회된 데이터가 없습니다.",
  ariaLabel = "조회 결과",
  className = "",
  dataTestId,
  cellErrors,
  keyboardNavigation = false,
  focusRequest = null,
  onHiddenColumnError
}: ErpDataGridProps<T>) {
  const [uncontrolledCheckedRowKeys, setUncontrolledCheckedRowKeys] = useState<string[]>([]);
  const rowRefs = useRef<Array<HTMLTableRowElement | null>>([]);
  const tableRef = useRef<HTMLTableElement>(null);
  const headerCheckboxRef = useRef<HTMLInputElement>(null);
  const previousVisibleRowKeySetRef = useRef<Set<string> | null>(null);
  const pendingPasteFocusRef = useRef<{ rowIndex: number; field: string } | null>(null);
  const pendingPasteStartRowIndexRef = useRef<number | null>(null);
  const lastFocusedCellRef = useRef<{ rowKey: string; field: string } | null>(null);
  const modifierPasteHeldRef = useRef(false);
  const gridViewSettings = dataTestId ? gridViewSettingsByDataTestId[dataTestId] : undefined;
  const gridViewDefinitions = gridViewSettings
    ? toGridViewColumnDefinitions(columns).map((definition) => ({ ...definition, locked: gridViewSettings.lockedFields.includes(definition.id) }))
    : [];
  const gridViewDefinitionSignature = gridViewDefinitions.map((definition) => `${definition.id}:${definition.locked ? "locked" : "open"}:${definition.defaultWidth ?? "auto"}`).join("|");
  const [gridViewPreferences, setGridViewPreferences] = useState<GridViewPreferences | null>(null);
  const [gridViewSettingsOpen, setGridViewSettingsOpen] = useState(false);
  const { confirm } = useConfirm();
  const { notify } = useNotification();
  const keyboardNavigationEnabled = keyboardNavigation || dataTestId === "purchase-line-grid" || dataTestId === "work-order-process-grid";
  const effectiveGridViewPreferences = gridViewSettings
    ? normalizeGridViewPreferences(gridViewPreferences, gridViewSettings.gridId, gridViewDefinitions)
    : null;
  const configuredColumns = effectiveGridViewPreferences
    ? applyGridViewPreferences(columns, effectiveGridViewPreferences)
    : [...columns];
  const visibleColumns = configuredColumns.filter((column) => !column.hidden);
  const visibleColumnSignature = visibleColumns.map((column) => `${column.id ?? String(column.field)}:${String(column.field)}`).join("|");
  const visibleRowKeys = rows.map(rowKey);
  const visibleRowKeySet = new Set(visibleRowKeys);
  const sourceCheckedRowKeys = checkedRowKeys ?? uncontrolledCheckedRowKeys;
  const visibleCheckedRowKeys = sourceCheckedRowKeys.filter((key) => visibleRowKeySet.has(key));
  const checkedRowKeySet = new Set(visibleCheckedRowKeys);
  const selectedRowExists = rows.some((row) => rowKey(row) === selectedRowKey);
  const allRowsChecked = rows.length > 0 && visibleCheckedRowKeys.length === rows.length;
  const hasPartiallyCheckedRows = visibleCheckedRowKeys.length > 0 && !allRowsChecked;
  const selectionCount = showCheckboxes
    ? visibleCheckedRowKeys.length
    : selectedRowExists
      ? 1
      : 0;
  const sumColumns = visibleColumns.filter((column) => column.sum);
  const selectedDocumentNumber = dataTestId?.endsWith("-header-grid") && selectedRowKey
    ? selectedRowKey.split("::").at(-1)
    : null;

  useEffect(() => {
    if (!gridViewSettings) return;
    setGridViewPreferences(loadGridViewPreferences(gridViewSettings.gridId, gridViewDefinitions));
  }, [gridViewDefinitionSignature, gridViewSettings?.gridId]);

  const applyGridViewSettings = (nextPreferences: GridViewPreferences) => {
    if (!gridViewSettings) return;
    const saved = saveGridViewPreferences(gridViewSettings.gridId, gridViewDefinitions, nextPreferences);
    setGridViewPreferences(saved.preferences);
    setGridViewSettingsOpen(false);
    notify(saved.persisted ? "success" : "warning", saved.persisted ? "Grid 보기 설정을 적용했습니다." : "보기 설정은 현재 화면에 적용되었습니다.");
  };

  const resetGridViewSettings = async () => {
    if (!gridViewSettings) return;
    const accepted = await confirm({
      title: "Grid 보기 설정 초기화",
      message: `${gridViewSettings.title}의 열 표시와 순서를 기본값으로 되돌리시겠습니까?`,
      description: "행 데이터와 입력값은 변경되지 않습니다.",
      confirmLabel: "기본값으로 초기화"
    });
    if (!accepted) return;
    const reset = resetGridViewPreferences(gridViewSettings.gridId, gridViewDefinitions);
    setGridViewPreferences(reset.preferences);
    notify(reset.persisted ? "success" : "warning", reset.persisted ? "Grid 보기 설정을 기본값으로 초기화했습니다." : "보기 설정을 기본값으로 적용했습니다.");
  };

  const revealHiddenColumnForValidation = (columnId: string) => {
    if (!gridViewSettings) {
      onHiddenColumnError?.(columnId);
      return;
    }
    setGridViewPreferences((current) => {
      const currentPreferences = normalizeGridViewPreferences(current, gridViewSettings.gridId, gridViewDefinitions);
      const nextPreferences = revealGridViewColumn(currentPreferences, gridViewSettings.gridId, gridViewDefinitions, columnId);
      if (currentPreferences.columns.every((column, index) => column.visible === nextPreferences.columns[index]?.visible && column.order === nextPreferences.columns[index]?.order)) return currentPreferences;
      return saveGridViewPreferences(gridViewSettings.gridId, gridViewDefinitions, nextPreferences).preferences;
    });
  };

  useEffect(() => {
    if (headerCheckboxRef.current) headerCheckboxRef.current.indeterminate = hasPartiallyCheckedRows;
  }, [hasPartiallyCheckedRows]);

  const updateCheckedRowKeys = (nextKeys: string[]) => {
    if (checkedRowKeys === undefined) setUncontrolledCheckedRowKeys(nextKeys);
    onCheckedRowKeysChange?.(nextKeys);
  };

  const toggleRowChecked = (row: T) => {
    if (selectionMode === "none") return;

    const key = rowKey(row);
    const checked = sourceCheckedRowKeys.includes(key);
    const nextKeys =
      selectionMode === "single"
        ? checked
          ? []
          : [key]
        : checked
          ? sourceCheckedRowKeys.filter((currentKey) => currentKey !== key)
          : [...sourceCheckedRowKeys, key];

    updateCheckedRowKeys(nextKeys);
    onRowClick?.(row);
  };

  const toggleAllRowsChecked = () => {
    if (selectionMode !== "multiple") return;

    const remainingKeys = sourceCheckedRowKeys.filter((key) => !visibleRowKeySet.has(key));
    updateCheckedRowKeys(allRowsChecked ? remainingKeys : [...remainingKeys, ...visibleRowKeys]);
  };

  const focusRow = (index: number) => {
    const row = rows[index];
    if (!row) return;

    onRowClick?.(row);
    rowRefs.current[index]?.focus();
  };

  const editableColumnKeys = visibleColumns
    .filter((column) => column.editable && !column.readOnly)
    .map((column) => String(column.field));

  const getEditor = (rowIdentifier: string, field: string) => {
    const row = Array.from(tableRef.current?.querySelectorAll<HTMLTableRowElement>("tbody tr[data-row-key]") ?? [])
      .find((candidate) => candidate.dataset.rowKey === rowIdentifier);
    const cell = Array.from(row?.querySelectorAll<HTMLTableCellElement>('td[data-erp-grid-field]') ?? [])
      .find((candidate) => candidate.dataset.erpGridField === field);
    const editor = cell?.querySelector<HTMLElement>(
      "input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
    );
    return { cell, editor };
  };

  const focusGridCell = (rowIdentifier: string, preferredField?: string) => {
    const fields = preferredField ? [preferredField] : editableColumnKeys;
    for (const field of fields) {
      const { editor } = getEditor(rowIdentifier, field);
      if (editor) {
        editor.focus();
        return true;
      }
    }
    return false;
  };

  const focusPendingPasteCell = () => {
    const pendingFocus = pendingPasteFocusRef.current;
    pendingPasteFocusRef.current = null;
    if (!pendingFocus) return;
    window.requestAnimationFrame(() => {
      const pastedRow = Array.from(tableRef.current?.querySelectorAll<HTMLTableRowElement>("tbody tr[data-row-key]") ?? [])[pendingFocus.rowIndex];
      if (pastedRow?.dataset.rowKey) focusGridCell(pastedRow.dataset.rowKey, pendingFocus.field);
    });
  };

  useLayoutEffect(() => {
    if (!focusRequest) return;
    focusGridCell(focusRequest.rowKey, focusRequest.field);
  }, [focusRequest?.requestId, visibleColumnSignature]);

  useLayoutEffect(() => {
    const lastFocused = lastFocusedCellRef.current;
    if (!lastFocused || visibleColumns.some((column) => String(column.field) === lastFocused.field)) return;
    focusGridCell(lastFocused.rowKey);
  }, [visibleColumnSignature]);

  useLayoutEffect(() => {
    if (!cellErrors) return;
    const hiddenColumnWithError = configuredColumns.find((column) =>
      column.hidden && Object.values(cellErrors).some((rowErrors) => Boolean(rowErrors[String(column.field)]))
    );
    if (hiddenColumnWithError) revealHiddenColumnForValidation(hiddenColumnWithError.id ?? String(hiddenColumnWithError.field));
  }, [cellErrors, configuredColumns, onHiddenColumnError]);

  useLayoutEffect(() => {
    const previousKeys = previousVisibleRowKeySetRef.current;
    const nextKeys = new Set(visibleRowKeys);
    previousVisibleRowKeySetRef.current = nextKeys;
    if (!keyboardNavigationEnabled || !previousKeys || !selectedRowKey) return;

    const addedSelectedRowKey = visibleRowKeys.find(
      (candidateKey) => candidateKey === selectedRowKey && !previousKeys.has(candidateKey)
    );
    if (addedSelectedRowKey) focusGridCell(addedSelectedRowKey);
  }, [keyboardNavigationEnabled, selectedRowKey, visibleRowKeys]);

  const findVerticalCell = (rowIndex: number, field: string, reverse: boolean) => {
    for (
      let candidateIndex = rowIndex + (reverse ? -1 : 1);
      candidateIndex >= 0 && candidateIndex < rows.length;
      candidateIndex += reverse ? -1 : 1
    ) {
      const candidateKey = rowKey(rows[candidateIndex]);
      if (getEditor(candidateKey, field).editor) return { rowIndex: candidateIndex, field };
    }
    return null;
  };

  const findHorizontalCell = (rowIndex: number, field: string, reverse: boolean) => {
    const columnIndex = editableColumnKeys.indexOf(field);
    if (columnIndex === -1) return null;

    for (
      let candidateColumnIndex = columnIndex + (reverse ? -1 : 1);
      candidateColumnIndex >= 0 && candidateColumnIndex < editableColumnKeys.length;
      candidateColumnIndex += reverse ? -1 : 1
    ) {
      const candidateField = editableColumnKeys[candidateColumnIndex];
      if (getEditor(rowKey(rows[rowIndex]), candidateField).editor) {
        return { rowIndex, field: candidateField };
      }
    }

    for (
      let candidateRowIndex = rowIndex + (reverse ? -1 : 1);
      candidateRowIndex >= 0 && candidateRowIndex < rows.length;
      candidateRowIndex += reverse ? -1 : 1
    ) {
      const fields = reverse ? [...editableColumnKeys].reverse() : editableColumnKeys;
      for (const candidateField of fields) {
        if (getEditor(rowKey(rows[candidateRowIndex]), candidateField).editor) {
          return { rowIndex: candidateRowIndex, field: candidateField };
        }
      }
    }
    return null;
  };

  const handleTableKeyDownCapture = (event: ReactKeyboardEvent<HTMLTableElement>) => {
    if (event.key === "Control" || event.key === "Meta") {
      modifierPasteHeldRef.current = true;
      return;
    }
    if (!keyboardNavigationEnabled || (event.key !== "Enter" && event.key !== "Tab")) return;
    if (
      event.ctrlKey || event.altKey || event.metaKey || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229
    ) return;
    if (!(event.target instanceof Element)) return;

    const currentCell = event.target.closest<HTMLTableCellElement>(
      'td[data-erp-grid-editable="true"]'
    );
    const currentRow = currentCell?.closest<HTMLTableRowElement>("tr[data-row-key]");
    const rowIdentifier = currentRow?.dataset.rowKey;
    const field = currentCell?.dataset.erpGridField;
    if (!currentCell || !rowIdentifier || !field) return;

    const rowIndex = rows.findIndex((row) => rowKey(row) === rowIdentifier);
    if (rowIndex < 0) return;
    const currentEditor = getEditor(rowIdentifier, field).editor;
    if (currentCell.getAttribute("aria-invalid") === "true" || currentEditor?.getAttribute("aria-invalid") === "true") return;

    const nextCell = event.key === "Enter"
      ? findVerticalCell(rowIndex, field, event.shiftKey)
      : findHorizontalCell(rowIndex, field, event.shiftKey);
    if (!nextCell) return;

    event.preventDefault();
    event.stopPropagation();
    const nextRow = rows[nextCell.rowIndex];
    if (nextCell.rowIndex !== rowIndex) onRowClick?.(nextRow);
    focusGridCell(rowKey(nextRow), nextCell.field);
  };

  const handlePasteCapture = (event: ReactClipboardEvent<HTMLTableElement>) => {
    const pasteRegistration = dataTestId ? registeredPasteHandlers.get(dataTestId) : undefined;
    const pasteHandler = onPaste ?? pasteRegistration?.handler as ((request: ErpDataGridPasteRequest<T>) => { error?: string } | void) | undefined;
    const reportPasteError = onPasteError ?? pasteRegistration?.onError;
    if (!pasteHandler || !(event.target instanceof Element)) return;

    const cell = event.target.closest<HTMLTableCellElement>('td[data-erp-grid-field]');
    const row = event.target.closest<HTMLTableRowElement>('tr[data-row-key]');
    if (!cell || !row) return;

    const startRowIndex = rows.findIndex((candidate) => rowKey(candidate) === row.dataset.rowKey);
    const startColumnIndex = visibleColumns.findIndex((column) => String(column.field) === cell.dataset.erpGridField);
    if (startRowIndex < 0 || startColumnIndex < 0) return;

    const isModifierPaste = modifierPasteHeldRef.current;
    const pasteStartRowIndex = isModifierPaste
      ? pendingPasteStartRowIndexRef.current ?? startRowIndex
      : startRowIndex;
    if (isModifierPaste) pendingPasteStartRowIndexRef.current = pasteStartRowIndex;

    event.preventDefault();
    let matrix: string[][];
    try {
      matrix = parseErpGridPasteMatrix(event.clipboardData.getData("text/plain")).rows;
    } catch (error) {
      reportPasteError?.(`붙여넣기 실패: ${error instanceof Error ? error.message : "데이터를 읽을 수 없습니다."}`);
      return;
    }

    const targetColumns = visibleColumns.slice(startColumnIndex, startColumnIndex + matrix[0].length);
    if (targetColumns.length !== matrix[0].length) {
      reportPasteError?.("붙여넣기 실패: 현재 Grid의 마지막 열을 넘어갑니다.");
      return;
    }
    const blockedColumn = targetColumns.find((column) => !column.editable || column.readOnly);
    if (blockedColumn) {
      reportPasteError?.(`붙여넣기 실패: ${String(blockedColumn.headerName ?? blockedColumn.field)} 열은 수정할 수 없습니다.`);
      return;
    }

    const result = pasteHandler({ startRowIndex: pasteStartRowIndex, matrix, columns: targetColumns });
    if (result?.error) reportPasteError?.(`붙여넣기 실패: ${result.error}`);
    if (!result?.error) {
      pendingPasteFocusRef.current = {
        rowIndex: pasteStartRowIndex + matrix.length - 1,
        field: String(targetColumns.at(-1)?.field)
      };
      if (!isModifierPaste) focusPendingPasteCell();
    }
  };

  const getCellError = (row: T, column: ErpDataGridColumn<T>, rowIdentifier: string) => {
    if (!column.editable || column.readOnly) return undefined;
    if (cellErrors) return cellErrors[rowIdentifier]?.[String(column.field)];
    const value = row[column.field];
    if (column.required && isEmptyRequiredValue(value)) return "필수 입력 항목입니다.";
    return column.validator?.(value, row);
  };

  const renderEditor = (
    row: T,
    column: ErpDataGridColumn<T>,
    error: string | undefined,
    rowIdentifier: string,
    errorId: string | undefined
  ) => {
    const value = row[column.field];
    const onChange = (nextValue: ErpDataGridCellValue) =>
      onCellValueChange?.(row, column.field, nextValue);

    if (column.editor) return column.editor({ row, column, value, onChange });

    if (column.dataType === "boolean") {
      return (
        <input
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          checked={Boolean(value)}
          className="erp-data-grid__editor erp-data-grid__editor--boolean"
          data-erp-grid-editor="true"
          data-testid={dataTestId ? `${dataTestId}-cell-${rowIdentifier}-${String(column.field)}` : undefined}
          onChange={(event) => onChange(event.currentTarget.checked)}
          type="checkbox"
        />
      );
    }

    return (
      <input
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        className={`erp-data-grid__editor${column.dataType === "number" ? " num" : ""}${
          column.dataType === "code" ? " mono" : ""
        }`}
        data-erp-grid-editor="true"
        data-testid={dataTestId ? `${dataTestId}-cell-${rowIdentifier}-${String(column.field)}` : undefined}
        min={column.dataType === "number" ? "0" : undefined}
        onChange={(event) => onChange(event.currentTarget.value)}
        onFocus={(event) => {
          if (column.dataType === "number") event.currentTarget.select();
        }}
        type={column.dataType === "date" ? "date" : column.dataType === "number" ? "number" : "text"}
        value={value === null || value === undefined ? "" : String(value)}
      />
    );
  };

  return (
    <div className={`erp-data-grid${gridViewSettings ? " erp-data-grid--with-view-settings" : ""} ${className}`.trim()} data-testid={dataTestId}>
      {gridViewSettings && effectiveGridViewPreferences && (
        <div className="erp-data-grid__view-settings">
          <button data-testid={`${dataTestId}-view-settings`} onClick={() => setGridViewSettingsOpen(true)} type="button">보기 설정</button>
        </div>
      )}
      <div className="erp-data-grid__viewport">
        <table
          aria-label={ariaLabel}
          className="erp-data-grid__table"
          onKeyDownCapture={handleTableKeyDownCapture}
          onFocusCapture={(event) => {
            if (!(event.target instanceof Element)) return;
            const cell = event.target.closest<HTMLTableCellElement>('td[data-erp-grid-field]');
            const row = cell?.closest<HTMLTableRowElement>('tr[data-row-key]');
            if (cell?.dataset.erpGridField && row?.dataset.rowKey) {
              lastFocusedCellRef.current = { field: cell.dataset.erpGridField, rowKey: row.dataset.rowKey };
            }
          }}
          onKeyUpCapture={(event) => {
            if (event.key === "Control" || event.key === "Meta") {
              modifierPasteHeldRef.current = false;
              pendingPasteStartRowIndexRef.current = null;
              focusPendingPasteCell();
            }
          }}
          onPasteCapture={handlePasteCapture}
          ref={tableRef}
          role="grid"
        >
          <colgroup>
            {showRowNumbers && <col className="erp-data-grid__row-number-column" />}
            {showCheckboxes && <col className="erp-data-grid__checkbox-column" />}
            {visibleColumns.map((column) => (
              <col
                data-testid={dataTestId ? `${dataTestId}-column-${String(column.id ?? column.field)}` : undefined}
                key={String(column.field)}
                style={
                  column.width === undefined
                    ? undefined
                    : ({ width: column.width } satisfies CSSProperties)
                }
              />
            ))}
          </colgroup>
          <thead className="erp-data-grid__head">
            <tr>
              {showRowNumbers && <th className="erp-data-grid__row-number-header">No.</th>}
              {showCheckboxes && (
                <th className="erp-data-grid__checkbox-header">
                  {selectionMode === "multiple" && (
                    <input
                      aria-label="전체 행 선택 또는 해제"
                      checked={allRowsChecked}
                      data-testid={dataTestId ? `${dataTestId}-select-all` : undefined}
                      onChange={toggleAllRowsChecked}
                      ref={headerCheckboxRef}
                      type="checkbox"
                    />
                  )}
                </th>
              )}
              {visibleColumns.map((column) => (
                <th
                  className={`erp-data-grid__header erp-data-grid__header--${column.align ?? "left"}`}
                  key={String(column.field)}
                  scope="col"
                >
                  {column.headerName ?? column.header ?? String(column.field)}
                  {column.required && <span className="erp-data-grid__required-mark">*</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="erp-data-grid__body">
            {rows.map((row, index) => {
              const key = rowKey(row);
              const selected = key === selectedRowKey;
              const checked = checkedRowKeySet.has(key);
              const tabbable = selected || (!selectedRowExists && index === 0);

              return (
                <tr
                  aria-selected={selected}
                  className={`erp-data-grid__row${selected ? " erp-data-grid__row--selected selected" : ""}${
                    checked ? " erp-data-grid__row--checked" : ""
                  }`}
                  data-row-key={key}
                  data-testid={dataTestId ? `${dataTestId}-row-${key}` : undefined}
                  key={key}
                  onClick={() => onRowClick?.(row)}
                  onDoubleClick={() => onRowDoubleClick?.(row)}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      focusRow(Math.min(index + 1, rows.length - 1));
                    } else if (event.key === "ArrowUp") {
                      event.preventDefault();
                      focusRow(Math.max(index - 1, 0));
                    } else if (event.key === "Home") {
                      event.preventDefault();
                      focusRow(0);
                    } else if (event.key === "End") {
                      event.preventDefault();
                      focusRow(rows.length - 1);
                    } else if (event.key === " ") {
                      event.preventDefault();
                      if (showCheckboxes) toggleRowChecked(row);
                      else onRowClick?.(row);
                    } else if (event.key === "Enter") {
                      event.preventDefault();
                      event.stopPropagation();
                      if (onRowDoubleClick) onRowDoubleClick(row);
                      else onRowClick?.(row);
                    }
                  }}
                  ref={(element) => {
                    rowRefs.current[index] = element;
                  }}
                  tabIndex={tabbable ? 0 : -1}
                >
                  {showRowNumbers && <td className="erp-data-grid__row-number-cell">{index + 1}</td>}
                  {showCheckboxes && (
                    <td className="erp-data-grid__checkbox-cell">
                      <input
                        aria-label={`${index + 1}번 행 선택`}
                        checked={checked}
                        data-testid={dataTestId ? `${dataTestId}-checkbox-${key}` : undefined}
                        onChange={() => toggleRowChecked(row)}
                        onClick={(event) => event.stopPropagation()}
                        type="checkbox"
                      />
                    </td>
                  )}
                  {visibleColumns.map((column) => {
                    const align = column.align ?? (column.dataType === "number" ? "right" : "left");
                    const editable = Boolean(column.editable) && !column.readOnly;
                    const canOpenLookup = editable && Boolean(column.lookup) && !lookupDisabled;
                    const error = getCellError(row, column, key);
                    const errorId = dataTestId
                      ? `${dataTestId}-error-${key}-${String(column.field)}`
                      : undefined;

                    return (
                      <td
                        aria-describedby={error ? errorId : undefined}
                        aria-invalid={Boolean(error)}
                        aria-readonly={column.readOnly || undefined}
                        className={`erp-data-grid__cell erp-data-grid__cell--${align}${
                          column.readOnly ? " erp-data-grid__cell--readonly" : ""
                        }${editable ? " erp-data-grid__cell--editable" : ""}${
                          canOpenLookup ? " erp-data-grid__cell--lookup" : ""
                        }${
                          error ? " erp-data-grid__cell--invalid" : ""
                        }`}
                        data-erp-grid-editable={editable ? "true" : undefined}
                        data-erp-grid-field={String(column.field)}
                        data-erp-grid-row-key={key}
                        data-erp-grid-cell-state={
                          error ? "error" : column.readOnly ? "readonly" : editable ? "editable" : undefined
                        }
                        data-validation-state={error ? "error" : undefined}
                        data-testid={
                          dataTestId
                            ? `${dataTestId}-cell-container-${key}-${String(column.field)}`
                            : undefined
                        }
                        key={String(column.field)}
                        onDoubleClick={(event) => {
                          if (!canOpenLookup) return;
                          event.stopPropagation();
                          onLookupCellDoubleClick?.(row, column);
                        }}
                        tabIndex={error && !editable ? 0 : undefined}
                        title={error ?? column.lookup?.instruction}
                      >
                        {column.render
                          ? column.render(row)
                          : editable
                            ? renderEditor(row, column, error, key, errorId)
                            : column.formatter
                              ? column.formatter(row[column.field], row)
                              : renderDefaultValue(row[column.field], column.dataType ?? "text")}
                        {error && errorId && (
                          <span className="erp-data-grid__error-message" id={errorId}>
                            {error}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr className="erp-data-grid__empty-row">
                <td
                  className="erp-data-grid__empty-cell empty"
                  colSpan={visibleColumns.length + Number(showRowNumbers) + Number(showCheckboxes)}
                >
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
          {sumColumns.length > 0 && (
            <tfoot className="erp-data-grid__foot">
              <tr>
                {showRowNumbers && <td className="erp-data-grid__row-number-cell">합계</td>}
                {showCheckboxes && <td className="erp-data-grid__checkbox-cell" />}
                {visibleColumns.map((column, index) => {
                  const sum = column.sum
                    ? rows.reduce((total, row) => total + toNumber(row[column.field]), 0)
                    : undefined;
                  const align = column.align ?? (column.dataType === "number" ? "right" : "left");

                  return (
                    <td
                      className={`erp-data-grid__summary-cell erp-data-grid__cell--${align}`}
                      data-testid={dataTestId ? `${dataTestId}-summary-${String(column.field)}` : undefined}
                      key={String(column.field)}
                    >
                      {sum === undefined
                        ? index === 0 && !showRowNumbers
                          ? "합계"
                          : ""
                        : column.summaryFormatter
                          ? column.summaryFormatter(sum)
                          : numberFormatter.format(sum)}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {showFooter && (
        <footer className="erp-data-grid__status-bar">
          {selectedDocumentNumber && <span className="erp-data-grid__document-status" data-testid={`${dataTestId}-selected-document`}>선택 문서 {selectedDocumentNumber}</span>}
          <span data-testid={dataTestId ? `${dataTestId}-footer-total` : undefined}>
            <span data-testid={dataTestId ? `${dataTestId}-total-count` : undefined}>전체 {numberFormatter.format(rows.length)}건</span>
          </span>
          {selectionCount > 0 && <span className="erp-data-grid__selection-status" data-testid={dataTestId ? `${dataTestId}-footer-selected` : undefined}><span data-testid={dataTestId ? `${dataTestId}-selected-count` : undefined}>선택 {numberFormatter.format(selectionCount)}건</span></span>}
        </footer>
      )}
      {gridViewSettings && effectiveGridViewPreferences && dataTestId && (
        <GridViewSettingsDialog
          columns={gridViewDefinitions}
          dataTestId={`${dataTestId}-view-settings-dialog`}
          gridId={gridViewSettings.gridId}
          onApply={applyGridViewSettings}
          onClose={() => setGridViewSettingsOpen(false)}
          onReset={() => void resetGridViewSettings()}
          open={gridViewSettingsOpen}
          preferences={effectiveGridViewPreferences}
          title={gridViewSettings.title}
        />
      )}
    </div>
  );
}
