import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Building2, ChevronRight, Plus, Rows3, Save, Search, Trash2 } from "lucide-react";
import { ErpDataGrid, registerErpDataGridPasteHandler } from "../../components/common/ErpDataGrid";
import { DirtyIndicator } from "../../components/common/DirtyIndicator";
import type { ErpDataGridCellValue, ErpDataGridColumn, ErpDataGridFocusRequest, ErpDataGridPasteRequest } from "../../components/common/ErpDataGrid";
import { parseErpGridPasteDate, parseErpGridPasteNumber } from "../../components/common/erpGridPaste";
import { ErpLookupDialog } from "../../components/common/ErpLookupDialog";
import { ErpValidationSummary } from "../../components/common/ErpValidationSummary";
import { PageToolbar } from "../../components/common/PageToolbar";
import { SearchPanel } from "../../components/common/SearchPanel";
import { sortValidationIssues, toValidationCellErrors, type ValidationIssue } from "../../components/common/validation/validation";
import { useCrudPage } from "../../hooks/useCrudPage";
import { useConfirm } from "../../hooks/useConfirm";
import { useDirtyState } from "../../hooks/useDirtyState";
import { useNotification } from "../../hooks/useNotification";
import { useMasterDetailSelection } from "../../hooks/useMasterDetailSelection";
import type { ScreenModuleId } from "../../screenModules";
import type { Item } from "../common-code/item/types";
import type { Partner } from "../common-code/partner/types";
import type { Warehouse } from "../common-code/warehouse/types";
import type { PurchaseOrderDataAdapter } from "./purchaseOrderDataAdapter";
import type { PurchaseOrderHeader, PurchaseOrderLine, PurchaseOrderStatus } from "./types";
import { calculatePurchaseOrderLineAmounts, calculatePurchaseOrderTotals, createPurchaseOrderHeaderKey, createPurchaseOrderLineKey } from "./utils";
import { validatePurchaseOrders } from "./validation";
interface PurchaseOrderRegistrationProps {
    adapter: PurchaseOrderDataAdapter;
    onNavigate: (page: "sales" | "purchase" | "work" | "development" | "ai") => void;
    onScreenIntent?: (screen: ScreenModuleId) => void;
    showDevelopmentDataManager?: boolean;
}
type HeaderField = Exclude<keyof PurchaseOrderHeader, "NO_PO">;
type LineField = Exclude<keyof PurchaseOrderLine, "CD_FIRM" | "NO_PO" | "NO_LINE" | "AM_SUPPLY" | "AM_VAT" | "AM_TOTAL">;
const statuses: PurchaseOrderStatus[] = ["미확정", "확정", "승인", "진행", "마감", "취소"];
const money = new Intl.NumberFormat("ko-KR");
const purchaseHeaderValidationOrder = ["CD_FIRM", "DT_PO", "CD_PARTNER"];
const purchaseLineValidationOrder = ["CD_ITEM", "QT_PO", "UM_PO", "DT_DLV", "CD_WH"];
const partnerColumns: readonly ErpDataGridColumn<Partner>[] = [{ field: "CD_FIRM", headerName: "회사", width: 80 }, { field: "CD_PARTNER", headerName: "거래처코드", width: 130 }, { field: "NM_PARTNER", headerName: "거래처명", width: 180 }, { field: "YN_USE", headerName: "사용", width: 70 }];
const itemColumns: readonly ErpDataGridColumn<Item>[] = [{ field: "CD_ITEM", headerName: "품목코드", width: 120 }, { field: "NM_ITEM", headerName: "품목명", width: 180 }, { field: "STND_ITEM", headerName: "규격", width: 150 }, { field: "UNIT_ITEM", headerName: "단위", width: 70 }];
const warehouseColumns: readonly ErpDataGridColumn<Warehouse>[] = [{ field: "CD_FIRM", headerName: "회사", width: 80 }, { field: "CD_WH", headerName: "창고코드", width: 120 }, { field: "NM_WH", headerName: "창고명", width: 180 }, { field: "YN_USE", headerName: "사용", width: 70 }];
function today() { return new Date().toISOString().slice(0, 10); }
function numberValue(value: ErpDataGridCellValue) { const result = Number(value); return Number.isFinite(result) ? result : 0; }
function emptyHeader(no: string): PurchaseOrderHeader { return { CD_FIRM: "1000", NO_PO: no, DT_PO: today(), CD_PARTNER: "", NM_PARTNER: "", CD_EMP: "E-001", NM_EMP: "Buyer", CD_CURRENCY: "KRW", RT_EXCHANGE: 1, ST_PO: "미확정", DC_RMK: "" }; }
function emptyLine(header: PurchaseOrderHeader, number: number): PurchaseOrderLine { return { CD_FIRM: header.CD_FIRM, NO_PO: header.NO_PO, NO_LINE: number, CD_ITEM: "", NM_ITEM: "", STND_ITEM: "", UNIT_ITEM: "", QT_PO: 0, UM_PO: 0, AM_SUPPLY: 0, AM_VAT: 0, AM_TOTAL: 0, DT_DLV: today(), CD_WH: "", NM_WH: "", DC_RMK: "" }; }
export function PurchaseOrderRegistration({ adapter, onNavigate, onScreenIntent, showDevelopmentDataManager = false }: PurchaseOrderRegistrationProps) {
    const screenIntentProps = (screen: ScreenModuleId) => ({
        onMouseEnter: () => onScreenIntent?.(screen),
        onFocus: () => onScreenIntent?.(screen),
        onPointerDown: () => onScreenIntent?.(screen)
    });
    const [headers, setHeaders] = useState<PurchaseOrderHeader[]>([]);
    const [lines, setLines] = useState<PurchaseOrderLine[]>([]);
    const latestHeaders = useRef<PurchaseOrderHeader[]>(headers);
    const latestLines = useRef<PurchaseOrderLine[]>(lines);
    const detailRequestVersion = useRef(0);
    const persistedPurchaseOrderKeys = useRef(new Set<string>());
    const savedSelectionKeyRef = useRef<string | null>(null);
    const lineLookupKeyRef = useRef<string | null>(null);
    const partnerLookupOrderNoRef = useRef<string | null>(null);
    const { selectedMasterKey: selectedNoPo, selectedDetailKey: selectedLineNo, selectMaster, selectDetail } = useMasterDetailSelection<string, number | null>("", null);
    const { isLoading, isSaving, operation, message, setMessage, setFeatureMessage, executeCreate, executeDelete, executeSave, executeSearch } = useCrudPage();
    const [checkedLineKeys, setCheckedLineKeys] = useState<string[]>([]);
    const [partnerOpen, setPartnerOpen] = useState(false);
    const [itemOpen, setItemOpen] = useState(false);
    const [warehouseOpen, setWarehouseOpen] = useState(false);
    const [partners, setPartners] = useState<Partner[]>([]);
    const [items, setItems] = useState<Item[]>([]);
    const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
    const mockPartners = partners;
    const mockItems = items;
    const mockWarehouses = warehouses;
    const [filters, setFilters] = useState({ firm: "1000", from: "2026-07-01", to: "2026-07-31", no: "", partner: "", status: "" });
    const [tempSequence, setTempSequence] = useState(1);
    const [validationAttempted, setValidationAttempted] = useState(false);
    const [headerFocusRequest, setHeaderFocusRequest] = useState<ErpDataGridFocusRequest | null>(null);
    const [lineFocusRequest, setLineFocusRequest] = useState<ErpDataGridFocusRequest | null>(null);
    const validationFocusRequestId = useRef(0);
    const { confirm } = useConfirm();
    const { isDirty, markDirty, clearDirty } = useDirtyState({ label: "발주 등록", saving: isSaving });
    const { notify } = useNotification();
    const selectedHeader = headers.find((header) => header.NO_PO === selectedNoPo);
    const selectedLine = lines.find((line) => line.NO_PO === selectedNoPo && line.NO_LINE === selectedLineNo);
    const issues = useMemo(() => sortValidationIssues(validatePurchaseOrders(headers, lines), { headerFields: purchaseHeaderValidationOrder, detailFields: purchaseLineValidationOrder }), [headers, lines]);
    const displayedIssues = validationAttempted ? issues : [];
    const visibleHeaders = useMemo(() => headers.filter((header) => header.NO_PO === savedSelectionKeyRef.current || header.NO_PO.startsWith("TEMP_PO_") || ((!filters.firm || header.CD_FIRM === filters.firm) && (!filters.no || header.NO_PO.includes(filters.no)) && (!filters.partner || header.CD_PARTNER.includes(filters.partner)) && (!filters.status || header.ST_PO === filters.status) && (!filters.from || header.DT_PO >= filters.from) && (!filters.to || header.DT_PO <= filters.to))), [filters, headers]);
    const selectedLines = lines.filter((line) => line.NO_PO === selectedNoPo).sort((a, b) => a.NO_LINE - b.NO_LINE);
    const checkedLines = selectedLines.filter((line) => checkedLineKeys.includes(createPurchaseOrderLineKey(line.CD_FIRM, line.NO_PO, line.NO_LINE)));
    const deleteTargetLines = checkedLines.length > 0 ? checkedLines : selectedLine ? [selectedLine] : [];
    const totals = calculatePurchaseOrderTotals(selectedLines);
    useLayoutEffect(() => {
        latestHeaders.current = headers;
        latestLines.current = lines;
    }, [headers, lines]);
    useEffect(() => {
        savedSelectionKeyRef.current = null;
    }, [filters]);
    const focusValidationIssue = (issue: ValidationIssue | undefined) => {
        if (!issue || !issue.rowKey || !issue.field || (issue.scope !== "header" && issue.scope !== "line"))
            return;
        const request = { rowKey: issue.rowKey, field: issue.field, requestId: ++validationFocusRequestId.current };
        if (issue.scope === "header") setHeaderFocusRequest(request);
        else setLineFocusRequest(request);
    };
    useLayoutEffect(() => { if (!visibleHeaders.some((header) => header.NO_PO === selectedNoPo))
        selectMaster(visibleHeaders[0]?.NO_PO ?? ""); }, [selectMaster, selectedNoPo, visibleHeaders]);
    useEffect(() => {
        let cancelled = false;
        void Promise.all([adapter.getPartners(), adapter.getItems(), adapter.getWarehouses()]).then(([nextPartners, nextItems, nextWarehouses]) => {
            if (cancelled) return;
            setPartners(nextPartners);
            setItems(nextItems);
            setWarehouses(nextWarehouses);
        });
        return () => { cancelled = true; };
    }, [adapter]);
    const confirmDiscardChanges = () => isDirty ? confirm({ title: "저장하지 않은 변경사항", message: "저장하지 않은 변경사항이 있습니다.", description: "계속하면 변경사항이 사라집니다.", confirmLabel: "변경사항 폐기", cancelLabel: "계속 편집", danger: true }) : Promise.resolve(true);
    const selectHeader = async (header: PurchaseOrderHeader) => {
        if (header.NO_PO !== selectedNoPo && isDirty && !(await confirmDiscardChanges())) return;
        if (header.NO_PO !== selectedNoPo) { setValidationAttempted(false); clearDirty(); }
        selectMaster(header.NO_PO);
        setCheckedLineKeys([]);
        if (header.NO_PO.startsWith("TEMP_PO_")) return;
        const requestVersion = ++detailRequestVersion.current;
        const document = await adapter.getDetail(header.CD_FIRM, header.NO_PO);
        if (requestVersion !== detailRequestVersion.current) return;
        setHeaders((current) => current.map((row) => row.NO_PO === header.NO_PO ? document.Header : row));
        setLines((current) => [...current.filter((line) => line.NO_PO !== header.NO_PO), ...document.Lines]);
    };
    const updateHeader = (no: string, field: HeaderField, value: ErpDataGridCellValue) => {
        detailRequestVersion.current += 1;
        markDirty();
        setHeaders((current) => {
            const nextHeaders = current.map((header) => header.NO_PO === no ? { ...header, [field]: field === "RT_EXCHANGE" ? numberValue(value) : String(value ?? "") } as PurchaseOrderHeader : header);
            latestHeaders.current = nextHeaders;
            return nextHeaders;
        });
    };
    const updateLine = (no: string, lineNo: number, field: LineField, value: ErpDataGridCellValue) => { detailRequestVersion.current += 1; markDirty(); setLines((current) => { const nextLines = current.map((line) => { if (line.NO_PO !== no || line.NO_LINE !== lineNo)
        return line; if (field === "QT_PO" || field === "UM_PO") {
        const next = { ...line, [field]: numberValue(value) };
        return { ...next, ...calculatePurchaseOrderLineAmounts(next.QT_PO, next.UM_PO) };
    } return { ...line, [field]: String(value ?? "") }; }); latestLines.current = nextLines; return nextLines; }); };
    const handleLinePaste = (request: ErpDataGridPasteRequest<PurchaseOrderLine>) => {
        if (!selectedHeader) return { error: "발주정보를 먼저 선택하세요." };
        const fields = request.columns.map((column) => column.field);
        if (fields.some((field) => field === "CD_FIRM" || field === "NO_PO" || field === "NO_LINE" || field === "AM_SUPPLY" || field === "AM_VAT" || field === "AM_TOTAL")) return { error: "수정할 수 없는 열이 포함되어 있습니다." };
        const draftLines = selectedLines.map((line) => ({ ...line }));
        let nextLineNo = draftLines.length === 0 ? 1 : Math.max(...draftLines.map((line) => line.NO_LINE)) + 1;
        while (draftLines.length < request.startRowIndex + request.matrix.length) {
            draftLines.push(emptyLine(selectedHeader, nextLineNo));
            nextLineNo += 1;
        }
        try {
            request.matrix.forEach((values, rowOffset) => {
                let nextLine = { ...draftLines[request.startRowIndex + rowOffset] };
                let selectedItem: Item | undefined;
                let selectedWarehouse: Warehouse | undefined;
                values.forEach((value, columnOffset) => {
                    const column = request.columns[columnOffset];
                    const field = fields[columnOffset] as LineField;
                    if (field === "CD_ITEM") {
                        selectedItem = mockItems.find((item) => item.CD_FIRM === nextLine.CD_FIRM && item.CD_ITEM === value.trim() && item.YN_USE === "Y");
                        if (!selectedItem) throw new Error(`${rowOffset + 1}행 품목코드에 존재하지 않는 코드가 있습니다.`);
                        nextLine.CD_ITEM = selectedItem.CD_ITEM;
                        return;
                    }
                    if (field === "CD_WH") {
                        selectedWarehouse = mockWarehouses.find((warehouse) => warehouse.CD_FIRM === nextLine.CD_FIRM && warehouse.CD_WH === value.trim());
                        if (!selectedWarehouse) throw new Error(`${rowOffset + 1}행 창고코드에 존재하지 않는 코드가 있습니다.`);
                        nextLine.CD_WH = selectedWarehouse.CD_WH;
                        return;
                    }
                    const nextValue = column.dataType === "number" ? parseErpGridPasteNumber(value) : column.dataType === "date" ? parseErpGridPasteDate(value) : value;
                    nextLine = { ...nextLine, [field]: nextValue };
                });
                if (selectedItem) nextLine = { ...nextLine, CD_ITEM: selectedItem.CD_ITEM, NM_ITEM: selectedItem.NM_ITEM, STND_ITEM: selectedItem.STND_ITEM, UNIT_ITEM: selectedItem.UNIT_ITEM };
                if (selectedWarehouse) nextLine = { ...nextLine, CD_WH: selectedWarehouse.CD_WH, NM_WH: selectedWarehouse.NM_WH };
                draftLines[request.startRowIndex + rowOffset] = { ...nextLine, ...calculatePurchaseOrderLineAmounts(nextLine.QT_PO, nextLine.UM_PO) };
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "입력값을 확인하세요.";
            return { error: errorMessage };
        }
        const nextLines = [...lines.filter((line) => line.CD_FIRM !== selectedHeader.CD_FIRM || line.NO_PO !== selectedHeader.NO_PO), ...draftLines];
        latestLines.current = nextLines;
        detailRequestVersion.current += 1;
        setLines(nextLines);
        markDirty();
        return undefined;
    };
    useLayoutEffect(() => registerErpDataGridPasteHandler("purchase-line-grid", handleLinePaste, (pasteMessage) => notify("error", pasteMessage)), [handleLinePaste, notify]);
    const handleSearch = async () => {
        if (!(await confirmDiscardChanges())) return;
        setFeatureMessage("");
        await executeSearch({
            execute: () => adapter.search({
                companyCode: filters.firm,
                dateFrom: filters.from,
                dateTo: filters.to,
                purchaseOrderNo: filters.no,
                partner: filters.partner,
                status: filters.status
            }),
            onSuccess: (result) => {
                savedSelectionKeyRef.current = null;
                const matchedHeaders = result.headers.filter((header) =>
                    (!filters.firm || header.CD_FIRM === filters.firm) &&
                    (!filters.no || header.NO_PO.includes(filters.no)) &&
                    (!filters.partner || header.CD_PARTNER.includes(filters.partner)) &&
                    (!filters.status || header.ST_PO === filters.status) &&
                    (!filters.from || header.DT_PO >= filters.from) &&
                    (!filters.to || header.DT_PO <= filters.to)
                );
                setHeaders(result.headers);
                setLines(result.lines);
                result.headers.forEach((header) => persistedPurchaseOrderKeys.current.add(createPurchaseOrderHeaderKey(header.CD_FIRM, header.NO_PO)));
                selectMaster(matchedHeaders[0]?.NO_PO ?? "");
                setCheckedLineKeys([]);
                setValidationAttempted(false);
                clearDirty();
                notify(matchedHeaders.length ? "success" : "info", matchedHeaders.length ? "조회되었습니다." : "조회된 데이터가 없습니다.");
            },
            successMessage: "조회되었습니다.",
            errorMessage: "조회 중 오류가 발생했습니다. 다시 시도하세요."
        });
    };
    const handleNew = async () => {
        if (!(await confirmDiscardChanges())) return;
        const no = `TEMP_PO_${String(tempSequence).padStart(3, "0")}`;
        const header = emptyHeader(no);
        setFeatureMessage("");
        await executeCreate({
            execute: () => {
                setHeaders((current) => [header, ...current]);
                selectMaster(no);
                setCheckedLineKeys([]);
                setTempSequence((sequence) => sequence + 1);
                setValidationAttempted(false);
                clearDirty();
                return header;
            },
            onSuccess: () => notify("success", "신규 발주가 추가되었습니다."),
            successMessage: "신규 발주가 추가되었습니다."
        });
    };
    const handleAddLine = () => {
        if (!selectedHeader) {
            setMessage("선택된 항목이 없습니다.");
            notify("info", "선택된 항목이 없습니다.");
            return;
        }
        const nextLineNo = selectedLines.length === 0 ? 1 : Math.max(...selectedLines.map((line) => line.NO_LINE)) + 1;
        const next = emptyLine(selectedHeader, nextLineNo);
        setLines((current) => [...current, next]);
        selectDetail(next.NO_LINE);
        setCheckedLineKeys([]);
        markDirty();
    };
    const handleDeleteLine = async () => {
        if (deleteTargetLines.length === 0) {
            setMessage("선택된 항목이 없습니다.");
            notify("info", "선택된 항목이 없습니다.");
            return;
        }
        const targetKeys = new Set(deleteTargetLines.map((line) => createPurchaseOrderLineKey(line.CD_FIRM, line.NO_PO, line.NO_LINE)));
        if (!(await confirm({ title: "발주상세 삭제", message: `선택한 발주상세 ${targetKeys.size}건을 삭제하시겠습니까?`, confirmLabel: "삭제", danger: true })))
            return;
        setLines((current) => {
            const retained = current.filter((line) => !targetKeys.has(createPurchaseOrderLineKey(line.CD_FIRM, line.NO_PO, line.NO_LINE)));
            const selectedOrderLines = retained
                .filter((line) => line.NO_PO === selectedNoPo)
                .sort((left, right) => left.NO_LINE - right.NO_LINE);
            const nextLineNumbers = new Map(
                selectedOrderLines.map((line, index) => [
                    createPurchaseOrderLineKey(line.CD_FIRM, line.NO_PO, line.NO_LINE),
                    index + 1
                ])
            );
            return retained.map((line) => {
                if (line.NO_PO !== selectedNoPo) return line;
                const nextLineNo = nextLineNumbers.get(createPurchaseOrderLineKey(line.CD_FIRM, line.NO_PO, line.NO_LINE));
                return nextLineNo === undefined ? line : { ...line, NO_LINE: nextLineNo };
            });
        });
        if (selectedLine && targetKeys.has(createPurchaseOrderLineKey(selectedLine.CD_FIRM, selectedLine.NO_PO, selectedLine.NO_LINE))) {
            selectDetail(null);
        }
        setCheckedLineKeys((current) => current.filter((key) => !targetKeys.has(key)));
        markDirty();
        notify("success", `선택한 ${deleteTargetLines.length}건이 삭제되었습니다.`);
    };
    const handleSave = async () => { const headerToSave = latestHeaders.current.find((header) => header.NO_PO === selectedNoPo); const linesToSave = latestLines.current.filter((line) => line.NO_PO === selectedNoPo).sort((left, right) => left.NO_LINE - right.NO_LINE); const currentIssues = sortValidationIssues(validatePurchaseOrders(latestHeaders.current, latestLines.current), { headerFields: purchaseHeaderValidationOrder, detailFields: purchaseLineValidationOrder }); if (!headerToSave) {
        setMessage("저장할 발주정보를 선택하세요.");
        notify("info", "선택된 항목이 없습니다.");
        return;
    } if (currentIssues.length) {
        const validationMessage = `저장할 수 없습니다. 입력값 ${currentIssues.length}건을 확인하세요.`;
        setValidationAttempted(true);
        setMessage(validationMessage);
        focusValidationIssue(currentIssues[0]);
        return;
    } if (!(await confirm({ title: "저장 확인", message: "저장하시겠습니까?", confirmLabel: "저장" })))
        return; setFeatureMessage(""); await executeSave({
            execute: () => {
                const document = { Header: headerToSave, Lines: linesToSave };
                const key = createPurchaseOrderHeaderKey(headerToSave.CD_FIRM, headerToSave.NO_PO);
                return persistedPurchaseOrderKeys.current.has(key)
                    ? adapter.update(headerToSave.CD_FIRM, headerToSave.NO_PO, document)
                    : adapter.create(document);
            },
            onSuccess: (document) => {
                savedSelectionKeyRef.current = document.Header.NO_PO;
                persistedPurchaseOrderKeys.current.add(createPurchaseOrderHeaderKey(document.Header.CD_FIRM, document.Header.NO_PO));
                setHeaders((current) => current.map((header) => header.NO_PO === selectedNoPo ? document.Header : header));
                setLines((current) => current.map((line) => line.NO_PO === selectedNoPo ? document.Lines.find((savedLine) => savedLine.NO_LINE === line.NO_LINE) ?? line : line));
                selectMaster(document.Header.NO_PO);
                setCheckedLineKeys([]);
                setValidationAttempted(false);
                clearDirty();
            },
            successMessage: "저장되었습니다.",
            errorMessage: "저장 중 오류가 발생했습니다. 입력값을 확인하고 다시 시도하세요."
        }); };
    const navigateWorkOrder = () => onNavigate("work");
    const navigateAiSolutionCenter = () => onNavigate("ai");
    const handleDelete = async () => { if (!selectedNoPo || !selectedHeader) {
        setMessage("선택된 항목이 없습니다.");
        notify("info", "선택된 항목이 없습니다.");
        return;
    } if (!(await confirm({ title: "발주 삭제", message: `발주번호 ${selectedNoPo}을 삭제하시겠습니까?`, confirmLabel: "삭제", danger: true })))
        return; const orderToDelete = selectedHeader; setFeatureMessage(""); await executeDelete({ execute: async () => { await adapter.delete(orderToDelete.CD_FIRM, orderToDelete.NO_PO); return orderToDelete; }, onSuccess: (deletedOrder) => { persistedPurchaseOrderKeys.current.delete(createPurchaseOrderHeaderKey(deletedOrder.CD_FIRM, deletedOrder.NO_PO)); setHeaders((current) => current.filter((header) => header.NO_PO !== deletedOrder.NO_PO)); setLines((current) => current.filter((line) => line.NO_PO !== deletedOrder.NO_PO)); selectMaster(""); setCheckedLineKeys([]); setValidationAttempted(false); clearDirty(); }, successMessage: "삭제되었습니다.", errorMessage: "삭제 중 오류가 발생했습니다. 다시 시도하세요." }); };
    const choosePartner = (partner: Partner) => { const targetOrderNo = partnerLookupOrderNoRef.current ?? selectedHeader?.NO_PO; if (!targetOrderNo) {
        notify("info", "선택된 항목이 없습니다.");
        return;
    } setHeaders((current) => current.map((header) => header.NO_PO === targetOrderNo ? { ...header, CD_PARTNER: partner.CD_PARTNER, NM_PARTNER: partner.NM_PARTNER } : header)); selectMaster(targetOrderNo); partnerLookupOrderNoRef.current = null; markDirty(); notify("success", "거래처 선택이 반영되었습니다."); setPartnerOpen(false); };
    const chooseItem = (item: Item) => { const targetKey = lineLookupKeyRef.current; if (!targetKey) {
        notify("info", "선택된 항목이 없습니다.");
        return;
    } setLines((current) => current.map((line) => createPurchaseOrderLineKey(line.CD_FIRM, line.NO_PO, line.NO_LINE) === targetKey ? { ...line, CD_ITEM: item.CD_ITEM, NM_ITEM: item.NM_ITEM, STND_ITEM: item.STND_ITEM, UNIT_ITEM: item.UNIT_ITEM } : line)); markDirty(); notify("success", "품목 선택이 반영되었습니다."); lineLookupKeyRef.current = null; setItemOpen(false); };
    const chooseWarehouse = (warehouse: Warehouse) => { const targetKey = lineLookupKeyRef.current; if (!targetKey) {
        notify("info", "선택된 항목이 없습니다.");
        return;
    } setLines((current) => current.map((line) => createPurchaseOrderLineKey(line.CD_FIRM, line.NO_PO, line.NO_LINE) === targetKey ? { ...line, CD_WH: warehouse.CD_WH, NM_WH: warehouse.NM_WH } : line)); markDirty(); notify("success", "창고 선택이 반영되었습니다."); lineLookupKeyRef.current = null; setWarehouseOpen(false); };
    const handleLineLookupCellDoubleClick = (line: PurchaseOrderLine, field: keyof PurchaseOrderLine) => {
        if (isLoading || isSaving || itemOpen || warehouseOpen) return;
        lineLookupKeyRef.current = createPurchaseOrderLineKey(line.CD_FIRM, line.NO_PO, line.NO_LINE);
        selectDetail(line.NO_LINE);
        if (field === "CD_ITEM") setItemOpen(true);
        if (field === "CD_WH") setWarehouseOpen(true);
    };
    const headerColumns: readonly ErpDataGridColumn<PurchaseOrderHeader>[] = [
        { field: "CD_FIRM", headerName: "회사", width: 80, editable: true },
        { field: "NO_PO", headerName: "발주번호", width: 145, readOnly: true },
        { field: "DT_PO", headerName: "발주일자", width: 120, editable: true, dataType: "date" },
        { field: "CD_PARTNER", headerName: "거래처", width: 120, editable: true, lookup: { instruction: "더블클릭하여 거래처를 선택합니다." } },
        { field: "NM_PARTNER", headerName: "거래처명", width: 150, editable: true, lookup: { instruction: "더블클릭하여 거래처를 선택합니다." } },
        { field: "CD_EMP", headerName: "담당자", width: 90, editable: true },
        { field: "NM_EMP", headerName: "담당자명", width: 110, editable: true },
        { field: "CD_CURRENCY", headerName: "통화", width: 70, editable: true },
        { field: "RT_EXCHANGE", headerName: "환율", width: 90, editable: true, dataType: "number" },
        {
            field: "ST_PO",
            headerName: "상태",
            width: 118,
            editable: true,
            editor: ({ value, onChange }) => <div className="erp-data-grid__status-editor"><select className="erp-data-grid__editor" onChange={(event) => onChange(event.target.value)} value={String(value)}>{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select><span className={`badge status-${String(value) === "미확정" ? "new" : String(value) === "진행" ? "progress" : String(value) === "마감" || String(value) === "취소" ? "closed" : "confirmed"}`}>{String(value)}</span></div>
        },
        { field: "DC_RMK", headerName: "비고", width: 160, editable: true }
    ];
    const lineColumns: readonly ErpDataGridColumn<PurchaseOrderLine>[] = [{ field: "NO_LINE", headerName: "행", width: 55, readOnly: true }, { field: "CD_ITEM", headerName: "품목코드", width: 110, editable: true, lookup: { instruction: "더블클릭하여 품목을 선택합니다." } }, { field: "NM_ITEM", headerName: "품목명", width: 150, editable: true }, { field: "STND_ITEM", headerName: "규격", width: 130, editable: true }, { field: "UNIT_ITEM", headerName: "단위", width: 60, editable: true }, { field: "QT_PO", headerName: "수량", width: 85, editable: true, dataType: "number", sum: true }, { field: "UM_PO", headerName: "단가", width: 100, editable: true, dataType: "number" }, { field: "AM_SUPPLY", headerName: "공급가", width: 105, readOnly: true, dataType: "number", sum: true, formatter: (value) => money.format(Number(value)) }, { field: "AM_VAT", headerName: "부가세", width: 95, readOnly: true, dataType: "number", sum: true, formatter: (value) => money.format(Number(value)) }, { field: "AM_TOTAL", headerName: "합계", width: 110, readOnly: true, dataType: "number", sum: true, formatter: (value) => money.format(Number(value)) }, { field: "DT_DLV", headerName: "납기일", width: 115, editable: true, dataType: "date" }, { field: "CD_WH", headerName: "창고", width: 100, editable: true, lookup: { instruction: "더블클릭하여 창고를 선택합니다." } }, { field: "NM_WH", headerName: "창고명", width: 130, editable: true }, { field: "DC_RMK", headerName: "비고", width: 140, editable: true }];
    return <>
      <div className="erp-shell">
        <aside className="side-nav"><div className="brand"><Building2 size={20}/><strong>SMART ERP</strong></div><nav><div className="menu-title">영업관리</div><button className="menu-item" data-testid="nav-sales-order" onClick={() => onNavigate("sales")}>수주등록</button><div className="menu-title">구매관리</div><div className="menu-group"><ChevronRight size={14}/><span>발주관리</span></div><button className="menu-item active" data-testid="nav-purchase-order">발주등록</button><div className="menu-title">생산관리</div><div className="menu-group"><ChevronRight size={14}/><span>작업지시관리</span></div><button {...screenIntentProps("work")} className="menu-item" data-testid="nav-work-order" onClick={() => void navigateWorkOrder()} type="button">작업지시등록</button><div className="menu-title">AI 솔루션</div><button {...screenIntentProps("ai")} className="menu-item" data-testid="nav-ai-solution-center" onClick={() => void navigateAiSolutionCenter()} type="button">AI 솔루션 센터</button>{showDevelopmentDataManager && <><div className="menu-title">개발 도구</div><button {...screenIntentProps("development")} className="menu-item" data-testid="nav-development-data" onClick={() => onNavigate("development")} type="button">테스트 데이터 관리</button></>}</nav></aside>
        <main aria-busy={isLoading || isSaving} className="workbench" data-processing-state={operation}>
          <header className="page-header"><div><h1 data-testid="purchase-page-title">발주등록</h1><p>PUR_POH / PUR_POL mock 입력 샘플</p><DirtyIndicator dataTestId="purchase-order-dirty-indicator" dirty={isDirty} /></div><PageToolbar actions={[{ dataTestId: "po-btn-search", label: isLoading ? "조회 중..." : "조회", icon: <Search size={15}/>, onClick: handleSearch, disabled: isSaving }, { dataTestId: "po-btn-new", label: "신규", icon: <Plus size={15}/>, onClick: handleNew, disabled: isLoading || isSaving }, { dataTestId: "po-btn-add-line", label: "행추가", icon: <Rows3 size={15}/>, onClick: handleAddLine, disabled: isLoading || isSaving }, { dataTestId: "po-btn-delete-line", label: "행삭제", icon: <Trash2 size={15}/>, onClick: handleDeleteLine, disabled: isLoading || isSaving }, { dataTestId: "po-btn-save", label: operation === "saving" ? "저장 중..." : "저장", icon: <Save size={15}/>, onClick: handleSave, disabled: isLoading || isSaving, variant: "primary" }, { dataTestId: "po-btn-delete", label: operation === "deleting" ? "삭제 중..." : "삭제", icon: <Trash2 size={15}/>, onClick: handleDelete, disabled: isLoading || isSaving, variant: "danger" }]}/></header>
          <SearchPanel message={message}><label>회사<input data-testid="po-filter-firm" value={filters.firm} onChange={(event) => setFilters({ ...filters, firm: event.target.value })}/></label><label>발주일 From<input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })}/></label><label>발주일 To<input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })}/></label><label>발주번호<input data-testid="po-filter-no" value={filters.no} onChange={(event) => setFilters({ ...filters, no: event.target.value })}/></label><label>거래처<input data-testid="po-filter-partner" value={filters.partner} onChange={(event) => setFilters({ ...filters, partner: event.target.value })}/></label><label>상태<select data-testid="po-filter-status" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">전체</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label></SearchPanel>
          <ErpValidationSummary dataTestId="purchase-validation-summary" issues={displayedIssues} onFocusFirst={() => focusValidationIssue(displayedIssues[0])} />
      <section className="grid-section top-grid"><div className="section-title"><h2>발주정보</h2><button data-testid="po-btn-partner-lookup" onClick={() => { partnerLookupOrderNoRef.current = selectedHeader?.NO_PO ?? null; setPartnerOpen(true); }} type="button">거래처 도움창</button></div><ErpDataGrid columns={headerColumns} dataTestId="purchase-header-grid" rows={visibleHeaders} rowKey={(row) => createPurchaseOrderHeaderKey(row.CD_FIRM, row.NO_PO)} selectedRowKey={selectedHeader ? createPurchaseOrderHeaderKey(selectedHeader.CD_FIRM, selectedHeader.NO_PO) : undefined} selectionMode="single" showFooter showRowNumbers cellErrors={toValidationCellErrors(displayedIssues)} focusRequest={headerFocusRequest} lookupDisabled={isLoading || isSaving || partnerOpen || itemOpen || warehouseOpen} onLookupCellDoubleClick={(row, column) => { if (column.field === "CD_PARTNER" || column.field === "NM_PARTNER") { detailRequestVersion.current += 1; partnerLookupOrderNoRef.current = row.NO_PO; selectMaster(row.NO_PO); setPartnerOpen(true); } }} onRowClick={selectHeader} onCellValueChange={(row, field, value) => { if (field !== "NO_PO") updateHeader(row.NO_PO, field as HeaderField, value); }}/></section>
          <section className="grid-section bottom-grid"><div className="section-title"><h2>발주상세</h2></div><ErpDataGrid columns={lineColumns} dataTestId="purchase-line-grid" rows={selectedLines} rowKey={(row) => createPurchaseOrderLineKey(row.CD_FIRM, row.NO_PO, row.NO_LINE)} selectedRowKey={selectedLine ? createPurchaseOrderLineKey(selectedLine.CD_FIRM, selectedLine.NO_PO, selectedLine.NO_LINE) : undefined} checkedRowKeys={checkedLineKeys} onCheckedRowKeysChange={setCheckedLineKeys} selectionMode="multiple" showCheckboxes showFooter showRowNumbers cellErrors={toValidationCellErrors(displayedIssues)} focusRequest={lineFocusRequest} lookupDisabled={isLoading || isSaving || itemOpen || warehouseOpen} onLookupCellDoubleClick={(row, column) => handleLineLookupCellDoubleClick(row, column.field)} onRowClick={(row) => selectDetail(row.NO_LINE)} onCellValueChange={(row, field, value) => updateLine(row.NO_PO, row.NO_LINE, field as LineField, value)}/></section>
          <div className="sales-order-total-summary" data-testid="purchase-total-summary"><span>수량 {money.format(totals.QT_PO)}</span><span>공급가 {money.format(totals.AM_SUPPLY)}</span><span>부가세 {money.format(totals.AM_VAT)}</span><strong>합계 {money.format(totals.AM_TOTAL)}</strong></div>
        </main>
      </div>
      <ErpLookupDialog columns={partnerColumns} dataTestId="po-partner-lookup" emptyMessage="거래처가 없습니다." height={480} onClose={() => { partnerLookupOrderNoRef.current = null; setPartnerOpen(false); }} onSelect={choosePartner} open={partnerOpen} rowKey={(row) => `${row.CD_FIRM}::${row.CD_PARTNER}`} rows={mockPartners.filter((row) => row.YN_USE === "Y")} searchFields={["CD_PARTNER", "NM_PARTNER"]} title="거래처 도움창" width={700}/>
      <ErpLookupDialog columns={itemColumns} dataTestId="po-item-lookup" emptyMessage="품목이 없습니다." height={480} onClose={() => { lineLookupKeyRef.current = null; setItemOpen(false); }} onSelect={chooseItem} open={itemOpen} rowKey={(row) => `${row.CD_FIRM}::${row.CD_ITEM}`} rows={mockItems.filter((row) => row.YN_USE === "Y" && (!selectedHeader || row.CD_FIRM === selectedHeader.CD_FIRM))} searchFields={["CD_ITEM", "NM_ITEM"]} title="품목 도움창" width={700}/>
      <ErpLookupDialog columns={warehouseColumns} dataTestId="po-warehouse-lookup" emptyMessage="창고가 없습니다." height={480} onClose={() => { lineLookupKeyRef.current = null; setWarehouseOpen(false); }} onSelect={chooseWarehouse} open={warehouseOpen} rowKey={(row) => `${row.CD_FIRM}::${row.CD_WH}`} rows={mockWarehouses.filter((row) => !selectedHeader || row.CD_FIRM === selectedHeader.CD_FIRM)} searchFields={["CD_WH", "NM_WH"]} title="창고 도움창" width={700}/>
    </>;
}
