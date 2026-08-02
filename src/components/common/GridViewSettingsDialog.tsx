import { useEffect, useMemo, useState } from "react";
import { ErpDialog } from "./ErpDialog";
import {
  GRID_VIEW_MAX_COLUMN_WIDTH,
  GRID_VIEW_MIN_COLUMN_WIDTH,
  moveGridViewColumn,
  normalizeGridViewPreferences,
  setGridViewColumnWidth,
  setGridViewColumnVisibility,
  type GridViewColumnDefinition,
  type GridViewPreferences
} from "./gridViewPreferences";

interface GridViewSettingsDialogProps {
  open: boolean;
  title: string;
  gridId: string;
  columns: readonly GridViewColumnDefinition[];
  preferences: GridViewPreferences;
  dataTestId: string;
  onApply: (preferences: GridViewPreferences) => void;
  onClose: () => void;
  onReset: () => void;
}

export function GridViewSettingsDialog({
  open,
  title,
  gridId,
  columns,
  preferences,
  dataTestId,
  onApply,
  onClose,
  onReset
}: GridViewSettingsDialogProps) {
  const normalizedPreferences = useMemo(
    () => normalizeGridViewPreferences(preferences, gridId, columns),
    [columns, gridId, preferences]
  );
  const [draft, setDraft] = useState(normalizedPreferences);

  useEffect(() => {
    if (open) setDraft(normalizedPreferences);
  }, [normalizedPreferences, open]);

  const definitions = new Map(columns.map((column) => [column.id, column]));
  const visibleCount = draft.columns.filter((column) => column.visible).length;

  return (
    <ErpDialog
      dataTestId={dataTestId}
      footer={
        <>
          <button data-testid={`${dataTestId}-apply`} className="primary" onClick={() => onApply(draft)} type="button">적용</button>
          <button data-testid={`${dataTestId}-cancel`} onClick={onClose} type="button">취소</button>
          <button data-testid={`${dataTestId}-reset`} onClick={onReset} type="button">기본값으로 초기화</button>
        </>
      }
      onClose={onClose}
      open={open}
      title={title}
      width={720}
    >
      <div className="grid-view-settings">
        <p className="grid-view-settings__hint">표시할 열, 순서와 너비를 조정할 수 있습니다. 고정 열은 Grid 동작을 위해 유지됩니다.</p>
        <ol className="grid-view-settings__list" aria-label="Grid 열 설정">
          {draft.columns.map((column, index) => {
            const definition = definitions.get(column.id);
            const locked = Boolean(definition?.locked);
            const cannotHide = locked || (column.visible && visibleCount <= 1);
            const previousLocked = index === 0 || Boolean(definitions.get(draft.columns[index - 1].id)?.locked);
            const nextLocked = index === draft.columns.length - 1 || Boolean(definitions.get(draft.columns[index + 1].id)?.locked);
            const label = definition?.label ?? column.id;
            const width = column.width ?? definition?.defaultWidth;
            return (
              <li className="grid-view-settings__row" key={column.id}>
                <span className="grid-view-settings__order">{index + 1}</span>
                <label className="grid-view-settings__visibility">
                  <input
                    checked={column.visible}
                    data-testid={`${dataTestId}-visible-${column.id}`}
                    disabled={cannotHide}
                    onChange={(event) => {
                      const visible = event.currentTarget.checked;
                      setDraft((current) => setGridViewColumnVisibility(current, gridId, columns, column.id, visible));
                    }}
                    type="checkbox"
                  />
                  <span>{label}</span>
                </label>
                <span className="grid-view-settings__locked" aria-label={locked ? `${label} 열은 고정되어 있습니다.` : undefined}>{locked ? "고정" : ""}</span>
                <label className="grid-view-settings__width">
                  <span>너비</span>
                  <input
                    aria-label={`${label} 열 너비`}
                    data-testid={`${dataTestId}-width-${column.id}`}
                    disabled={width === undefined}
                    inputMode="numeric"
                    max={GRID_VIEW_MAX_COLUMN_WIDTH}
                    min={GRID_VIEW_MIN_COLUMN_WIDTH}
                    onChange={(event) => {
                      const nextWidth = event.currentTarget.valueAsNumber;
                      setDraft((current) => setGridViewColumnWidth(current, gridId, columns, column.id, nextWidth));
                    }}
                    step={1}
                    type="number"
                    value={width ?? ""}
                  />
                  <span>px</span>
                </label>
                <div className="grid-view-settings__moves">
                  <button
                    aria-label={`${label} 열을 위로 이동`}
                    data-testid={`${dataTestId}-move-up-${column.id}`}
                    disabled={locked || previousLocked}
                    onClick={() => setDraft((current) => moveGridViewColumn(current, gridId, columns, column.id, "up"))}
                    type="button"
                  >위로</button>
                  <button
                    aria-label={`${label} 열을 아래로 이동`}
                    data-testid={`${dataTestId}-move-down-${column.id}`}
                    disabled={locked || nextLocked}
                    onClick={() => setDraft((current) => moveGridViewColumn(current, gridId, columns, column.id, "down"))}
                    type="button"
                  >아래로</button>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </ErpDialog>
  );
}
