import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Building2, ChevronRight, Plus, Rows3, Save, Search, Trash2 } from "lucide-react";
import { ErpDataGrid } from "../../components/common/ErpDataGrid";
import type { ErpDataGridCellValue, ErpDataGridColumn } from "../../components/common/ErpDataGrid";
import { ErpLookupDialog } from "../../components/common/ErpLookupDialog";
import { PageToolbar } from "../../components/common/PageToolbar";
import { SearchPanel } from "../../components/common/SearchPanel";
import { toValidationCellErrors } from "../../components/common/validation/validation";
import { useCrudPage } from "../../hooks/useCrudPage";
import { useConfirm } from "../../hooks/useConfirm";
import { useDirtyState } from "../../hooks/useDirtyState";
import { useNotification } from "../../hooks/useNotification";
import { useValidationSummary } from "../../hooks/useValidationSummary";
import { useMasterDetailSelection } from "../../hooks/useMasterDetailSelection";
import { mockItems } from "../common-code/item/mockData";
import type { Item } from "../common-code/item/types";
import { mockPartners } from "../common-code/partner/mockData";
import type { Partner } from "../common-code/partner/types";
import { mockWarehouses } from "../common-code/warehouse/mockData";
import type { Warehouse } from "../common-code/warehouse/types";
import { mockPurchaseOrderHeaders, mockPurchaseOrderLines } from "./mockData";
import type { PurchaseOrderHeader, PurchaseOrderLine, PurchaseOrderStatus } from "./types";
import { calculatePurchaseOrderLineAmounts, calculatePurchaseOrderTotals, createPurchaseOrderHeaderKey, createPurchaseOrderLineKey } from "./utils";
import { validatePurchaseOrders } from "./validation";

interface PurchaseOrderRegistrationProps { onNavigate: (page: "sales" | "purchase" | "work") => void; }
type HeaderField = Exclude<keyof PurchaseOrderHeader, "NO_PO">;
type LineField = Exclude<keyof PurchaseOrderLine, "CD_FIRM" | "NO_PO" | "NO_LINE" | "AM_SUPPLY" | "AM_VAT" | "AM_TOTAL">;
const statuses: PurchaseOrderStatus[] = ["미확정", "확정", "승인", "진행", "마감", "취소"];
const money = new Intl.NumberFormat("ko-KR");
const partnerColumns: readonly ErpDataGridColumn<Partner>[] = [{ field: "CD_FIRM", headerName: "회사", width: 80 }, { field: "CD_PARTNER", headerName: "거래처코드", width: 130 }, { field: "NM_PARTNER", headerName: "거래처명", width: 180 }, { field: "YN_USE", headerName: "사용", width: 70 }];
const itemColumns: readonly ErpDataGridColumn<Item>[] = [{ field: "CD_ITEM", headerName: "품목코드", width: 120 }, { field: "NM_ITEM", headerName: "품목명", width: 180 }, { field: "STND_ITEM", headerName: "규격", width: 150 }, { field: "UNIT_ITEM", headerName: "단위", width: 70 }];
const warehouseColumns: readonly ErpDataGridColumn<Warehouse>[] = [{ field: "CD_FIRM", headerName: "회사", width: 80 }, { field: "CD_WH", headerName: "창고코드", width: 120 }, { field: "NM_WH", headerName: "창고명", width: 180 }, { field: "YN_USE", headerName: "사용", width: 70 }];

function today() { return new Date().toISOString().slice(0, 10); }
function numberValue(value: ErpDataGridCellValue) { const result = Number(value); return Number.isFinite(result) ? result : 0; }
function emptyHeader(no: string): PurchaseOrderHeader { return { CD_FIRM: "1000", NO_PO: no, DT_PO: today(), CD_PARTNER: "", NM_PARTNER: "", CD_EMP: "E-001", NM_EMP: "Buyer", CD_CURRENCY: "KRW", RT_EXCHANGE: 1, ST_PO: "미확정", DC_RMK: "" }; }
function emptyLine(header: PurchaseOrderHeader, number: number): PurchaseOrderLine { return { CD_FIRM: header.CD_FIRM, NO_PO: header.NO_PO, NO_LINE: number, CD_ITEM: "", NM_ITEM: "", STND_ITEM: "", UNIT_ITEM: "", QT_PO: 0, UM_PO: 0, AM_SUPPLY: 0, AM_VAT: 0, AM_TOTAL: 0, DT_DLV: today(), CD_WH: "", NM_WH: "", DC_RMK: "" }; }

