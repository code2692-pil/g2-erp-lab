import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { ErpDataGrid } from "./ErpDataGrid";
import type { ErpDataGridColumn } from "./ErpDataGrid";
import { ErpDialog } from "./ErpDialog";

export interface ErpLookupDialogProps<T extends object> {
  open: boolean;
  title: string;
  columns: readonly ErpDataGridColumn<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  searchFields: readonly (keyof T)[];
  selectedRowKey?: string | null;
  onSelect: (row: T) => void;
  onClose: () => void;
  emptyMessage?: string;
  width?: number | string;
  height?: number | string;
  dataTestId?: string;
}

function normalizeSearchValue(value: unknown) {
  return String(value ?? "").trim().toLocaleLowerCase();
}

function matchesSearch<T extends object>(
  row: T,
  searchFields: readonly (keyof T)[],
  query: string
) {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) return true;

  return searchFields.some((field) =>
    normalizeSearchValue(row[field]).includes(normalizedQuery)
  );
}

export function ErpLookupDialog<T extends object>({
  open,
  title,
  columns,
  rows,
  rowKey,
  searchFields,
  selectedRowKey = null,
  onSelect,
  onClose,
  emptyMessage = "조회된 데이터가 없습니다.",
  width = 760,
  height = 520,
  dataTestId
}: ErpLookupDialogProps<T>) {
  const [searchText, setSearchText] = useState("");
  const [appliedSearchText, setAppliedSearchText] = useState("");
  const [activeRowKey, setActiveRowKey] = useState<string | null>(selectedRowKey);
  const [notice, setNotice] = useState("");
  const searchInputId = useId();
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setSearchText("");
    setAppliedSearchText("");
    setNotice("");
    searchInputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (open) setActiveRowKey(selectedRowKey);
  }, [open, selectedRowKey]);

  const filteredRows = useMemo(
    () => rows.filter((row) => matchesSearch(row, searchFields, appliedSearchText)),
    [appliedSearchText, rows, searchFields]
  );

  const selectedRow = useMemo(
    () => filteredRows.find((row) => rowKey(row) === activeRowKey),
    [activeRowKey, filteredRows, rowKey]
  );

  const handleSearch = () => {
    const nextSearchText = searchText.trim();
    setAppliedSearchText(nextSearchText);
    setNotice("");

    if (
      activeRowKey !== null &&
      !rows.some(
        (row) =>
          rowKey(row) === activeRowKey && matchesSearch(row, searchFields, nextSearchText)
      )
    ) {
      setActiveRowKey(null);
    }
  };

  const handleConfirm = useCallback(() => {
    if (!selectedRow) {
      setNotice("선택할 행을 먼저 선택하세요.");
      return;
    }

    onSelect(selectedRow);
    onClose();
  }, [onClose, onSelect, selectedRow]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    if (event.target instanceof HTMLButtonElement) return;

    event.preventDefault();
    handleConfirm();
  };

  const handleRowDoubleClick = (row: T) => {
    setActiveRowKey(rowKey(row));
    setNotice("");
    onSelect(row);
    onClose();
  };

  return (
    <ErpDialog
      footer={
        <div className="erp-lookup-dialog__actions">
          <button
            className="erp-lookup-dialog__button erp-lookup-dialog__button--confirm"
            data-testid={dataTestId ? `${dataTestId}-confirm` : undefined}
            onClick={handleConfirm}
            type="button"
          >
            확인
          </button>
          <button
            className="erp-lookup-dialog__button erp-lookup-dialog__button--cancel"
            data-testid={dataTestId ? `${dataTestId}-cancel` : undefined}
            onClick={onClose}
            type="button"
          >
            취소
          </button>
        </div>
      }
      height={height}
      onClose={onClose}
      open={open}
      title={title}
      width={width}
    >
      <div className="erp-lookup-dialog" onKeyDown={handleKeyDown}>
        <div className="erp-lookup-dialog__search-panel">
          <label className="erp-lookup-dialog__search-label" htmlFor={searchInputId}>
            검색어
          </label>
          <input
            className="erp-lookup-dialog__search-input"
            data-testid={dataTestId ? `${dataTestId}-search-input` : undefined}
            id={searchInputId}
            onChange={(event) => {
              setSearchText(event.target.value);
              setNotice("");
            }}
            placeholder="코드 또는 명칭을 입력하세요"
            ref={searchInputRef}
            type="search"
            value={searchText}
          />
          <button
            className="erp-lookup-dialog__search-button"
            data-testid={dataTestId ? `${dataTestId}-search-button` : undefined}
            onClick={handleSearch}
            type="button"
          >
            조회
          </button>
          <span className="erp-lookup-dialog__result-count">총 {filteredRows.length}건</span>
        </div>

        <div className="erp-lookup-dialog__grid">
          <ErpDataGrid
            ariaLabel={`${title} 조회 결과`}
            columns={columns}
            dataTestId={dataTestId ? `${dataTestId}-grid` : undefined}
            emptyMessage={emptyMessage}
            onRowClick={(row) => {
              setActiveRowKey(rowKey(row));
              setNotice("");
            }}
            onRowDoubleClick={handleRowDoubleClick}
            rowKey={rowKey}
            rows={filteredRows}
            selectedRowKey={activeRowKey}
          />
        </div>

        <p aria-live="polite" className="erp-lookup-dialog__notice" role={notice ? "alert" : undefined}>
          {notice}
        </p>
      </div>
    </ErpDialog>
  );
}
