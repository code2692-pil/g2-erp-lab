import { useRef } from "react";
import type { CSSProperties, ReactNode } from "react";

export type ErpDataGridAlign = "left" | "center" | "right";

export interface ErpDataGridColumn<T extends object> {
  field: keyof T;
  header: ReactNode;
  width?: number | string;
  align?: ErpDataGridAlign;
  render?: (row: T) => ReactNode;
}

export interface ErpDataGridProps<T extends object> {
  columns: readonly ErpDataGridColumn<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  selectedRowKey?: string | null;
  onRowClick?: (row: T) => void;
  onRowDoubleClick?: (row: T) => void;
  emptyMessage?: string;
  ariaLabel?: string;
}

function renderDefaultValue(value: unknown): ReactNode {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Y" : "N";
  if (typeof value === "string" || typeof value === "number") return value;
  return String(value);
}

export function ErpDataGrid<T extends object>({
  columns,
  rows,
  rowKey,
  selectedRowKey = null,
  onRowClick,
  onRowDoubleClick,
  emptyMessage = "조회된 데이터가 없습니다.",
  ariaLabel = "조회 결과"
}: ErpDataGridProps<T>) {
  const rowRefs = useRef<Array<HTMLTableRowElement | null>>([]);
  const selectedRowExists = rows.some((row) => rowKey(row) === selectedRowKey);

  const focusRow = (index: number) => {
    const row = rows[index];
    if (!row) return;

    onRowClick?.(row);
    rowRefs.current[index]?.focus();
  };

  return (
    <div className="erp-data-grid">
      <div className="erp-data-grid__viewport">
        <table aria-label={ariaLabel} className="erp-data-grid__table" role="grid">
          <colgroup>
            {columns.map((column) => (
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
              {columns.map((column) => (
                <th
                  className={`erp-data-grid__header erp-data-grid__header--${column.align ?? "left"}`}
                  key={String(column.field)}
                  scope="col"
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="erp-data-grid__body">
            {rows.map((row, index) => {
              const key = rowKey(row);
              const selected = key === selectedRowKey;
              const tabbable = selected || (!selectedRowExists && index === 0);

              return (
                <tr
                  aria-selected={selected}
                  className={
                    selected
                      ? "erp-data-grid__row erp-data-grid__row--selected selected"
                      : "erp-data-grid__row"
                  }
                  data-row-key={key}
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
                      onRowClick?.(row);
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
                  {columns.map((column) => {
                    const align = column.align ?? "left";
                    return (
                      <td
                        className={`erp-data-grid__cell erp-data-grid__cell--${align}`}
                        key={String(column.field)}
                      >
                        {column.render
                          ? column.render(row)
                          : renderDefaultValue(row[column.field])}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr className="erp-data-grid__empty-row">
                <td className="erp-data-grid__empty-cell empty" colSpan={columns.length}>
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