export function PurchaseOrderRegistration({ onNavigate }: PurchaseOrderRegistrationProps) {
  const [headers, setHeaders] = useState<PurchaseOrderHeader[]>([]);
  const [lines, setLines] = useState<PurchaseOrderLine[]>([]);
  const { selectedMasterKey: selectedNoPo, selectedDetailKey: selectedLineNo, selectMaster, selectDetail } = useMasterDetailSelection<string, number | null>("", null);
  const { isLoading, isSaving, error, successMessage, clearMessage, executeCreate, executeDelete, executeSave, executeSearch } = useCrudPage();
  const [featureMessage, setFeatureMessage] = useState("");
  const [checkedLineKeys, setCheckedLineKeys] = useState<string[]>([]);
  const [partnerOpen, setPartnerOpen] = useState(false);
  const [itemOpen, setItemOpen] = useState(false);
  const [warehouseOpen, setWarehouseOpen] = useState(false);
  const [filters, setFilters] = useState({ firm: "1000", from: "2026-07-01", to: "2026-07-31", no: "", partner: "", status: "" });
  const [tempSequence, setTempSequence] = useState(1);
  const { confirm } = useConfirm();
  const { isDirty, markDirty, clearDirty } = useDirtyState();
  const { notify } = useNotification();
  const { showValidationSummary } = useValidationSummary();
  const setMessage = (message: string) => { clearMessage(); setFeatureMessage(message); };
  const message = error ?? successMessage ?? featureMessage;
  const selectedHeader = headers.find((header) => header.NO_PO === selectedNoPo);
  const selectedLine = lines.find((line) => line.NO_PO === selectedNoPo && line.NO_LINE === selectedLineNo);
  const issues = useMemo(() => validatePurchaseOrders(headers, lines), [headers, lines]);
  const visibleHeaders = useMemo(() => headers.filter((header) => header.NO_PO.startsWith("TEMP_PO_") || ((!filters.firm || header.CD_FIRM === filters.firm) && (!filters.no || header.NO_PO.includes(filters.no)) && (!filters.partner || header.CD_PARTNER.includes(filters.partner)) && (!filters.status || header.ST_PO === filters.status) && (!filters.from || header.DT_PO >= filters.from) && (!filters.to || header.DT_PO <= filters.to))), [filters, headers]);
  const selectedLines = lines.filter((line) => line.NO_PO === selectedNoPo).sort((a, b) => a.NO_LINE - b.NO_LINE);
  const checkedLines = selectedLines.filter((line) =>
    checkedLineKeys.includes(createPurchaseOrderLineKey(line.CD_FIRM, line.NO_PO, line.NO_LINE)),
  );
  const deleteTargetLines = checkedLines.length > 0 ? checkedLines : selectedLine ? [selectedLine] : [];
  const totals = calculatePurchaseOrderTotals(selectedLines);

  const focusValidationIssue = (issue: { scope: string; rowKey?: string; field?: string }) => {
    if (!issue.rowKey || !issue.field || (issue.scope !== "header" && issue.scope !== "line")) return;
    const grid = issue.scope === "header" ? "purchase-header-grid" : "purchase-line-grid";
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-testid="${grid}-cell-${issue.rowKey}-${issue.field}"], [data-testid="${grid}-cell-container-${issue.rowKey}-${issue.field}"]`)?.focus());
  };

  useLayoutEffect(() => { if (!visibleHeaders.some((header) => header.NO_PO === selectedNoPo)) selectMaster(visibleHeaders[0]?.NO_PO ?? ""); }, [selectMaster, selectedNoPo, visibleHeaders]);
  useEffect(() => {
    const markGridEdit = (event: Event) => {
      const testId = event.target instanceof HTMLElement ? event.target.dataset.testid : undefined;
      if (testId?.startsWith("purchase-header-grid-cell-") || testId?.startsWith("purchase-line-grid-cell-")) markDirty();
    };
    document.addEventListener("input", markGridEdit, true);
    document.addEventListener("change", markGridEdit, true);
    return () => { document.removeEventListener("input", markGridEdit, true); document.removeEventListener("change", markGridEdit, true); };
  }, [markDirty]);
  const confirmDiscardChanges = () => isDirty ? confirm({ title: "저장하지 않은 변경사항", message: "저장하지 않은 변경사항이 있습니다.", description: "계속하면 변경사항이 사라집니다.", confirmLabel: "변경사항 폐기", cancelLabel: "계속 편집", danger: true }) : Promise.resolve(true);
  const selectHeader = async (header: PurchaseOrderHeader) => { if (header.NO_PO !== selectedNoPo && !(await confirmDiscardChanges())) return; if (header.NO_PO !== selectedNoPo) clearDirty(); selectMaster(header.NO_PO); setCheckedLineKeys([]); };
  const updateLine = (no: string, lineNo: number, field: LineField, value: ErpDataGridCellValue) => { markDirty(); setLines((current) => current.map((line) => { if (line.NO_PO !== no || line.NO_LINE !== lineNo) return line; if (field === "QT_PO" || field === "UM_PO") { const next = { ...line, [field]: numberValue(value) }; return { ...next, ...calculatePurchaseOrderLineAmounts(next.QT_PO, next.UM_PO) }; } return { ...line, [field]: String(value ?? "") }; })); };

  useEffect(() => {
    const guardSalesNavigation = async (event: MouseEvent) => {
      const button = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-testid='nav-sales-order']") : null;
      if (!button || !isDirty) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!(await confirmDiscardChanges())) return;
      clearDirty();
      onNavigate("sales");
    };
    document.addEventListener("click", guardSalesNavigation, true);
    return () => document.removeEventListener("click", guardSalesNavigation, true);
  }, [clearDirty, confirmDiscardChanges, isDirty, onNavigate]);

  const handleSearch = async () => { if (isDirty && !(await confirm({ title: "저장하지 않은 변경사항", message: "저장하지 않은 변경사항이 있습니다.", description: "계속하면 변경사항이 사라집니다.", confirmLabel: "변경사항 폐기", cancelLabel: "계속 편집", danger: true }))) return; setFeatureMessage(""); await executeSearch({ execute: () => ({ headers: mockPurchaseOrderHeaders.map((row) => ({ ...row })), lines: mockPurchaseOrderLines.map((row) => ({ ...row })) }), onSuccess: (result) => { setHeaders(result.headers); setLines(result.lines); selectMaster(result.headers[0]?.NO_PO ?? ""); setCheckedLineKeys([]); clearDirty(); notify(result.headers.length ? "success" : "info", result.headers.length ? "조회되었습니다." : "조회된 데이터가 없습니다."); }, successMessage: "발주를 조회했습니다.", errorMessage: "처리 중 오류가 발생했습니다." }); };
  const handleNew = async () => { if (isDirty && !(await confirm({ title: "저장하지 않은 변경사항", message: "저장하지 않은 변경사항이 있습니다.", description: "계속하면 변경사항이 사라집니다.", confirmLabel: "변경사항 폐기", cancelLabel: "계속 편집", danger: true }))) return; const no = `TEMP_PO_${String(tempSequence).padStart(3, "0")}`; const header = emptyHeader(no); setFeatureMessage(""); await executeCreate({ execute: () => { setHeaders((current) => [header, ...current]); selectMaster(no); setTempSequence((sequence) => sequence + 1); clearDirty(); return header; }, successMessage: "신규 발주 행이 추가되었습니다." }); };
  const handleAddLine = () => { if (!selectedHeader) { notify("info", "선택된 항목이 없습니다."); return; } const next = emptyLine(selectedHeader, selectedLines.length + 1); setLines((current) => [...current, next]); selectDetail(next.NO_LINE); markDirty(); };
  const handleDeleteLine = async () => {
    if (deleteTargetLines.length === 0) {
      notify("info", "선택된 항목이 없습니다.");
      return;
    }

    const targetKeys = new Set(
      deleteTargetLines.map((line) => createPurchaseOrderLineKey(line.CD_FIRM, line.NO_PO, line.NO_LINE)),
    );

    if (!(await confirm({ title: "발주상세 삭제", message: `선택한 발주상세 ${targetKeys.size}건을 삭제하시겠습니까?`, confirmLabel: "삭제", danger: true }))) return;

    setLines((current) => {
      return current.filter(
        (line) => !targetKeys.has(createPurchaseOrderLineKey(line.CD_FIRM, line.NO_PO, line.NO_LINE)),
      );
    });
    if (selectedLine && targetKeys.has(createPurchaseOrderLineKey(selectedLine.CD_FIRM, selectedLine.NO_PO, selectedLine.NO_LINE))) {
      selectDetail(null);
    }
    setCheckedLineKeys((current) => current.filter((key) => !targetKeys.has(key)));
    markDirty(); notify("success", `선택한 ${deleteTargetLines.length}건이 삭제되었습니다.`);
  };
  const handleSave = async () => { if (issues.length) { const validationMessage = `저장할 수 없습니다. 입력값 ${issues.length}건을 확인하세요.`; setMessage(validationMessage); showValidationSummary(issues); notify("warning", validationMessage); focusValidationIssue(issues[0]); return; } if (!(await confirm({ title: "저장 확인", message: "저장하시겠습니까?", confirmLabel: "저장" }))) return; setFeatureMessage(""); await executeSave({ execute: () => { setHeaders((current) => current.map((header) => header.NO_PO.startsWith("TEMP_PO_") ? { ...header, NO_PO: `PO${today().replaceAll("-", "")}${header.NO_PO.slice(-4)}`, ST_PO: "확정" } : header)); setLines((current) => current.map((line) => line.NO_PO.startsWith("TEMP_PO_") ? { ...line, NO_PO: `PO${today().replaceAll("-", "")}${line.NO_PO.slice(-4)}` } : line)); clearDirty(); notify("success", "저장되었습니다."); return true; }, errorMessage: "처리 중 오류가 발생했습니다." }); };
  const navigateWorkOrder = async () => { if (!(await confirmDiscardChanges())) return; clearDirty(); onNavigate("work"); };
  const handleDelete = async () => { if (!selectedNoPo) { notify("info", "선택된 항목이 없습니다."); return; } if (!(await confirm({ title: "발주 삭제", message: `발주번호 ${selectedNoPo}을 삭제하시겠습니까?`, confirmLabel: "삭제", danger: true }))) return; setFeatureMessage(""); await executeDelete({ execute: () => { setHeaders((current) => current.filter((header) => header.NO_PO !== selectedNoPo)); setLines((current) => current.filter((line) => line.NO_PO !== selectedNoPo)); selectMaster(""); setCheckedLineKeys([]); clearDirty(); notify("success", "삭제되었습니다."); return true; }, errorMessage: "처리 중 오류가 발생했습니다." }); };
  const choosePartner = (partner: Partner) => { if (!selectedHeader) { notify("info", "선택된 항목이 없습니다."); return; } setHeaders((current) => current.map((header) => header.NO_PO === selectedHeader.NO_PO ? { ...header, CD_PARTNER: partner.CD_PARTNER, NM_PARTNER: partner.NM_PARTNER } : header)); markDirty(); notify("success", "거래처 선택이 반영되었습니다."); setPartnerOpen(false); };
  const chooseItem = (item: Item) => { if (!selectedLine) { notify("info", "선택된 항목이 없습니다."); return; } setLines((current) => current.map((line) => line.NO_PO === selectedLine.NO_PO && line.NO_LINE === selectedLine.NO_LINE ? { ...line, CD_ITEM: item.CD_ITEM, NM_ITEM: item.NM_ITEM, STND_ITEM: item.STND_ITEM, UNIT_ITEM: item.UNIT_ITEM } : line)); markDirty(); notify("success", "품목 선택이 반영되었습니다."); setItemOpen(false); };
  const chooseWarehouse = (warehouse: Warehouse) => { if (!selectedLine) { notify("info", "선택된 항목이 없습니다."); return; } setLines((current) => current.map((line) => line.NO_PO === selectedLine.NO_PO && line.NO_LINE === selectedLine.NO_LINE ? { ...line, CD_WH: warehouse.CD_WH, NM_WH: warehouse.NM_WH } : line)); markDirty(); notify("success", "창고 선택이 반영되었습니다."); setWarehouseOpen(false); };

  const headerColumns: readonly ErpDataGridColumn<PurchaseOrderHeader>[] = [{ field: "CD_FIRM", headerName: "회사", width: 80, editable: true }, { field: "NO_PO", headerName: "발주번호", width: 145, readOnly: true }, { field: "DT_PO", headerName: "발주일자", width: 120, editable: true, dataType: "date" }, { field: "CD_PARTNER", headerName: "거래처", width: 120, editable: true }, { field: "NM_PARTNER", headerName: "거래처명", width: 150, editable: true }, { field: "CD_EMP", headerName: "담당자", width: 90, editable: true }, { field: "NM_EMP", headerName: "담당자명", width: 110, editable: true }, { field: "CD_CURRENCY", headerName: "통화", width: 70, editable: true }, { field: "RT_EXCHANGE", headerName: "환율", width: 90, editable: true, dataType: "number" }, { field: "ST_PO", headerName: "상태", width: 90, editable: true }, { field: "DC_RMK", headerName: "비고", width: 160, editable: true }];
  const lineColumns: readonly ErpDataGridColumn<PurchaseOrderLine>[] = [{ field: "NO_LINE", headerName: "행", width: 55, readOnly: true }, { field: "CD_ITEM", headerName: "품목코드", width: 110, editable: true }, { field: "NM_ITEM", headerName: "품목명", width: 150, editable: true }, { field: "STND_ITEM", headerName: "규격", width: 130, editable: true }, { field: "UNIT_ITEM", headerName: "단위", width: 60, editable: true }, { field: "QT_PO", headerName: "수량", width: 85, editable: true, dataType: "number", sum: true }, { field: "UM_PO", headerName: "단가", width: 100, editable: true, dataType: "number" }, { field: "AM_SUPPLY", headerName: "공급가", width: 105, readOnly: true, dataType: "number", sum: true, formatter: (value) => money.format(Number(value)) }, { field: "AM_VAT", headerName: "부가세", width: 95, readOnly: true, dataType: "number", sum: true, formatter: (value) => money.format(Number(value)) }, { field: "AM_TOTAL", headerName: "합계", width: 110, readOnly: true, dataType: "number", sum: true, formatter: (value) => money.format(Number(value)) }, { field: "DT_DLV", headerName: "납기일", width: 115, editable: true, dataType: "date" }, { field: "CD_WH", headerName: "창고", width: 100, editable: true }, { field: "NM_WH", headerName: "창고명", width: 130, editable: true }, { field: "DC_RMK", headerName: "비고", width: 140, editable: true }];
  return <><div className="erp-shell"><aside className="side-nav"><div className="brand"><Building2 size={20} /><strong>SMART ERP</strong></div><nav><div className="menu-title">영업관리</div><button className="menu-item" data-testid="nav-sales-order" onClick={() => onNavigate("sales")}>수주등록</button><div className="menu-title">구매관리</div><div className="menu-group"><ChevronRight size={14} /><span>발주관리</span></div><button className="menu-item active" data-testid="nav-purchase-order">발주등록</button><div className="menu-title">생산관리</div><div className="menu-group"><ChevronRight size={14} /><span>작업지시관리</span></div><button className="menu-item" data-testid="nav-work-order" onClick={() => void navigateWorkOrder()} type="button">작업지시등록</button></nav></aside><main aria-busy={isLoading || isSaving} className="workbench"><header className="page-header"><div><h1 data-testid="purchase-page-title">발주등록</h1><p>PUR_POH / PUR_POL mock 입력 샘플</p></div><PageToolbar actions={[{ dataTestId: "po-btn-search", label: "조회", icon: <Search size={15} />, onClick: handleSearch, disabled: isLoading }, { dataTestId: "po-btn-new", label: "신규", icon: <Plus size={15} />, onClick: handleNew, disabled: isSaving }, { dataTestId: "po-btn-add-line", label: "행추가", icon: <Rows3 size={15} />, onClick: handleAddLine }, { dataTestId: "po-btn-delete-line", label: "행삭제", icon: <Trash2 size={15} />, onClick: handleDeleteLine }, { dataTestId: "po-btn-save", label: "저장", icon: <Save size={15} />, onClick: handleSave, disabled: isSaving, variant: "primary" }, { dataTestId: "po-btn-delete", label: "삭제", icon: <Trash2 size={15} />, onClick: handleDelete, disabled: isSaving, variant: "danger" }]} /></header><SearchPanel message={message}><label>회사<input data-testid="po-filter-firm" value={filters.firm} onChange={(event) => setFilters({ ...filters, firm: event.target.value })} /></label><label>발주일 From<input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} /></label><label>발주일 To<input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} /></label><label>발주번호<input data-testid="po-filter-no" value={filters.no} onChange={(event) => setFilters({ ...filters, no: event.target.value })} /></label><label>거래처<input data-testid="po-filter-partner" value={filters.partner} onChange={(event) => setFilters({ ...filters, partner: event.target.value })} /></label><label>상태<select data-testid="po-filter-status" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">전체</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label></SearchPanel><section className="grid-section top-grid"><div className="section-title"><h2>발주정보</h2><button data-testid="po-btn-partner-lookup" onClick={() => setPartnerOpen(true)} type="button">거래처 Lookup</button></div><ErpDataGrid columns={headerColumns} dataTestId="purchase-header-grid" rows={visibleHeaders} rowKey={(row) => createPurchaseOrderHeaderKey(row.CD_FIRM, row.NO_PO)} selectedRowKey={selectedHeader ? createPurchaseOrderHeaderKey(selectedHeader.CD_FIRM, selectedHeader.NO_PO) : undefined} selectionMode="single" showFooter showRowNumbers cellErrors={toValidationCellErrors(issues)} onRowClick={selectHeader} onCellValueChange={(row, field, value) => { if (field !== "NO_PO") setHeaders((current) => current.map((header) => header.NO_PO === row.NO_PO ? { ...header, [field]: field === "RT_EXCHANGE" ? numberValue(value) : String(value ?? "") } as PurchaseOrderHeader : header)); }} /></section><section className="grid-section bottom-grid"><div className="section-title"><h2>발주상세</h2><div className="section-title-actions"><button data-testid="po-btn-item-lookup" onClick={() => selectedLine ? setItemOpen(true) : setMessage("발주상세 행을 선택하세요.")} type="button">품목 Lookup</button><button data-testid="po-btn-warehouse-lookup" onClick={() => selectedLine ? setWarehouseOpen(true) : setMessage("발주상세 행을 선택하세요.")} type="button">창고 Lookup</button></div></div><ErpDataGrid columns={lineColumns} dataTestId="purchase-line-grid" rows={selectedLines} rowKey={(row) => createPurchaseOrderLineKey(row.CD_FIRM, row.NO_PO, row.NO_LINE)} selectedRowKey={selectedLine ? createPurchaseOrderLineKey(selectedLine.CD_FIRM, selectedLine.NO_PO, selectedLine.NO_LINE) : undefined} checkedRowKeys={checkedLineKeys} onCheckedRowKeysChange={setCheckedLineKeys} selectionMode="multiple" showCheckboxes showFooter showRowNumbers cellErrors={toValidationCellErrors(issues)} onRowClick={(row) => selectDetail(row.NO_LINE)} onCellValueChange={(row, field, value) => updateLine(row.NO_PO, row.NO_LINE, field as LineField, value)} /></section><div className="sales-order-total-summary" data-testid="purchase-total-summary"><span>수량 {money.format(totals.QT_PO)}</span><span>공급가 {money.format(totals.AM_SUPPLY)}</span><span>부가세 {money.format(totals.AM_VAT)}</span><strong>합계 {money.format(totals.AM_TOTAL)}</strong></div></main></div><ErpLookupDialog columns={partnerColumns} dataTestId="po-partner-lookup" emptyMessage="거래처가 없습니다." height={480} onClose={() => setPartnerOpen(false)} onSelect={choosePartner} open={partnerOpen} rowKey={(row) => `${row.CD_FIRM}::${row.CD_PARTNER}`} rows={mockPartners.filter((row) => row.YN_USE === "Y")} searchFields={["CD_PARTNER", "NM_PARTNER"]} title="거래처 Lookup" width={700} /><ErpLookupDialog columns={itemColumns} dataTestId="po-item-lookup" emptyMessage="품목이 없습니다." height={480} onClose={() => setItemOpen(false)} onSelect={chooseItem} open={itemOpen} rowKey={(row) => `${row.CD_FIRM}::${row.CD_ITEM}`} rows={mockItems.filter((row) => row.YN_USE === "Y" && (!selectedHeader || row.CD_FIRM === selectedHeader.CD_FIRM))} searchFields={["CD_ITEM", "NM_ITEM"]} title="품목 Lookup" width={700} /><ErpLookupDialog columns={warehouseColumns} dataTestId="po-warehouse-lookup" emptyMessage="창고가 없습니다." height={480} onClose={() => setWarehouseOpen(false)} onSelect={chooseWarehouse} open={warehouseOpen} rowKey={(row) => `${row.CD_FIRM}::${row.CD_WH}`} rows={mockWarehouses.filter((row) => !selectedHeader || row.CD_FIRM === selectedHeader.CD_FIRM)} searchFields={["CD_WH", "NM_WH"]} title="창고 Lookup" width={700} /></>;
}
