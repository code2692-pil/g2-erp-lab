import { useEffect, useMemo, useState } from "react";
import { createPurchaseOrder, deletePurchaseOrder, getPurchaseOrder, searchPurchaseOrders, updatePurchaseOrder, type PurchaseOrderDto } from "../../api/purchaseOrderApi";
import { getItems } from "../../api/itemApi";
import { getPartners } from "../../api/partnerApi";
import { getWarehouses } from "../../api/warehouseApi";
import { ErpDialog } from "../../components/common/ErpDialog";
import { ErpLookupDialog } from "../../components/common/ErpLookupDialog";
import type { ErpDataGridColumn } from "../../components/common/ErpDataGrid";
import type { ValidationIssue } from "../../components/common/validation/validation";
import { useConfirm } from "../../hooks/useConfirm";
import { useCrudPage } from "../../hooks/useCrudPage";
import { useDirtyState } from "../../hooks/useDirtyState";
import { useNotification } from "../../hooks/useNotification";
import type { Item } from "../common-code/item/types";
import type { Partner } from "../common-code/partner/types";
import type { Warehouse } from "../common-code/warehouse/types";
import type { PurchaseOrderHeader, PurchaseOrderLine } from "./types";
import { calculatePurchaseOrderLineAmounts, calculatePurchaseOrderTotals } from "./utils";
import { validatePurchaseOrders } from "./validation";

interface Props { onNavigate: (page: "sales" | "purchase") => void; }
const today = () => new Date().toISOString().slice(0, 10);
const partnerColumns: readonly ErpDataGridColumn<Partner>[] = [{ field: "CD_PARTNER", headerName: "거래처", width: 130 }, { field: "NM_PARTNER", headerName: "거래처명", width: 180 }];
const itemColumns: readonly ErpDataGridColumn<Item>[] = [{ field: "CD_ITEM", headerName: "품목", width: 130 }, { field: "NM_ITEM", headerName: "품목명", width: 180 }];
const warehouseColumns: readonly ErpDataGridColumn<Warehouse>[] = [{ field: "CD_WH", headerName: "창고", width: 130 }, { field: "NM_WH", headerName: "창고명", width: 180 }];

function newHeader(): PurchaseOrderHeader {
  return { CD_FIRM: "1000", NO_PO: `TEMP_PO_${Date.now()}`, DT_PO: today(), CD_PARTNER: "", NM_PARTNER: "", CD_EMP: "E-001", NM_EMP: "", CD_CURRENCY: "KRW", RT_EXCHANGE: 1, ST_PO: "미확정", DC_RMK: "" };
}
function newLine(header: PurchaseOrderHeader, noLine: number): PurchaseOrderLine {
  return { CD_FIRM: header.CD_FIRM, NO_PO: header.NO_PO, NO_LINE: noLine, CD_ITEM: "", NM_ITEM: "", STND_ITEM: "", UNIT_ITEM: "", QT_PO: 0, UM_PO: 0, AM_SUPPLY: 0, AM_VAT: 0, AM_TOTAL: 0, DT_DLV: today(), CD_WH: "", NM_WH: "", DC_RMK: "" };
}

