import { useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";

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

export interface ErpDataGridColumn<T extends object> {
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
  sum?: boolean;
  formatter?: (value: T[keyof T], row: T) => ReactNode;
  summaryFormatter?: (value: number) => ReactNode;
  validator?: (value: T[keyof T], row: T) => string | undefined;
  render?: (row: T) => ReactNode;
  editor?: (context: ErpDataGridEditorContext<T>) => ReactNode;
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
  onCheckedRowKeysChange?: (rowKeys: string[]) => void;
  onCellValueChange?: (
    row: T,
    field: keyof T,
    value: ErpDataGridCellValue
  ) => void;
  emptyMessage?: string;
  ariaLabel?: string;
  className?: string;
  dataTestId?: string;
  cellErrors?: ErpDataGridCellErrors;
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
  onCheckedRowKeysChange,
  onCellValueChange,
  emptyMessage = "조회된 데이터가 없습니다.",
  ariaLabel = "조회 결과",
  className = "",
  dataTestId,
  cellErrors
}: ErpDataGridProps<T>) {
  const [uncontrolledCheckedRowKeys, setUncontrolledCheckedRowKeys] = useState<string[]>([]);
  const rowRefs = useRef<Array<HTMLTableRowElement | null>>([]);
  const tableRef = useRef<HTMLTableElement>(null);
  const headerCheckboxRef = useRef<HTMLInputElement>(null);
  const visibleColumns = columns.filter((column) => !column.hidden);
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

  const focusEditableCell = (currentCell: HTMLTableCellElement, reverse: boolean) => {
    const editableCells = Array.from(
      tableRef.current?.querySelectorAll<HTMLTableCellElement>(
        'td[data-erp-grid-editable="true"]'
      ) ?? []
    );
    const currentIndex = editableCells.indexOf(currentCell);
    if (currentIndex === -1 || editableCells.length === 0) return;

    const nextIndex = reverse
      ? (currentIndex - 1 + editableCells.length) % editableCells.length
      : (currentIndex + 1) % editableCells.length;
    const nextEditor = editableCells[nextIndex].querySelector<HTMLElement>(
      "input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
    );
    nextEditor?.focus();
  };

  const handleTableKeyDownCapture = (event: ReactKeyboardEvent<HTMLTableElement>) => {
    if (event.key !== "Enter" && event.key !== "Tab") return;
    if (!(event.target instanceof Element)) return;

    const currentCell = event.target.closest<HTMLTableCellElement>(
      'td[data-erp-grid-editable="true"]'
    );
    if (!currentCell) return;

    event.preventDefault();
    event.stopPropagation();
    focusEditableCell(currentCell, event.key === "Tab" && event.shiftKey);
  };

  const getCellError = (row: T, column: ErpDataGridColumn<T>, rowIdentifier: string) => {
    if (cellErrors) return cellErrors[rowIdentifier]?.[String(column.field)];
    const value = row[column.field];
    if (column.required && isEmptyRequiredValue(value)) return "필수 입력 항목입니다.";
    return column.validator?.(value, row);
  };

  const renderEditor = (
    row: T,
    column: ErpDataGridColumn<T>,
    error: string | undefined,
    rowIdentifier: string
  ) => {
    const value = row[column.field];
    const onChange = (nextValue: ErpDataGridCellValue) =>
      onCellValueChange?.(row, column.field, nextValue);

    if (column.editor) return column.editor({ row, column, value, onChange });

    if (column.dataType === "boolean") {
      return (
        <input
          aria-invalid={Boolean(error)}
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
    <div className={`erp-data-grid ${className}`.trim()} data-testid={dataTestId}>
      <div className="erp-data-grid__viewport">
        <table
          aria-label={ariaLabel}
          className="erp-data-grid__table"
          onKeyDownCapture={handleTableKeyDownCapture}
          ref={tableRef}
          role="grid"
        >
          <colgroup>
            {showRowNumbers && <col className="erp-data-grid__row-number-column" />}
            {showCheckboxes && <col className="erp-data-grid__checkbox-column" />}
            {visibleColumns.map((column) => (
              <col
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
                    const error = getCellError(row, column, key);
                    const errorId = dataTestId
                      ? `${dataTestId}-error-${key}-${String(column.field)}`
                      : undefined;

                    return (
                      <td
                        aria-describedby={error ? errorId : undefined}
                        aria-invalid={Boolean(error)}
                        className={`erp-data-grid__cell erp-data-grid__cell--${align}${
                          column.readOnly ? " erp-data-grid__cell--readonly" : ""
                        }${editable ? " erp-data-grid__cell--editable" : ""}${
                          error ? " erp-data-grid__cell--invalid" : ""
                        }`}
                        data-erp-grid-editable={editable ? "true" : undefined}
                        data-testid={
                          dataTestId
                            ? `${dataTestId}-cell-container-${key}-${String(column.field)}`
                            : undefined
                        }
                        key={String(column.field)}
                        tabIndex={error && !editable ? 0 : undefined}
                        title={error}
                      >
                        {column.render
                          ? column.render(row)
                          : editable
                            ? renderEditor(row, column, error, key)
                            : column.formatter
                              ? column.formatter(row[column.field], row)
                              : renderDefaultValue(row[column.field], column.dataType ?? "text")}
                        {error && errorId && (
                          <span className="erp-data-grid__error-message" id={errorId} role="alert">
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
          <span data-testid={dataTestId ? `${dataTestId}-footer-total` : undefined}>
            전체 {numberFormatter.format(rows.length)}건
          </span>
          <span data-testid={dataTestId ? `${dataTestId}-footer-selected` : undefined}>
            선택 {numberFormatter.format(selectionCount)}건
          </span>
        </footer>
      )}
    </div>
  );
}