export function ApiPurchaseOrderRegistration({ onNavigate }: Props) {
  const [orders, setOrders] = useState<PurchaseOrderDto[]>([]);
  const [current, setCurrent] = useState<PurchaseOrderDto | null>(null);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [partnerOpen, setPartnerOpen] = useState(false);
  const [itemLineIndex, setItemLineIndex] = useState<number | null>(null);
  const [warehouseLineIndex, setWarehouseLineIndex] = useState<number | null>(null);
  const [validationOpen, setValidationOpen] = useState(false);
  const [selectedLineIndex, setSelectedLineIndex] = useState<number | null>(null);
  const { isLoading, isSaving, error, successMessage, clearMessage, executeDelete, executeSave, executeSearch } = useCrudPage();
  const { confirm } = useConfirm();
  const { isDirty, markDirty, clearDirty } = useDirtyState();
  const { notify } = useNotification();
  const processing = isLoading || isSaving;
  const lines = current?.Lines ?? [];
  const issues = useMemo(() => current ? validatePurchaseOrders([current.Header], current.Lines) : [], [current]);
  const totals = useMemo(() => calculatePurchaseOrderTotals(lines), [lines]);
  const message = error ?? successMessage;

  const discardChanges = () => isDirty ? confirm({ title: "저장하지 않은 변경사항", message: "저장하지 않은 변경사항이 있습니다.", description: "계속하면 변경사항이 사라집니다.", confirmLabel: "변경사항 폐기", cancelLabel: "계속 편집", danger: true }) : Promise.resolve(true);
  const reload = async () => {
    await executeSearch({
      execute: async () => searchPurchaseOrders({ companyCode: "1000" }),
      onSuccess: (next) => { setOrders(next); if (next.length === 0) notify("info", "조회된 데이터가 없습니다."); else notify("success", "조회되었습니다."); clearDirty(); },
      errorMessage: "처리 중 오류가 발생했습니다."
    });
  };
  useEffect(() => { void Promise.all([getPartners(), getItems(), getWarehouses()]).then(([p, i, w]) => { setPartners(p.filter(x => x.YN_USE === "Y")); setItems(i.filter(x => x.YN_USE === "Y")); setWarehouses(w.filter(x => x.YN_USE === "Y")); }).then(reload).catch(() => notify("error", "처리 중 오류가 발생했습니다.")); }, []);

  const focusIssue = (issue: ValidationIssue) => {
    const selector = issue.scope === "header" ? `[data-testid="api-po-header-${issue.field}"]` : `[data-testid="api-po-line-${selectedLineIndex ?? 0}-${issue.field}"]`;
    requestAnimationFrame(() => document.querySelector<HTMLElement>(selector)?.focus());
  };
  const updateHeader = (field: keyof PurchaseOrderHeader, value: string) => { setCurrent(order => order && ({ ...order, Header: { ...order.Header, [field]: field === "RT_EXCHANGE" ? Number(value) : value } })); markDirty(); };
  const updateLine = (index: number, field: keyof PurchaseOrderLine, value: string) => {
    setCurrent(order => {
      if (!order) return order;
      const nextLines = order.Lines.map((line, lineIndex) => {
        if (lineIndex !== index) return line;
        const updated = { ...line, [field]: field === "QT_PO" || field === "UM_PO" ? Number(value) : value };
        return field === "QT_PO" || field === "UM_PO" ? { ...updated, ...calculatePurchaseOrderLineAmounts(updated.QT_PO, updated.UM_PO) } : updated;
      });
      return { ...order, Lines: nextLines };
    });
    markDirty();
  };
  const selectOrder = async (order: PurchaseOrderDto) => {
    if (current?.Header.NO_PO !== order.Header.NO_PO && !(await discardChanges())) return;
    const detail = await getPurchaseOrder(order.Header.CD_FIRM, order.Header.NO_PO);
    setCurrent(detail); setSelectedLineIndex(null); clearDirty();
  };
  const handleNew = async () => { if (!(await discardChanges())) return; const header = newHeader(); setCurrent({ Header: header, Lines: [] }); setSelectedLineIndex(null); clearDirty(); };
  const handleSearch = async () => { if (!(await discardChanges())) return; await reload(); };
  const handleSave = async () => {
    if (!current) { notify("info", "선택된 항목이 없습니다."); return; }
    const validation = validatePurchaseOrders([current.Header], current.Lines);
    if (validation.length > 0) { setValidationOpen(true); notify("warning", `저장할 수 없습니다. 입력값 ${validation.length}건을 확인하세요.`); focusIssue(validation[0]); return; }
    if (!(await confirm({ title: "저장 확인", message: "저장하시겠습니까?", confirmLabel: "저장" }))) return;
    await executeSave({
      execute: () => orders.some(order => order.Header.CD_FIRM === current.Header.CD_FIRM && order.Header.NO_PO === current.Header.NO_PO) ? updatePurchaseOrder(current.Header.CD_FIRM, current.Header.NO_PO, current) : createPurchaseOrder(current),
      onSuccess: (saved) => { setCurrent(saved); setOrders(rows => [saved, ...rows.filter(row => row.Header.NO_PO !== saved.Header.NO_PO)]); clearDirty(); notify("success", "저장되었습니다."); },
      errorMessage: "처리 중 오류가 발생했습니다."
    });
  };
  const handleDelete = async () => {
    if (!current) { notify("info", "선택된 항목이 없습니다."); return; }
    if (!(await confirm({ title: "발주 삭제", message: `발주번호 ${current.Header.NO_PO}을 삭제하시겠습니까?`, confirmLabel: "삭제", danger: true }))) return;
    await executeDelete({ execute: () => deletePurchaseOrder(current.Header.CD_FIRM, current.Header.NO_PO), onSuccess: () => { setOrders(rows => rows.filter(row => row.Header.NO_PO !== current.Header.NO_PO)); setCurrent(null); clearDirty(); notify("success", "삭제되었습니다."); }, errorMessage: "처리 중 오류가 발생했습니다." });
  };
  const addLine = () => { if (!current) { notify("info", "선택된 항목이 없습니다."); return; } const line = newLine(current.Header, lines.length + 1); setCurrent({ ...current, Lines: [...lines, line] }); setSelectedLineIndex(lines.length); markDirty(); };
  const deleteLine = async () => {
    if (!current || selectedLineIndex === null) { notify("info", "선택된 항목이 없습니다."); return; }
    if (!(await confirm({ title: "발주상세 삭제", message: "선택한 발주상세 1건을 삭제하시겠습니까?", confirmLabel: "삭제", danger: true }))) return;
    setCurrent({ ...current, Lines: lines.filter((_, index) => index !== selectedLineIndex).map((line, index) => ({ ...line, NO_LINE: index + 1 })) }); setSelectedLineIndex(null); markDirty(); notify("success", "선택한 1건이 삭제되었습니다.");
  };
  const navigateSales = async () => { if (!(await discardChanges())) return; clearDirty(); onNavigate("sales"); };

  return <main aria-busy={processing} className="workbench"><header className="page-header"><h1 data-testid="purchase-page-title">발주등록</h1><div className="button-bar"><button data-testid="nav-sales-order" disabled={processing} onClick={navigateSales}>수주등록</button><button data-testid="api-po-search" disabled={processing} onClick={handleSearch}>조회</button><button data-testid="api-po-new" disabled={processing} onClick={handleNew}>신규</button><button data-testid="api-po-add-line" disabled={processing} onClick={addLine}>상세 추가</button><button className="primary" data-testid="api-po-save" disabled={processing} onClick={handleSave}>{isSaving ? "저장 중..." : "저장"}</button><button className="danger" data-testid="api-po-delete" disabled={processing} onClick={handleDelete}>{isSaving ? "삭제 중..." : "삭제"}</button></div></header><p data-testid="status-message">{message}</p><section className="grid-section"><h2>발주 목록</h2><table><tbody>{orders.map(order => <tr data-testid={`api-po-order-${order.Header.NO_PO}`} key={order.Header.NO_PO}><td><button onClick={() => void selectOrder(order)} type="button">{order.Header.NO_PO}</button></td><td>{order.Header.NM_PARTNER}</td></tr>)}</tbody></table></section>{current && <><section className="search-panel"><h2>발주정보</h2><label>거래처<input data-testid="api-po-header-CD_PARTNER" value={current.Header.CD_PARTNER} onChange={event => updateHeader("CD_PARTNER", event.target.value)} /><button data-testid="api-po-partner-lookup" disabled={processing} onClick={() => setPartnerOpen(true)} type="button">Lookup</button></label><label>발주일자<input data-testid="api-po-header-DT_PO" type="date" value={current.Header.DT_PO} onChange={event => updateHeader("DT_PO", event.target.value)} /></label></section><section className="grid-section"><h2>발주상세</h2><button data-testid="api-po-delete-line" disabled={processing} onClick={deleteLine}>상세 삭제</button><table><tbody>{lines.map((line, index) => <tr data-testid={`api-po-line-row-${index}`} key={line.NO_LINE} onClick={() => setSelectedLineIndex(index)}><td><input data-testid={`api-po-line-${index}-CD_ITEM`} value={line.CD_ITEM} onChange={event => updateLine(index, "CD_ITEM", event.target.value)} /><button data-testid={`api-po-item-lookup-${index}`} disabled={processing} onClick={() => setItemLineIndex(index)} type="button">품목</button></td><td><input data-testid={`api-po-line-${index}-QT_PO`} type="number" value={line.QT_PO} onChange={event => updateLine(index, "QT_PO", event.target.value)} /></td><td><input data-testid={`api-po-line-${index}-UM_PO`} type="number" value={line.UM_PO} onChange={event => updateLine(index, "UM_PO", event.target.value)} /></td><td><input data-testid={`api-po-line-${index}-DT_DLV`} type="date" value={line.DT_DLV} onChange={event => updateLine(index, "DT_DLV", event.target.value)} /></td><td><input data-testid={`api-po-line-${index}-CD_WH`} value={line.CD_WH} onChange={event => updateLine(index, "CD_WH", event.target.value)} /><button data-testid={`api-po-warehouse-lookup-${index}`} disabled={processing} onClick={() => setWarehouseLineIndex(index)} type="button">창고</button></td></tr>)}</tbody></table><p data-testid="api-po-total">합계 {totals.AM_TOTAL.toLocaleString()}</p></section></>}<ErpLookupDialog columns={partnerColumns} dataTestId="api-po-partner-lookup" emptyMessage="조회된 데이터가 없습니다." onClose={() => setPartnerOpen(false)} onSelect={partner => { setCurrent(order => order && ({ ...order, Header: { ...order.Header, CD_PARTNER: partner.CD_PARTNER, NM_PARTNER: partner.NM_PARTNER } })); markDirty(); setPartnerOpen(false); notify("success", "거래처 선택이 반영되었습니다."); }} open={partnerOpen} rowKey={row => row.CD_PARTNER} rows={partners.filter(row => !current || row.CD_FIRM === current.Header.CD_FIRM)} searchFields={["CD_PARTNER", "NM_PARTNER"]} title="거래처 Lookup" /><ErpLookupDialog columns={itemColumns} dataTestId="api-po-item-lookup" emptyMessage="조회된 데이터가 없습니다." onClose={() => setItemLineIndex(null)} onSelect={item => { if (itemLineIndex === null) return; setCurrent(order => order && ({ ...order, Lines: order.Lines.map((line, index) => index === itemLineIndex ? { ...line, CD_ITEM: item.CD_ITEM, NM_ITEM: item.NM_ITEM, STND_ITEM: item.STND_ITEM, UNIT_ITEM: item.UNIT_ITEM } : line) })); markDirty(); setItemLineIndex(null); notify("success", "품목 선택이 반영되었습니다."); }} open={itemLineIndex !== null} rowKey={row => row.CD_ITEM} rows={items.filter(row => !current || row.CD_FIRM === current.Header.CD_FIRM)} searchFields={["CD_ITEM", "NM_ITEM"]} title="품목 Lookup" /><ErpLookupDialog columns={warehouseColumns} dataTestId="api-po-warehouse-lookup" emptyMessage="조회된 데이터가 없습니다." onClose={() => setWarehouseLineIndex(null)} onSelect={warehouse => { if (warehouseLineIndex === null) return; setCurrent(order => order && ({ ...order, Lines: order.Lines.map((line, index) => index === warehouseLineIndex ? { ...line, CD_WH: warehouse.CD_WH, NM_WH: warehouse.NM_WH } : line) })); markDirty(); setWarehouseLineIndex(null); notify("success", "창고 선택이 반영되었습니다."); }} open={warehouseLineIndex !== null} rowKey={row => row.CD_WH} rows={warehouses.filter(row => !current || row.CD_FIRM === current.Header.CD_FIRM)} searchFields={["CD_WH", "NM_WH"]} title="창고 Lookup" /><ErpDialog dataTestId="api-po-validation-summary" footer={<button onClick={() => setValidationOpen(false)} type="button">확인</button>} onClose={() => setValidationOpen(false)} open={validationOpen} title="저장 전 입력값 검증"><ul>{issues.map((issue, index) => <li key={`${issue.message}-${index}`}>{issue.message}</li>)}</ul></ErpDialog></main>;
}
